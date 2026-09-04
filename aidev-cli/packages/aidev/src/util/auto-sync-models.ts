import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Auto sync models from AI Gateway (http://localhost:3000/v1/models)
export async function autoSyncGatewayModels() {
  const configDir = path.join(os.homedir(), ".config", "aidev-cli");
  const configFile = path.join(configDir, "aidev-cli.json");
  const fallbackConfigFile = path.join(configDir, "config.json");
  const aidevDotDir = path.join(os.homedir(), ".aidev");
  const aidevDotFile = path.join(aidevDotDir, "aidev.json");

  let currentConfig: any = {};
  if (fs.existsSync(configFile)) {
    try {
      currentConfig = JSON.parse(fs.readFileSync(configFile, "utf8"));
    } catch {}
  } else if (fs.existsSync(fallbackConfigFile)) {
    try {
      currentConfig = JSON.parse(fs.readFileSync(fallbackConfigFile, "utf8"));
    } catch {}
  }

  const gateway = currentConfig?.provider?.custom_gateway || currentConfig?.provider?.aidev_gateway;
  const baseURL = gateway?.options?.baseURL || "http://localhost:3000/v1";
  const apiKey = gateway?.options?.apiKey || "sk-int-901683c5dbd070c4735ac7bdda8257edac5e985d4652b55a";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200); // Fast non-blocking timeout

    const res = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const json: any = await res.json();
      if (json && Array.isArray(json.data) && json.data.length > 0) {
        const modelsMap: Record<string, { name: string }> = {};
        for (const m of json.data) {
          modelsMap[m.id] = {
            name: m.id,
          };
        }

        const newConfig = {
          "$schema": "https://aidev-cli.ai/config.json",
          "provider": {
            "custom_gateway": {
              "name": "Aidev AI Gateway",
              "npm": "@ai-sdk/openai-compatible",
              "options": {
                "baseURL": baseURL,
                "apiKey": apiKey,
              },
              "models": modelsMap,
            },
          },
          "model": currentConfig.model || "custom_gateway/gpt-5.2",
          "plugin": [],
        };

        fs.mkdirSync(configDir, { recursive: true });
        fs.mkdirSync(aidevDotDir, { recursive: true });
        fs.writeFileSync(configFile, JSON.stringify(newConfig, null, 2), "utf8");
        fs.writeFileSync(fallbackConfigFile, JSON.stringify(newConfig, null, 2), "utf8");
        fs.writeFileSync(aidevDotFile, JSON.stringify(newConfig, null, 2), "utf8");
      }
    }
  } catch {
    // If gateway is offline or unreachable, silently continue with existing config
  }
}
