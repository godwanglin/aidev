import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { logRequest } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resolveUpstreamConnection } from "@/lib/router";
import { isComboModel, findCombo, resolveComboCandidates, markComboModelCooldown } from "@/lib/combo-router";
import { checkTierModelAccess } from "@/lib/credits";

interface ImageGenerationBody {
  prompt: string;
  model?: string;
  n?: number;
  quality?: "standard" | "hd";
  response_format?: "b64_json" | "url";
  size?: "1024x1024" | "1024x1792" | "1792x1024" | "512x512" | string;
  style?: "vivid" | "natural";
}

/**
 * Handler for POST /v1/images/generations (Strict OpenAI-compatible Image Generation API)
 * Enforces isPublic validation, tier checking, real-time credit deduction, and combo routing without silent fallback.
 */
export async function handleImagesGenerations(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const reqPath = "/v1/images/generations";

  // 1. Authenticate Internal API Key
  const auth = await authenticateApiKey(req.headers.get("authorization"), req.headers.get("x-api-key"));
  if (!auth.success || !auth.apiKey) {
    const status = auth.status || 401;
    return NextResponse.json(
      { error: { message: auth.error, type: "auth_error", code: status } },
      { status }
    );
  }

  // 2. Strict credit balance check (reject 402 if <= 0, exempt ADMIN)
  const clientUserRole = (auth.apiKey as any)?.user?.role || "USER";
  const clientUserCredit = Number((auth.apiKey as any)?.user?.creditBalance ?? 0);
  if (clientUserRole !== "ADMIN" && clientUserCredit <= 0) {
    return NextResponse.json(
      {
        error: {
          message: "Saldo credit Anda telah habis (0 CR). Silakan top up saldo atau perbarui paket langganan Anda.",
          type: "insufficient_credits",
          code: 402,
        },
      },
      { status: 402 }
    );
  }

  const rawBody = await req.text().catch(() => "{}");
  let body: ImageGenerationBody;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid JSON request body", type: "invalid_request_error", code: 400 } },
      { status: 400 }
    );
  }

  const prompt = (body.prompt || "").trim();
  if (!prompt) {
    return NextResponse.json(
      { error: { message: "The 'prompt' field is required.", type: "invalid_request_error", code: 400 } },
      { status: 400 }
    );
  }

  const requestedModel = (body.model || "").trim();
  if (!requestedModel) {
    return NextResponse.json(
      { error: { message: "The 'model' field is required.", type: "invalid_request_error", code: 400 } },
      { status: 400 }
    );
  }

  const apiKeyId = auth.apiKey.id;
  const userTier = (auth.apiKey as any)?.user?.subscriptionTier || "FREE";

  // 3. Subscription Tier Model Whitelist Check
  const tierAccess = await checkTierModelAccess(userTier, requestedModel);
  if (!tierAccess.allowed) {
    return NextResponse.json(
      {
        error: {
          message: tierAccess.reason || `Model '${requestedModel}' tidak tersedia di paket ${userTier}.`,
          type: "tier_access_denied",
          code: 403,
        },
      },
      { status: 403 }
    );
  }

  // 4. Strict Public Validation: Only isPublic === true allowed (unless ADMIN)
  const isCombo = await isComboModel(requestedModel);
  let candidates: string[] = [];
  let creditsCostPerImage = 500; // Default 500 credits per image generation

  if (isCombo) {
    const combo = await findCombo(requestedModel);
    if (!combo || !combo.isActive) {
      return NextResponse.json(
        { error: { message: `Model '${requestedModel}' tidak ditemukan atau sedang tidak aktif.`, type: "invalid_request_error", code: 404 } },
        { status: 404 }
      );
    }

    if (!combo.isPublic && clientUserRole !== "ADMIN") {
      return NextResponse.json(
        { error: { message: `Model '${requestedModel}' is private and not accessible publicly.`, type: "permission_error", code: 403 } },
        { status: 403 }
      );
    }

    if (combo.costPerImage && combo.costPerImage > 0) {
      creditsCostPerImage = combo.costPerImage;
    }

    const comboInfo = await resolveComboCandidates(requestedModel);
    candidates = comboInfo?.candidates && comboInfo.candidates.length > 0 ? comboInfo.candidates : [];
  } else {
    // Check in AiModel table
    const aiModel = await prisma.aiModel.findFirst({
      where: { modelId: requestedModel, isActive: true },
    });

    if (aiModel) {
      if (!aiModel.isPublic && clientUserRole !== "ADMIN") {
        return NextResponse.json(
          { error: { message: `Model '${requestedModel}' is private and not accessible publicly.`, type: "permission_error", code: 403 } },
          { status: 403 }
        );
      }
      candidates = [aiModel.modelId];
    } else if (clientUserRole === "ADMIN") {
      // Allow direct upstream pass for ADMIN
      candidates = [requestedModel];
    } else {
      return NextResponse.json(
        { error: { message: `Model '${requestedModel}' is not public or not available.`, type: "permission_error", code: 403 } },
        { status: 403 }
      );
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json(
      { error: { message: `No active upstream provider available for model '${requestedModel}'.`, type: "upstream_error", code: 503 } },
      { status: 503 }
    );
  }

  // 5. Upstream Execution with Combo Rotation (NO FALLBACK)
  let lastErrorStatus = 502;
  let lastErrorMessage = "Failed to generate image from upstream provider.";
  let lastErrorBody: any = null;

  for (let idx = 0; idx < candidates.length; idx++) {
    const candidateModel = candidates[idx];
    try {
      const resolvedRoute = await resolveUpstreamConnection({ model: candidateModel });
      if (!resolvedRoute || !resolvedRoute.baseUrl || !resolvedRoute.apiKey) {
        continue;
      }

      const upstreamUrl = `${resolvedRoute.baseUrl.replace(/\/$/, "")}/images/generations`;
      const candidatePayload = {
        ...body,
        model: resolvedRoute.upstreamModel || candidateModel,
      };

      const upstreamRes = await fetch(upstreamUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resolvedRoute.apiKey}`,
        },
        body: JSON.stringify(candidatePayload),
        signal: AbortSignal.timeout(90000),
      });

      if (upstreamRes.ok) {
        const data = await upstreamRes.json();

        // Real-time token / credit deduction log
        logRequest({
          apiKeyId,
          path: reqPath,
          method: "POST",
          statusCode: 200,
          model: requestedModel,
          promptTokens: Math.ceil(prompt.length / 4) || 20,
          completionTokens: 1000,
          totalTokens: (Math.ceil(prompt.length / 4) || 20) + 1000,
          creditsCost: creditsCostPerImage,
          durationMs: Date.now() - startTime,
        });

        return NextResponse.json(data);
      }

      // If upstream failed, capture error details and mark cooldown
      lastErrorStatus = upstreamRes.status;
      try {
        lastErrorBody = await upstreamRes.json();
        lastErrorMessage = lastErrorBody?.error?.message || lastErrorBody?.message || `Upstream returned HTTP ${upstreamRes.status}`;
      } catch {
        lastErrorMessage = (await upstreamRes.text().catch(() => "")) || `Upstream returned HTTP ${upstreamRes.status}`;
      }

      markComboModelCooldown(candidateModel, 60);
    } catch (err: any) {
      lastErrorMessage = err?.message || "Connection timeout to image upstream.";
      markComboModelCooldown(candidateModel, 60);
    }
  }

  // All candidates failed — return authoritative error to client (NO SILENT FALLBACK)
  logRequest({
    apiKeyId,
    path: reqPath,
    method: "POST",
    statusCode: lastErrorStatus >= 400 ? lastErrorStatus : 502,
    model: requestedModel,
    promptTokens: Math.ceil(prompt.length / 4) || 20,
    completionTokens: 0,
    totalTokens: Math.ceil(prompt.length / 4) || 20,
    creditsCost: 0,
    durationMs: Date.now() - startTime,
  });

  return NextResponse.json(
    lastErrorBody || {
      error: {
        message: lastErrorMessage,
        type: "upstream_error",
        code: lastErrorStatus,
      },
    },
    { status: lastErrorStatus >= 400 ? lastErrorStatus : 502 }
  );
}
