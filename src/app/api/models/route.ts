import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

import { resolveComboContextWindow } from "@/lib/model-capabilities";
import { getCachedModels, setCachedModels } from "@/lib/models-cache";

export async function GET() {
  try {
    const cached = getCachedModels();
    if (cached) {
      return NextResponse.json(cached);
    }

    const combos = await prisma.comboModel.findMany({
      where: {
        isActive: true,
        isPublic: true,
      },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { priority: "asc" },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const candidateIds = combos.map((c) => c.items[0]?.modelId).filter(Boolean) as string[];
    const rawModels = candidateIds.length > 0
      ? await prisma.aiModel.findMany({
          where: { modelId: { in: candidateIds } },
          select: { modelId: true, contextWindow: true },
        })
      : [];
    const rawMap = new Map(rawModels.map((m) => [m.modelId, m.contextWindow]));

    const comboModelsMapped = combos.map((c) => {
      const firstItem = c.items[0]?.modelId || "";
      const rawContext = rawMap.get(firstItem);
      const contextWindow = resolveComboContextWindow(firstItem, rawContext, c.comboId);

      let provider = "UNIVERSAL";
      if (firstItem.startsWith("cx/") || c.comboId.includes("gpt") || c.comboId.includes("o1") || c.comboId.includes("o3")) {
        provider = "OPENAI_CODEX";
      } else if (firstItem.startsWith("cc/") || c.comboId.includes("claude")) {
        provider = "CLAUDE_CODE";
      } else if (firstItem.startsWith("ag/") || c.comboId.includes("gemini")) {
        provider = "ANTIGRAVITY";
      } else if (firstItem.startsWith("deepseek/") || c.comboId.includes("deepseek")) {
        provider = "DEEPSEEK";
      } else if (firstItem.startsWith("or/") || c.comboId.includes("openrouter")) {
        provider = "OPENROUTER";
      } else if (firstItem.startsWith("ollama/")) {
        provider = "OLLAMA_CLOUD";
      }

      return {
        id: c.id,
        modelId: c.comboId,
        name: c.name,
        provider,
        contextWindow,
        promptCost: 0,
        completionCost: 0,
        rateInPer1k: c.rateInPer1k ?? 25,
        rateOutPer1k: c.rateOutPer1k ?? 100,
        isActive: c.isActive,
        isPublic: c.isPublic,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      };
    });

    // Public catalogue displays combo models only
    const responseData = { data: comboModelsMapped };
    setCachedModels(responseData, 60000); // 1 Minute Cache

    return NextResponse.json(responseData);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

