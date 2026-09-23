import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/auth";
import { logRequest } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { resolveUpstreamConnection, markConnectionCooldown, logUpstreamRequest } from "@/lib/router";
import { adminLogger, extractProviderErrorMessage } from "@/lib/admin-logger";
import { normalizeRequestBody } from "@/lib/model-normalizer";
import { isAntigravityProvider, dispatchAntigravityChat } from "@/lib/adapters/antigravity";
import { isCodexProvider, dispatchCodexChat, dispatchCodexResponsesDirect } from "@/lib/adapters/codex";
import { convertAnthropicToOpenAiMessages, transformChatResponseToAnthropic } from "@/lib/adapters/anthropic";
import {
  convertResponsesToChatMessages,
  convertResponsesToolsToChatTools,
  transformChatResponseToResponses,
  extractCustomToolNames,
  extractAllResponsesTools,
} from "@/lib/adapters/responses";
import { isComboModel, resolveComboCandidates, markComboModelCooldown } from "@/lib/combo-router";
import { isRtkEnabled } from "@/lib/rtk/config";
import { compressMessages, compressResponsesInput } from "@/lib/rtk/compressor";
import { createKeepAliveTransform, SSE_HEADERS } from "@/sse/utils/keepalive";

const UPSTREAM_BASE = (process.env.UPSTREAM_BASE_URL || "").replace(/\/$/, "");
const UPSTREAM_KEY = process.env.UPSTREAM_API_KEY || "";
const MIN_REASONING_HEADROOM = 16384;

function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 3.5));
}

/**
 * For direct model requests (non-combo), respects the client's requested model strictly
 * without silent cross-provider hijacking. Multi-model failovers are handled via explicit Combos.
 */
function buildSmartFallbackCandidates(primaryModel: string): string[] {
  return [primaryModel];
}

export interface ChatHandlerOptions {
  subPath: "chat/completions" | "responses" | "messages";
}

/**
 * Core Chat Handler adopted from 9router strategy.
 * Handles chat completions, responses API, and messages API with unified multi-model fallback,
 * token headroom injection, and resilient streaming.
 */
