import { normalizeModelRequest, getProviderPrefix, normalizeRequestBody } from "../src/lib/model-normalizer";
import { resolveUpstreamConnection } from "../src/lib/router";

async function main() {
  console.log("==================================================");
  console.log("    TESTING MODEL PREFIX NORMALIZATION SYSTEM     ");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`✔ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`✖ [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Prefix Detection & Provider Mapping
  console.log("\n--- 1. Prefix Detection & Provider Mapping ---");
  const ag = normalizeModelRequest("ag/gemini-3.8-flash-high");
  assert(ag.providerId === "ANTIGRAVITY", `ag/ maps to ANTIGRAVITY (got ${ag.providerId})`);
  assert(ag.cleanModel === "gemini-3.8-flash-high", `Clean model stripped: ${ag.cleanModel}`);
  assert(ag.upstreamModel === "gemini-2.5-flash", `Mapped to real upstream model: ${ag.upstreamModel}`);
  assert(ag.thinkingLevel === "HIGH", `Thinking level detected: ${ag.thinkingLevel}`);
  assert(ag.thinkingBudget === 24576, `Thinking budget assigned: ${ag.thinkingBudget}`);

  const cx = normalizeModelRequest("cx/gpt-6-astra");
  assert(cx.providerId === "OPENAI_CODEX", `cx/ maps to OPENAI_CODEX (got ${cx.providerId})`);
  assert(cx.cleanModel === "gpt-6-astra", `Clean model stripped: ${cx.cleanModel}`);
  assert(cx.upstreamModel === "gpt-4o", `Virtual model mapped to real upstream model: ${cx.upstreamModel}`);

  const cc = normalizeModelRequest("cc/claude-3-7-sonnet");
  assert(cc.providerId === "CLAUDE_CODE", `cc/ maps to CLAUDE_CODE (got ${cc.providerId})`);
  assert(cc.cleanModel === "claude-3-7-sonnet", `Clean model: ${cc.cleanModel}`);

  const gem = normalizeModelRequest("gem/gemini-2.0-flash");
  assert(gem.providerId === "GEMINI", `gem/ maps to GEMINI (got ${gem.providerId})`);

  const or = normalizeModelRequest("or/meta-llama/llama-3.3-70b-instruct");
  assert(or.providerId === "OPENROUTER", `or/ maps to OPENROUTER (got ${or.providerId})`);

  const grok = normalizeModelRequest("grok/grok-2-vision");
  assert(grok.providerId === "GROK_CLI", `grok/ maps to GROK_CLI (got ${grok.providerId})`);

  // 2. Unprefixed Heuristic Fallback
  console.log("\n--- 2. Unprefixed Heuristic Fallback ---");
  const gptUnprefixed = normalizeModelRequest("gpt-4o-mini");
  assert(gptUnprefixed.providerId === "OPENAI", `Unprefixed gpt-4o-mini inferred as OPENAI`);
  assert(gptUnprefixed.upstreamModel === "gpt-4o-mini", `Unprefixed model kept intact`);

  const claudeUnprefixed = normalizeModelRequest("claude-3-5-sonnet-20241022");
  assert(claudeUnprefixed.providerId === "CLAUDE_CODE", `Unprefixed claude model inferred as CLAUDE_CODE`);

  // 3. Provider Prefix Lookup
  console.log("\n--- 3. Provider Prefix Helper ---");
  assert(getProviderPrefix("ANTIGRAVITY") === "ag/", `ANTIGRAVITY prefix is ag/`);
  assert(getProviderPrefix("OPENAI_CODEX") === "cx/", `OPENAI_CODEX prefix is cx/`);
  assert(getProviderPrefix("CLAUDE_CODE") === "cc/", `CLAUDE_CODE prefix is cc/`);
  assert(getProviderPrefix("GEMINI") === "gem/", `GEMINI prefix is gem/`);
  assert(getProviderPrefix("OPENROUTER") === "or/", `OPENROUTER prefix is or/`);

  // 4. Request Body Normalization (Proxy Payload Rewrite)
  console.log("\n--- 4. Request Body Normalization (Proxy Payload Rewrite) ---");
  const clientPayload = JSON.stringify({
    model: "ag/gemini-3.8-flash-high",
    messages: [{ role: "user", content: "Hello AI" }],
  });
  const { normalizedBody, norm } = normalizeRequestBody(clientPayload);
  const parsedRewritten = JSON.parse(normalizedBody || "{}");
  assert(parsedRewritten.model === "gemini-2.5-flash", `Rewrote model from ag/ to upstream model: ${parsedRewritten.model}`);
  assert(parsedRewritten.thinking_budget === 24576, `Injected thinking_budget: ${parsedRewritten.thinking_budget}`);
  assert(norm.providerId === "ANTIGRAVITY", `Norm provider correctly identified as ANTIGRAVITY`);

  console.log("\n==================================================");
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (${failed === 0 ? "100% SUCCESS" : "HAS FAILURES"})`);
  console.log("==================================================");

  if (failed > 0) process.exit(1);
}

main().catch(console.error);