export async function handleChat(req: NextRequest, options: ChatHandlerOptions): Promise<Response> {
  const startTime = Date.now();
  const subPath = options.subPath;
  const reqPath = `/v1/${subPath}`;

  let rawBody: string | undefined;
  let parsedModel: string | undefined;
  let clientWantsStream = false;
  let estimatedPromptTokens = 0;
  let customToolNames: Set<string> | undefined;

  const MAX_PAYLOAD_SIZE = 100 * 1024 * 1024; // 100MB limit matching 9router / Next.js proxy
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (contentLength > MAX_PAYLOAD_SIZE) {
    return NextResponse.json(
      { error: { message: "Request payload exceeds maximum limit of 100MB", type: "invalid_request_error" } },
      { status: 413 }
    );
  }

  try {
    const rawText = await req.text();
    if (rawText) {
      rawBody = rawText;
      estimatedPromptTokens = estimateTokens(rawText);
      try {
        const jsonBody = JSON.parse(rawText);
        parsedModel = jsonBody.model;
        clientWantsStream = Boolean(jsonBody.stream);

        if (Array.isArray(jsonBody.messages)) {
          const combinedMsg = jsonBody.messages
            .map((m: any) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content || "")))
            .join(" ");
          const sys = typeof jsonBody.system === "string" ? jsonBody.system : "";
          estimatedPromptTokens = estimateTokens(`${sys} ${combinedMsg}`);
        } else if (jsonBody.input) {
          const inputStr = typeof jsonBody.input === "string" ? jsonBody.input : JSON.stringify(jsonBody.input);
          const instStr = typeof jsonBody.instructions === "string" ? jsonBody.instructions : "";
          estimatedPromptTokens = estimateTokens(`${instStr} ${inputStr}`);
        }
      } catch {}
    }
  } catch {
    return NextResponse.json(
      { error: { message: "Invalid request payload", type: "invalid_request_error" } },
      { status: 400 }
    );
  }

  console.log("[INCOMING CHAT REQ]", { subPath, parsedModel, clientWantsStream, estimatedPromptTokens });

  // 1. Authenticate Internal Key
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
          type: "auth_error",
          code: 402,
        },
      },
      { status: 402 }
    );
  }

  const apiKeyId = auth.apiKey.id;
  const clientUserId = (auth.apiKey as any)?.user?.id || (auth.apiKey as any)?.userId || null;

  // 3. RTK Token Saver Context Compression
  let tokensSavedRtk = 0;
  const clientRtkHeader = req.headers.get("x-rtk-token-saver");
  const rtkActive = clientRtkHeader === "false"
    ? false
    : clientRtkHeader === "true"
    ? true
    : await isRtkEnabled();

  if (rtkActive && rawBody) {
    try {
      const jsonBody = JSON.parse(rawBody);
      if (Array.isArray(jsonBody.messages)) {
        const { compressedMessages, tokensSaved } = compressMessages(jsonBody.messages);
        if (tokensSaved > 0) {
          jsonBody.messages = compressedMessages;
          rawBody = JSON.stringify(jsonBody);
          tokensSavedRtk = tokensSaved;
        }
      } else if (jsonBody.input) {
        const { compressedBody, tokensSaved } = compressResponsesInput(jsonBody);
        if (tokensSaved > 0) {
          rawBody = JSON.stringify(compressedBody);
          tokensSavedRtk = tokensSaved;
        }
      }
    } catch {}
  }

  // 4. Subscription Tier Model Whitelist Check
  const userTier = (auth.apiKey as any)?.user?.subscriptionTier || "FREE";
  if (parsedModel) {
    const { checkTierModelAccess } = await import("@/lib/credits");
    const tierAccess = await checkTierModelAccess(userTier, parsedModel);
    if (!tierAccess.allowed) {
      return NextResponse.json(
        {
          error: {
            message: tierAccess.reason || `Model '${parsedModel}' tidak tersedia di paket ${userTier}.`,
            type: "tier_access_denied",
            code: 403,
          },
        },
        { status: 403 }
      );
    }
  }

  const userEmail = (auth.apiKey as any)?.user?.email || auth.apiKey.name || "client";
  const formattedBalance = new Intl.NumberFormat("id-ID").format(Math.round(clientUserCredit));
  adminLogger.clientRequest({
    account: userEmail,
    role: clientUserRole === "ADMIN" ? "Admin" : clientUserRole,
    balance: `${formattedBalance} CR`,
    tier: userTier,
    subPath: reqPath,
    model: parsedModel || undefined,
    stream: clientWantsStream,
  });

  // 5. Resolve Combo or Smart Fallback Candidates (9router auto-rotate / fallback)
  const isCombo = parsedModel ? await isComboModel(parsedModel) : false;
  const comboInfo = isCombo && parsedModel ? await resolveComboCandidates(parsedModel) : null;

  const candidates: string[] = comboInfo && comboInfo.candidates.length > 0
    ? comboInfo.candidates
    : parsedModel
    ? buildSmartFallbackCandidates(parsedModel)
    : ["default"];

  console.log("[DEBUG CANDIDATES]", { parsedModel, isCombo, candidates });

  for (let candIdx = 0; candIdx < candidates.length; candIdx++) {
    const candidateModel = candidates[candIdx];
    const isLastCandidate = candIdx === candidates.length - 1;
    const candidateStartTime = Date.now();
    const upstreamLogModel = (isCombo && parsedModel && !parsedModel.includes(" -> "))
      ? (parsedModel !== candidateModel ? `${parsedModel} -> ${candidateModel}` : candidateModel)
      : candidateModel;

    // Prepare candidate raw body if model changed
    let candidateRawBody = rawBody;
    if (parsedModel && parsedModel !== candidateModel && rawBody) {
      try {
        const p = JSON.parse(rawBody);
        p.model = candidateModel;
        candidateRawBody = JSON.stringify(p);
      } catch {}
    }

    // Resolve Upstream Provider Connection
    const resolvedRoute = await resolveUpstreamConnection({ model: candidateModel });
    let targetBase: string;
    let targetKey: string;
    let activeConnectionId: string | null = null;
    let activeProvider: string = "DEFAULT";

    const clientRequestedModel = parsedModel || candidateModel || "default";

    if (resolvedRoute && resolvedRoute.baseUrl && resolvedRoute.apiKey) {
      targetBase = resolvedRoute.baseUrl.replace(/\/$/, "");
      targetKey = resolvedRoute.apiKey;
      activeConnectionId = resolvedRoute.connectionId;
      activeProvider = resolvedRoute.provider;
    } else if (UPSTREAM_BASE && UPSTREAM_KEY) {
      targetBase = UPSTREAM_BASE;
      targetKey = UPSTREAM_KEY;
    } else {
      if (!isLastCandidate) {
        continue;
      }
      return NextResponse.json(
        {
          error: {
            message: `Tidak ada provider connection aktif untuk model '${clientRequestedModel}'. Pastikan koneksi provider telah dikonfigurasi di dashboard.`,
            type: "provider_not_found",
            code: 503,
          },
        },
        { status: 503 }
      );
    }

    console.log("[DISPATCH TRACE]", {
      candidateModel,
      activeProvider,
      targetBase,
      hasTargetKey: Boolean(targetKey),
      resolvedRoute: resolvedRoute ? { id: resolvedRoute.connectionId, provider: resolvedRoute.provider, authType: resolvedRoute.authType } : null,
    });

    const upstreamTargetModel = resolvedRoute?.upstreamModel || candidateModel;
    const upstreamAccount = resolvedRoute?.accountEmail || resolvedRoute?.connectionName || "direct";
    const fmtFrom = subPath === "messages" ? "anthropic" : subPath === "responses" ? "openai" : "openai";
    const fmtTo = isCodexProvider(activeProvider, resolvedRoute?.authType)
      ? "openai"
      : isAntigravityProvider(activeProvider)
      ? "gemini"
      : activeProvider === "ANTHROPIC"
      ? "anthropic"
      : "openai";

    // Prepare chat payload if client requested Anthropic messages or OpenAI responses
    let candidateChatBody = candidateRawBody;
    let parsedCandidateJson: any = {};
    try {
      parsedCandidateJson = JSON.parse(candidateRawBody || "{}");
    } catch {}

    const msgCount = Array.isArray(parsedCandidateJson?.messages)
      ? parsedCandidateJson.messages.length
      : Array.isArray(parsedCandidateJson?.input)
      ? parsedCandidateJson.input.length
      : 1;
    const toolCount = subPath === "responses"
      ? extractAllResponsesTools(parsedCandidateJson).length
      : Array.isArray(parsedCandidateJson?.tools)
      ? parsedCandidateJson.tools.length
      : Array.isArray(parsedCandidateJson?.functions)
      ? parsedCandidateJson.functions.length
      : 0;

    const displayTargetModel = candidateModel !== clientRequestedModel
      ? candidateModel
      : (resolvedRoute?.upstreamModel || candidateModel);

    adminLogger.post({
      model: clientRequestedModel,
      upstreamModel: displayTargetModel,
      fromFormat: fmtFrom,
      toFormat: fmtTo,
      stream: clientWantsStream,
      msgCount,
      toolCount,
      account: upstreamAccount,
    });

    if (subPath === "messages") {
      const openAiMessages = convertAnthropicToOpenAiMessages(parsedCandidateJson);
      const chatPayload = {
        ...parsedCandidateJson,
        model: candidateModel,
        messages: openAiMessages,
        stream: clientWantsStream,
      };
      delete chatPayload.system;

      // Ensure token headroom for reasoning
      if (!chatPayload.max_tokens || chatPayload.max_tokens < MIN_REASONING_HEADROOM) {
        chatPayload.max_tokens = MIN_REASONING_HEADROOM;
      }

      candidateChatBody = JSON.stringify(chatPayload);
      parsedCandidateJson = chatPayload;
    } else if (subPath === "responses") {
      // Auto-inject Codex standard tools (apply_patch, exec) across turns
      const allResponsesTools = extractAllResponsesTools(parsedCandidateJson);
      customToolNames = extractCustomToolNames(parsedCandidateJson);

      if (!isCodexProvider(activeProvider, resolvedRoute?.authType)) {
        const openAiMessages = convertResponsesToChatMessages(parsedCandidateJson);
        const chatPayload: any = {
          ...parsedCandidateJson,
          model: candidateModel,
          messages: openAiMessages,
          stream: clientWantsStream,
        };

        if (allResponsesTools.length > 0) {
          chatPayload.tools = convertResponsesToolsToChatTools(allResponsesTools);
          const lastMsg = openAiMessages.length > 0 ? openAiMessages[openAiMessages.length - 1] : null;
          const isAfterToolResponse = lastMsg?.role === "tool";
          const lastUserMsg = [...openAiMessages].reverse().find((m: any) => m.role === "user")?.content || "";
          const userText = typeof lastUserMsg === "string" ? lastUserMsg.toLowerCase() : "";
          const isActionIntent = /edit|ubah|ganti|buat|bikin|hapus|delete|remove|create|fix|pasang|install|update|tulis|write|patch|run|exec|jalanin|test|cek|periksa|gas|gasken|gaskan|mana|kok gak|plenger|bisa gak|terusin|lanjut|apasih|blm|belum|ayo|hajar/.test(userText);

          if (chatPayload.tools.length > 0) {
            const isThinkingModel = activeProvider === "DEEPSEEK" || candidateModel.toLowerCase().includes("deepseek") || candidateModel.toLowerCase().includes("reasoner");
            if (!isThinkingModel && !isAfterToolResponse && (isActionIntent || chatPayload.tool_choice === "required")) {
              chatPayload.tool_choice = "required";
            } else if (!chatPayload.tool_choice || chatPayload.tool_choice === "required") {
              chatPayload.tool_choice = "auto";
            }
          } else {
            delete chatPayload.tools;
            delete chatPayload.tool_choice;
          }
        } else {
          delete chatPayload.tools;
          delete chatPayload.tool_choice;
        }

        delete chatPayload.input;
        delete chatPayload.instructions;
        delete chatPayload.previous_response_id;
        delete chatPayload.truncation;
        delete chatPayload.store;
        delete chatPayload.text;
        delete chatPayload.reasoning;
        delete chatPayload.include;
        delete chatPayload.prompt_cache_key;
        delete chatPayload.client_metadata;
        delete chatPayload.parallel_tool_calls;
        delete chatPayload.turn_context;
        delete chatPayload.personality;
        delete chatPayload.service_tier;
        delete chatPayload.background;

        // Ensure token headroom is at least 16384 for thinking process
        const clientMax = chatPayload.max_output_tokens || chatPayload.max_tokens;
        chatPayload.max_tokens = Math.max(Number(clientMax || 0), MIN_REASONING_HEADROOM);
        delete chatPayload.max_output_tokens;

        candidateChatBody = JSON.stringify(chatPayload);
        parsedCandidateJson = chatPayload;
      }
    } else {
      // subPath === "chat/completions"
      if (parsedCandidateJson.max_completion_tokens !== undefined) {
        if (parsedCandidateJson.max_completion_tokens < MIN_REASONING_HEADROOM) {
          parsedCandidateJson.max_completion_tokens = MIN_REASONING_HEADROOM;
        }
        delete parsedCandidateJson.max_tokens;
        candidateChatBody = JSON.stringify(parsedCandidateJson);
      } else if (!parsedCandidateJson.max_tokens || parsedCandidateJson.max_tokens < MIN_REASONING_HEADROOM) {
        const isOModel = /^(o1|o3|o4)/i.test(candidateModel || "");
        if (isOModel) {
          parsedCandidateJson.max_completion_tokens = MIN_REASONING_HEADROOM;
          delete parsedCandidateJson.max_tokens;
        } else {
          parsedCandidateJson.max_tokens = MIN_REASONING_HEADROOM;
        }
        candidateChatBody = JSON.stringify(parsedCandidateJson);
      }
    }

    // Direct Native 1: OpenAI Codex Responses API
    if (subPath === "responses" && isCodexProvider(activeProvider, resolvedRoute?.authType) && targetKey) {
      try {
        const response = await dispatchCodexResponsesDirect({
          rawBody: candidateRawBody || "{}",
          parsedBody: JSON.parse(candidateRawBody || "{}"),
          accessToken: targetKey,
          connectionId: activeConnectionId || "",
          model: candidateModel || "gpt-5.5",
          clientRequestedModel,
          upstreamLogModel,
          clientApiKeyId: apiKeyId,
          clientUserId,
          reqPath,
          clientWantsStream,
        });

        if ((response.status === 429 || response.status >= 500) && !isLastCandidate) {
          adminLogger.fallback({
            fromModel: candidateModel,
            toModel: candidates[candIdx + 1],
            reason: `Codex returned HTTP ${response.status}`,
            account: upstreamAccount,
          });
          markComboModelCooldown(candidateModel, comboInfo?.combo.cooldownSeconds || 60);
          continue;
        }

        return response;
      } catch (err: any) {
        if (!isLastCandidate) {
          adminLogger.fallback({
            fromModel: candidateModel,
            toModel: candidates[candIdx + 1],
            reason: `Codex exception: ${err.message}`,
            account: upstreamAccount,
          });
          markComboModelCooldown(candidateModel, comboInfo?.combo.cooldownSeconds || 60);
          continue;
        }
        throw err;
      }
    }

    // Direct Native 2: Anthropic Messages API
    if (subPath === "messages" && (activeProvider === "ANTHROPIC" || activeProvider === "CLAUDE_CODE") && targetKey) {
      try {
        const forwardHeaders = new Headers();
        forwardHeaders.set("x-api-key", targetKey);
        forwardHeaders.set("anthropic-version", "2023-06-01");
        forwardHeaders.set("Content-Type", "application/json");

        const targetUrl = `${targetBase}/messages`;
        const upstreamRes = await fetch(targetUrl, {
          method: "POST",
          headers: forwardHeaders,
          body: candidateRawBody,
        });

        if (!upstreamRes.ok) {
          const errorText = await upstreamRes.text().catch(() => "");
          const providerErrMsg = extractProviderErrorMessage(errorText);
          const detailedErr = providerErrMsg
            ? `Anthropic returned HTTP ${upstreamRes.status}: ${providerErrMsg}`
            : `Anthropic returned HTTP ${upstreamRes.status}`;

          if ((upstreamRes.status === 429 || upstreamRes.status >= 500) && !isLastCandidate) {
            adminLogger.fallback({
              fromModel: candidateModel,
              toModel: candidates[candIdx + 1],
              reason: detailedErr,
              account: upstreamAccount,
            });
            markComboModelCooldown(candidateModel, comboInfo?.combo.cooldownSeconds || 60);
            logUpstreamRequest({
              connectionId: activeConnectionId,
              provider: activeProvider,
              model: upstreamLogModel,
              clientApiKeyId: apiKeyId,
              clientUserId,
              promptTokens: estimatedPromptTokens || 15,
              completionTokens: 0,
              totalTokens: estimatedPromptTokens || 15,
              latencyMs: Date.now() - candidateStartTime,
              statusCode: upstreamRes.status,
              isFailover: true,
              failoverReason: `Auto-fallback: ${detailedErr}`,
            }).catch(() => {});
            continue;
          }

          adminLogger.error({
            message: detailedErr,
            durationMs: Date.now() - startTime,
            model: clientRequestedModel,
            upstreamModel: candidateModel,
            status: upstreamRes.status,
            account: userEmail,
          });

          return new Response(errorText, {
            status: upstreamRes.status,
            headers: { "Content-Type": "application/json" }
          });
        }

        adminLogger.done({
          durationMs: Date.now() - startTime,
          promptTokens: estimatedPromptTokens || 15,
          completionTokens: 25,
          model: clientRequestedModel,
          upstreamModel: upstreamLogModel,
          account: userEmail,
        });

        logUpstreamRequest({
          connectionId: activeConnectionId,
          provider: activeProvider,
          model: upstreamLogModel,
          clientApiKeyId: apiKeyId,
          clientUserId,
          promptTokens: estimatedPromptTokens || 15,
          completionTokens: 25,
          totalTokens: (estimatedPromptTokens || 15) + 25,
          latencyMs: Date.now() - candidateStartTime,
          statusCode: upstreamRes.status,
          isFailover: false,
        }).catch(() => {});

        logRequest({
          apiKeyId,
          path: reqPath,
          method: "POST",
          statusCode: upstreamRes.status,
          model: clientRequestedModel,
          promptTokens: estimatedPromptTokens || 15,
          completionTokens: 25,
          totalTokens: (estimatedPromptTokens || 15) + 25,
          durationMs: Date.now() - startTime,
        });

        return upstreamRes;
      } catch (err: any) {
        if (!isLastCandidate) {
          adminLogger.fallback({
            fromModel: candidateModel,
            toModel: candidates[candIdx + 1],
            reason: `Anthropic exception: ${err.message}`,
            account: upstreamAccount,
          });
          markComboModelCooldown(candidateModel, comboInfo?.combo.cooldownSeconds || 60);
          continue;
        }
        adminLogger.error({
          message: `Anthropic error: ${err.message}`,
          durationMs: Date.now() - startTime,
          model: clientRequestedModel,
          upstreamModel: candidateModel,
          account: userEmail,
        });
        throw err;
      }
    }

    // Provider Dispatch 3: Google Antigravity
    if (isAntigravityProvider(activeProvider) && targetKey) {
      try {
        const response = await dispatchAntigravityChat({
          rawBody: candidateChatBody || "{}",
          parsedBody: parsedCandidateJson,
          accessToken: targetKey,
          connectionId: activeConnectionId || "",
          model: candidateModel || "gemini-2.5-flash",
          clientRequestedModel,
          upstreamLogModel,
          clientApiKeyId: apiKeyId,
          clientUserId,
          reqPath,
          clientWantsStream,
          tokensSavedRtk,
        });

        let finalAgResponse = response;

        if (response.status === 429 && activeConnectionId) {
          adminLogger.fallback({
            fromModel: candidateModel,
            reason: `Antigravity HTTP 429 on connection ${activeConnectionId} -> switching to backup connection`,
            account: upstreamAccount,
          });
          markConnectionCooldown(activeConnectionId, 300).catch(() => {});
          prisma.providerConnection.update({
            where: { id: activeConnectionId },
            data: { syncStatus: "EXHAUSTED" },
          }).catch(() => {});

          const nextRoute = await resolveUpstreamConnection({ model: candidateModel, provider: activeProvider });
          if (nextRoute && nextRoute.connectionId !== activeConnectionId && nextRoute.apiKey) {
            const retryResponse = await dispatchAntigravityChat({
              rawBody: candidateChatBody || "{}",
              parsedBody: parsedCandidateJson,
              accessToken: nextRoute.apiKey,
              connectionId: nextRoute.connectionId,
              model: candidateModel || "gemini-2.5-flash",
              clientRequestedModel,
              upstreamLogModel,
              clientApiKeyId: apiKeyId,
              clientUserId,
              reqPath,
              clientWantsStream,
              tokensSavedRtk,
            });
            finalAgResponse = retryResponse;
          }
        }

        if ((finalAgResponse.status === 429 || finalAgResponse.status >= 500) && !isLastCandidate) {
          adminLogger.fallback({
            fromModel: candidateModel,
            toModel: candidates[candIdx + 1],
            reason: `Antigravity returned HTTP ${finalAgResponse.status}`,
            account: upstreamAccount,
          });
          markComboModelCooldown(candidateModel, comboInfo?.combo.cooldownSeconds || 60);
          continue;
        }

        if (!finalAgResponse.ok) {
          logRequest({
            apiKeyId,
            path: reqPath,
            method: "POST",
            statusCode: finalAgResponse.status,
            model: clientRequestedModel,
            promptTokens: estimatedPromptTokens || 15,
            completionTokens: 0,
            totalTokens: estimatedPromptTokens || 15,
            creditsCost: 0,
            durationMs: Date.now() - startTime,
          });
          return finalAgResponse;
        }

        if (subPath === "messages") {
          return await transformChatResponseToAnthropic(finalAgResponse, { model: clientRequestedModel, clientWantsStream });
        } else if (subPath === "responses") {
          return await transformChatResponseToResponses(finalAgResponse, {
            model: clientRequestedModel,
            upstreamModel: candidateModel,
            provider: activeProvider,
            clientWantsStream,
            customToolNames,
            hasTools: Boolean(parsedCandidateJson?.tools?.length),
            logContext: {
              apiKeyId,
              clientUserId,
              reqPath,
              startTime,
              estimatedPromptTokens,
            },
          });
        }

        return finalAgResponse;
      } catch (err: any) {
        if (!isLastCandidate) {
          adminLogger.fallback({
            fromModel: candidateModel,
            toModel: candidates[candIdx + 1],
            reason: `Antigravity exception: ${err.message}`,
            account: upstreamAccount,
          });
          markComboModelCooldown(candidateModel, comboInfo?.combo.cooldownSeconds || 60);
          continue;
        }
        adminLogger.error({
          message: `Antigravity error: ${err.message}`,
          durationMs: Date.now() - startTime,
          model: clientRequestedModel,
          upstreamModel: candidateModel,
          account: userEmail,
        });
        throw err;
      }
    }

    // Provider Dispatch 4: Standard Upstream (OpenAI / OpenRouter / DeepSeek / Claude / Gemini)
    const targetSubPath = (subPath === "responses" || subPath === "messages") ? "chat/completions" : subPath;
    const targetUrl = `${targetBase}/${targetSubPath}${req.nextUrl.search}`;

    const forwardHeaders = new Headers();
    forwardHeaders.set("Authorization", `Bearer ${targetKey}`);
    forwardHeaders.set("Content-Type", "application/json");
    if (targetKey.startsWith("AIza") || activeProvider === "GEMINI" || activeProvider === "GOOGLE") {
      forwardHeaders.set("x-goog-api-key", targetKey);
    }

    const { normalizedBody } = normalizeRequestBody(candidateChatBody || "{}");
    let bodyToSend = normalizedBody || candidateChatBody || "{}";

    // DeepSeek & Thinking Model payload sanitization (prevents upstream HTTP 400)
    const isDeepSeekOrThinking =
      activeProvider === "DEEPSEEK" ||
      candidateModel.toLowerCase().includes("deepseek") ||
      candidateModel.toLowerCase().includes("reasoner");

    if (isDeepSeekOrThinking) {
      try {
        const parsed = JSON.parse(bodyToSend);
        let modified = false;

        // 1. Thinking models strictly reject tool_choice: "required"
        if (parsed.tool_choice === "required") {
          parsed.tool_choice = "auto";
          modified = true;
        }

        // 2. Thinking models strictly require reasoning_content on all assistant messages
        if (Array.isArray(parsed.messages)) {
          for (const msg of parsed.messages) {
            if (msg && msg.role === "assistant" && msg.reasoning_content === undefined) {
              msg.reasoning_content = "";
              modified = true;
            }
          }
        }

        if (modified) {
          bodyToSend = JSON.stringify(parsed);
        }
      } catch {}
    }

    // Ensure clean upstream model name is sent to upstream provider (stripping custom prefixes like 'jrt/')
    if (resolvedRoute?.upstreamModel && resolvedRoute.upstreamModel !== candidateModel) {
      try {
        const parsed = JSON.parse(bodyToSend);
        parsed.model = resolvedRoute.upstreamModel;
        bodyToSend = JSON.stringify(parsed);
      } catch {}
    }

    try {
      const parsedSent = JSON.parse(bodyToSend);
      console.log("[DEBUG Upstream Req]", {
        targetUrl,
        subPath,
        model: candidateModel,
        toolsCount: parsedSent?.tools?.length,
        tool_choice: parsedSent?.tool_choice,
        last2Msgs: parsedSent?.messages?.slice(-2),
      });
    } catch {}

    try {
      const upstreamRes = await fetch(targetUrl, {
        method: "POST",
        headers: forwardHeaders,
        body: bodyToSend,
        signal: AbortSignal.timeout(180000),
      });

      const isUpstreamFailoverError =
        upstreamRes.status === 429 ||
        upstreamRes.status >= 500 ||
        upstreamRes.status === 404 ||
        upstreamRes.status === 400 ||
        upstreamRes.status === 401 ||
        upstreamRes.status === 403;

      if (!upstreamRes.ok) {
        const errorText = await upstreamRes.text().catch(() => "");
        const providerErrMsg = extractProviderErrorMessage(errorText);
        const detailedErr = providerErrMsg
          ? `Upstream HTTP ${upstreamRes.status} on ${candidateModel}: ${providerErrMsg}`
          : `Upstream HTTP ${upstreamRes.status} on ${candidateModel}`;

        if (isUpstreamFailoverError && !isLastCandidate) {
          adminLogger.fallback({
            fromModel: candidateModel,
            toModel: candidates[candIdx + 1],
            reason: detailedErr,
            account: upstreamAccount,
          });
          console.log("[FAILOVER TRIGGERED]", { status: upstreamRes.status, candidateModel, nextCandidate: candidates[candIdx + 1], error: providerErrMsg });
          markComboModelCooldown(candidateModel, comboInfo?.combo.cooldownSeconds || 60);
          if (activeConnectionId && (upstreamRes.status === 429 || upstreamRes.status === 401 || upstreamRes.status >= 500)) {
            markConnectionCooldown(activeConnectionId, 60).catch(() => {});
          }
          logUpstreamRequest({
            connectionId: activeConnectionId,
            provider: activeProvider,
            model: upstreamLogModel,
            clientApiKeyId: apiKeyId,
            clientUserId,
            promptTokens: estimatedPromptTokens,
            completionTokens: 0,
            totalTokens: estimatedPromptTokens,
            latencyMs: Date.now() - candidateStartTime,
            statusCode: upstreamRes.status,
            isFailover: true,
            failoverReason: `Auto-fallback: ${detailedErr}`,
          }).catch(() => {});
          continue;
        }

        console.log("[UPSTREAM ERROR FINAL]", { status: upstreamRes.status, candidateModel, errorText: errorText.slice(0, 300) });
        adminLogger.error({
          message: detailedErr,
          durationMs: Date.now() - startTime,
          model: clientRequestedModel,
          upstreamModel: candidateModel,
          status: upstreamRes.status,
          account: userEmail,
        });
        logRequest({
          apiKeyId,
          path: reqPath,
          method: "POST",
          statusCode: upstreamRes.status,
          model: parsedModel,
          promptTokens: estimatedPromptTokens || 15,
          completionTokens: 0,
          totalTokens: estimatedPromptTokens || 15,
          durationMs: Date.now() - startTime,
        });

        let clientMessage = "Layanan upstream AI sedang mengalami kendala. Silakan coba beberapa saat lagi.";
        if (upstreamRes.status === 429) {
          clientMessage = "Kapasitas model sedang penuh atau mencapai batas rate limit. Silakan coba beberapa saat lagi.";
        } else if (upstreamRes.status === 404) {
          clientMessage = `Model '${parsedModel || candidateModel}' sementara tidak tersedia di upstream.`;
        } else if (providerErrMsg) {
          clientMessage = providerErrMsg;
        }

        return NextResponse.json(
          {
            error: {
              message: clientMessage,
              type: upstreamRes.status === 429 ? "rate_limit_error" : "upstream_error",
              code: upstreamRes.status,
            },
          },
          { status: upstreamRes.status }
        );
      }

      // Case 1: Client explicitly requested Streaming (SSE)
      if (clientWantsStream && upstreamRes.body) {
        let promptTokens = 0;
        let completionTokens = 0;
        let totalTokens = 0;
        let generatedChars = 0;
        let firstTokenTime: number | null = null;

        const transformStream = new TransformStream({
          transform(chunk, controller) {
            let chunkToEnqueue = chunk;
            try {
              const text = new TextDecoder().decode(chunk);
              const lines = text.split("\n");
              let modified = false;
              const newLines = lines.map((line) => {
                const trimmed = line.trim();
                if (!trimmed || trimmed === "data: [DONE]") return line;

                const jsonStr = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
                try {
                  const data = JSON.parse(jsonStr);
                  const delta = data.choices?.[0]?.delta?.content || data.choices?.[0]?.delta?.reasoning_content || data.choices?.[0]?.delta?.reasoning || "";
                  if (delta) {
                    generatedChars += delta.length;
                    if (!firstTokenTime) {
                      firstTokenTime = Date.now();
                    }
                  }

                  if (data.model && parsedModel && data.model !== parsedModel) {
                    data.model = parsedModel;
                    modified = true;
                  }

                  if (data.usage) {
                    promptTokens = data.usage.prompt_tokens || promptTokens;
                    completionTokens = data.usage.completion_tokens || completionTokens;
                    totalTokens = data.usage.total_tokens || (promptTokens + completionTokens);

                    if (tokensSavedRtk > 0) {
                      data.usage.prompt_tokens = (data.usage.prompt_tokens || 0) + tokensSavedRtk;
                      data.usage.total_tokens = (data.usage.total_tokens || 0) + tokensSavedRtk;
                      modified = true;
                    }
                  }

                  if (modified) {
                    return (trimmed.startsWith("data: ") ? "data: " : "") + JSON.stringify(data);
                  }
                } catch {}
                return line;
              });

              if (modified) {
                chunkToEnqueue = new TextEncoder().encode(newLines.join("\n"));
              }
            } catch {}
            controller.enqueue(chunkToEnqueue);
          },
          flush() {
            const durationMs = Date.now() - startTime;
            const ttftMs = firstTokenTime ? firstTokenTime - startTime : undefined;
            const hasGenerated = completionTokens > 0 || generatedChars > 0;
            const upstreamPromptTokens = promptTokens || Math.max(1, (estimatedPromptTokens || 10) - tokensSavedRtk);
            const upstreamCompletionTokens = hasGenerated ? (completionTokens || Math.max(1, Math.ceil(generatedChars / 3.5))) : 0;
            const upstreamTotalTokens = totalTokens || (upstreamPromptTokens + upstreamCompletionTokens);

            const clientPromptTokens = upstreamPromptTokens + tokensSavedRtk;
            const clientTotalTokens = upstreamTotalTokens + tokensSavedRtk;
            const finalStatus = hasGenerated ? upstreamRes.status : 502;

            if (finalStatus < 400) {
              adminLogger.done({
                durationMs,
                ttftMs,
                promptTokens: clientPromptTokens,
                completionTokens: upstreamCompletionTokens,
                rtkSavings: tokensSavedRtk,
                model: clientRequestedModel,
                upstreamModel: upstreamLogModel,
                account: userEmail,
              });
            } else {
              adminLogger.error({
                message: `Stream finished with status ${finalStatus}`,
                durationMs,
                model: clientRequestedModel,
                upstreamModel: upstreamLogModel,
                account: userEmail,
              });
            }

            logUpstreamRequest({
              connectionId: activeConnectionId,
              provider: activeProvider,
              model: upstreamLogModel,
              clientApiKeyId: apiKeyId,
              clientUserId,
              promptTokens: upstreamPromptTokens,
              completionTokens: upstreamCompletionTokens,
              totalTokens: upstreamTotalTokens,
              tokensSavedRtk,
              latencyMs: durationMs,
              statusCode: finalStatus,
              isFailover: false,
            }).catch(() => {});

            if (subPath !== "responses") {
              logRequest({
                apiKeyId,
                path: reqPath,
                method: "POST",
                statusCode: finalStatus,
                model: clientRequestedModel,
                promptTokens: clientPromptTokens,
                completionTokens: upstreamCompletionTokens,
                totalTokens: clientTotalTokens,
                creditsCost: finalStatus >= 400 ? 0 : undefined,
                durationMs,
              });
            }
          },
        });

        // Combine SSE stream with keep-alive heartbeat (9router pattern)
        const keepAlive = createKeepAliveTransform(12000);
        const pipedStream = upstreamRes.body.pipeThrough(transformStream).pipeThrough(keepAlive);

        const streamResponse = new Response(pipedStream, {
          status: upstreamRes.status,
          headers: SSE_HEADERS,
        });

        if (subPath === "messages") {
          return await transformChatResponseToAnthropic(streamResponse, { model: clientRequestedModel, clientWantsStream: true });
        } else if (subPath === "responses") {
          return await transformChatResponseToResponses(streamResponse, {
            model: clientRequestedModel,
            upstreamModel: candidateModel,
            provider: activeProvider,
            clientWantsStream: true,
            customToolNames,
            hasTools: Boolean(parsedCandidateJson?.tools?.length),
            logContext: {
              apiKeyId,
              clientUserId,
              reqPath,
              startTime,
              estimatedPromptTokens,
            },
          });
        }
        return streamResponse;
      }

      // Case 2: Non-Streaming JSON
      const rawResponseText = await upstreamRes.text();
      const durationMs = Date.now() - startTime;

      let promptTokens = 0;
      let completionTokens = 0;
      let totalTokens = 0;
      let finalPayload: any = null;

      try {
        let text = rawResponseText.trim();
        const firstBrace = text.indexOf("{");
        const lastBrace = text.lastIndexOf("}");
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          finalPayload = JSON.parse(text.substring(firstBrace, lastBrace + 1));
          if (finalPayload.usage) {
            promptTokens = finalPayload.usage.prompt_tokens || 0;
            completionTokens = finalPayload.usage.completion_tokens || 0;
            totalTokens = finalPayload.usage.total_tokens || (promptTokens + completionTokens);
          }
          if (parsedModel) {
            finalPayload.model = parsedModel;
          }
        }
      } catch {}

      const upstreamPromptTokens = promptTokens || Math.max(1, (estimatedPromptTokens || 15) - tokensSavedRtk);
      const upstreamCompletionTokens = completionTokens || 25;
      const upstreamTotalTokens = totalTokens || (upstreamPromptTokens + upstreamCompletionTokens);

      logUpstreamRequest({
        connectionId: activeConnectionId,
        provider: activeProvider,
        model: upstreamLogModel,
        clientApiKeyId: apiKeyId,
        clientUserId,
        promptTokens: upstreamPromptTokens,
        completionTokens: upstreamCompletionTokens,
        totalTokens: upstreamTotalTokens,
        tokensSavedRtk,
        latencyMs: durationMs,
        statusCode: upstreamRes.status,
        isFailover: false,
      }).catch(() => {});

      if (subPath !== "responses") {
        logRequest({
          apiKeyId,
          path: reqPath,
          method: "POST",
          statusCode: upstreamRes.status,
          model: clientRequestedModel,
          promptTokens: upstreamPromptTokens + tokensSavedRtk,
          completionTokens: upstreamCompletionTokens,
          totalTokens: upstreamTotalTokens + tokensSavedRtk,
          durationMs,
        });
      }

      if (upstreamRes.ok) {
        adminLogger.done({
          durationMs,
          promptTokens: upstreamPromptTokens + tokensSavedRtk,
          completionTokens: upstreamCompletionTokens,
          rtkSavings: tokensSavedRtk,
          model: clientRequestedModel,
          upstreamModel: upstreamLogModel,
          account: userEmail,
        });
      }

      let successResponse: Response;
      if (finalPayload) {
        successResponse = NextResponse.json(finalPayload, { status: upstreamRes.status });
      } else {
        successResponse = new Response(rawResponseText, {
          status: upstreamRes.status,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (subPath === "messages") {
        return await transformChatResponseToAnthropic(successResponse, { model: clientRequestedModel, clientWantsStream: false });
      } else if (subPath === "responses") {
        return await transformChatResponseToResponses(successResponse, {
          model: clientRequestedModel,
          upstreamModel: candidateModel,
          provider: activeProvider,
          clientWantsStream: false,
          customToolNames,
          hasTools: Boolean(parsedCandidateJson?.tools?.length),
          logContext: {
            apiKeyId,
            clientUserId,
            reqPath,
            startTime,
            estimatedPromptTokens,
          },
        });
      }
      return successResponse;
    } catch (err: any) {
      if (!isLastCandidate) {
        adminLogger.fallback({
          fromModel: candidateModel,
          toModel: candidates[candIdx + 1],
          reason: `Upstream error: ${err.message}`,
          account: upstreamAccount,
        });
        markComboModelCooldown(candidateModel, comboInfo?.combo.cooldownSeconds || 60);
        continue;
      }
      adminLogger.error({
        message: err?.message || "Gagal terhubung ke layanan model upstream.",
        durationMs: Date.now() - startTime,
        model: clientRequestedModel,
        upstreamModel: candidateModel,
        account: userEmail,
      });
      logRequest({
        apiKeyId,
        path: reqPath,
        method: "POST",
        statusCode: 502,
        model: clientRequestedModel,
        promptTokens: estimatedPromptTokens || 15,
        completionTokens: 0,
        totalTokens: estimatedPromptTokens || 15,
        creditsCost: 0,
        durationMs: Date.now() - startTime,
      });
      console.error(`[Gateway Catch Error] candidate=${candidateModel}:`, err);
      return NextResponse.json(
        { error: { message: "Gagal terhubung ke layanan model upstream. Silakan coba beberapa saat lagi.", type: "api_error" } },
        { status: 502 }
      );
    }
  }

  return NextResponse.json(
    { error: { message: "All model candidates are currently busy or rate-limited. Please retry in a few moments.", type: "rate_limit_error" } },
    { status: 503 }
  );
}
