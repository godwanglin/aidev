import assert from "assert";
import {
  extractContentChars,
  calculateMessageChars,
  estimateMessagesTokens,
  applyContextGuard,
  applyContextGuardToResponsesInput,
  parseContextWindowNumber,
} from "../src/lib/rtk/context-guard";

console.log("=== RUNNING CONTEXT GUARD & TOKEN ESTIMATION TESTS ===");

// ---------------------------------------------------------
// Test 1: Token Estimation with Array of Objects (Tool Results, Text, Tool Use)
// ---------------------------------------------------------
console.log("Test 1: Array of objects content calculation (Fixing flawed 100 char fallback)...");

// Simulating a Claude coding agent tool_result with 15,000 chars of file contents
const hugeToolResultText = "const data = " + "x".repeat(15000);
const anthropicMessage = {
  role: "user",
  content: [
    {
      type: "tool_result",
      tool_use_id: "toolu_01Abc",
      content: hugeToolResultText,
    },
  ],
};

const chars = calculateMessageChars(anthropicMessage);
console.log(`Calculated chars for tool_result: ${chars} (Expected >= 15000)`);
assert(chars >= 15000, "Char count should reflect actual tool_result text, not 100 fallback!");

const estimatedTokens = estimateMessagesTokens([anthropicMessage]);
console.log(`Estimated tokens: ${estimatedTokens} (Expected ~4285)`);
assert(estimatedTokens >= 4000, "Estimated tokens should accurately reflect payload size!");

// Nested array tool_result
const nestedAnthropicMessage = {
  role: "user",
  content: [
    {
      type: "tool_result",
      tool_use_id: "toolu_02Def",
      content: [
        { type: "text", text: "Line 1: " + "a".repeat(5000) },
        { type: "text", text: "Line 2: " + "b".repeat(5000) },
      ],
    },
  ],
};
const nestedChars = calculateMessageChars(nestedAnthropicMessage);
console.log(`Calculated chars for nested tool_result: ${nestedChars} (Expected >= 10000)`);
assert(nestedChars >= 10000, "Nested text in tool_result should be counted accurately!");

// OpenAI tool calls message
const openAiAssistantWithToolCalls = {
  role: "assistant",
  content: null,
  tool_calls: [
    {
      id: "call_123",
      type: "function",
      function: {
        name: "write_file",
        arguments: JSON.stringify({ path: "/tmp/foo.txt", content: "c".repeat(8000) }),
      },
    },
  ],
};
const toolCallChars = calculateMessageChars(openAiAssistantWithToolCalls);
console.log(`Calculated chars for OpenAI tool_calls: ${toolCallChars} (Expected >= 8000)`);
assert(toolCallChars >= 8000, "OpenAI tool_calls arguments must be counted accurately!");

console.log("✓ Test 1 Passed: Flawed fallback fixed successfully.");

// ---------------------------------------------------------
// Test 2: Parse Context Window Strings
// ---------------------------------------------------------
console.log("\nTest 2: Context window parsing...");
assert.strictEqual(parseContextWindowNumber("128k"), 128000);
assert.strictEqual(parseContextWindowNumber("200k"), 200000);
assert.strictEqual(parseContextWindowNumber("400k"), 400000);
assert.strictEqual(parseContextWindowNumber("1M"), 1000000);
assert.strictEqual(parseContextWindowNumber("1.5M"), 1500000);
assert.strictEqual(parseContextWindowNumber(65536), 65536);
assert.strictEqual(parseContextWindowNumber(undefined), 128000);
console.log("✓ Test 2 Passed: Context window strings parsed correctly.");

// ---------------------------------------------------------
// Test 3: Auto Context Compression Below Threshold
// ---------------------------------------------------------
console.log("\nTest 3: Context below threshold should NOT be compressed...");
const messages = [
  { role: "user", content: "Hello AI" },
  { role: "assistant", content: "Hello! How can I help you?" },
  { role: "user", content: "Tell me a joke" },
  { role: "assistant", content: "Why did the chicken cross the road?" },
];
const resultBelow = applyContextGuard({
  messages,
  system: "You are a helpful assistant.",
  currentEstimatedTokens: 500,
  contextLimit: 128000,
  thresholdPct: 50, // 64,000 threshold
});
assert.strictEqual(resultBelow.applied, false);
assert.strictEqual(resultBelow.tokensSaved, 0);
assert.deepStrictEqual(resultBelow.compressedMessages, messages);
console.log("✓ Test 3 Passed: Below-threshold requests left untouched.");

// ---------------------------------------------------------
// Test 4: Auto Context Compression Above Threshold
// ---------------------------------------------------------
console.log("\nTest 4: Context reaching threshold compacts middle history...");
// Construct a realistic coding agent session:
// Turn 0: User initial instruction
// Turn 1: Assistant calls view_file
// Turn 2: User returns huge tool_result (30,000 chars)
// Turn 3: Assistant calls grep_search
// Turn 4: User returns huge grep tool_result (40,000 chars)
// Turn 5: Assistant calls git_diff
// Turn 6: User returns huge diff tool_result (50,000 chars)
// Turn 7: Assistant asks question
// Turn 8: User answers
// Turn 9: Assistant runs bash
// Turn 10: User returns bash output (recent turn - must be intact)

const initialPrompt = "Please refactor the authentication engine to support OAuth2 PKCE.";
const recentBashOutput = "Test suite passed: 42 tests OK.";

const longConversation = [
  { role: "user", content: initialPrompt }, // Index 0: Root prompt (PROTECTED)
  {
    role: "assistant",
    content: [{ type: "tool_use", id: "tu_1", name: "view_file", input: { path: "auth.ts" } }],
  }, // Index 1: Middle turn
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "tu_1",
        content: "// Start of file\n" + "export class AuthService { ... }\n".repeat(800) + "// End of file",
      },
    ],
  }, // Index 2: Middle tool_result (BULKY ~26,000 chars)
  {
    role: "assistant",
    content: [{ type: "tool_use", id: "tu_2", name: "grep_search", input: { query: "token" } }],
  }, // Index 3: Middle turn
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "tu_2",
        content: "MATCH 1: token.ts:10\n" + "const token = generateToken();\n".repeat(1200) + "MATCH 1200",
      },
    ],
  }, // Index 4: Middle tool_result (BULKY ~38,000 chars)
  {
    role: "assistant",
    content: "I have analyzed auth.ts and the token logic. Now examining diff.",
  }, // Index 5: Middle turn
  {
    role: "user",
    content: "Please proceed with the diff.",
  }, // Index 6: Middle turn
  // Recent turns (last 4 messages: indices 7, 8, 9, 10 - MUST BE PROTECTED)
  {
    role: "assistant",
    content: "Understood. I will run the test suite now.",
  }, // Index 7
  {
    role: "user",
    content: "Great, please run `npm test`.",
  }, // Index 8
  {
    role: "assistant",
    content: [{ type: "tool_use", id: "tu_3", name: "bash", input: { command: "npm test" } }],
  }, // Index 9
  {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "tu_3", content: recentBashOutput }],
  }, // Index 10
];

const totalTokens = estimateMessagesTokens(longConversation);
console.log(`Original tokens in multi-turn conversation: ${totalTokens}`);

// Model context limit = 30,000 tokens, threshold = 50% (15,000 tokens)
const resultAbove = applyContextGuard({
  messages: longConversation,
  system: "System prompt: always write clean code.",
  currentEstimatedTokens: totalTokens,
  contextLimit: 30000,
  thresholdPct: 50,
});

console.log(`Context Guard Applied: ${resultAbove.applied}`);
console.log(`Tokens saved: ${resultAbove.tokensSaved}`);
console.log(`New token count: ${resultAbove.newTokens}`);

assert.strictEqual(resultAbove.applied, true, "Context guard should have applied!");
assert(resultAbove.tokensSaved > 5000, "Should have saved at least 5000 tokens!");
assert(resultAbove.newTokens < resultAbove.originalTokens, "New tokens should be significantly lower!");

// Verify structural invariants:
const compressed = resultAbove.compressedMessages;
assert.strictEqual(compressed.length, longConversation.length, "Message count and turn sequence must not change!");

// Invariant 1: First user prompt is untouched
assert.strictEqual(
  compressed[0].content,
  initialPrompt,
  "Initial user task prompt must remain 100% intact!"
);

// Invariant 2: Last 4 messages are untouched
assert.strictEqual(
  compressed[7].content,
  longConversation[7].content,
  "Recent message [7] must remain intact!"
);
assert.strictEqual(
  compressed[8].content,
  longConversation[8].content,
  "Recent message [8] must remain intact!"
);
assert.deepStrictEqual(
  compressed[9].content,
  longConversation[9].content,
  "Recent message [9] tool_use must remain intact!"
);
assert.strictEqual(
  compressed[10].content[0].content,
  recentBashOutput,
  "Recent tool result [10] must remain completely intact!"
);

// Invariant 3: Middle tool results were compacted
const middleToolResult1 = compressed[2].content[0].content;
console.log("Sample compacted middle tool result snippet:");
console.log(middleToolResult1.slice(0, 300) + "...\n");
assert(
  middleToolResult1.includes("[Context Guard: compacted"),
  "Middle tool result must contain compaction marker!"
);
assert(
  middleToolResult1.length < 1000,
  `Middle tool result must be shrunk (got ${middleToolResult1.length} chars)!`
);

// Invariant 4: Tool Use IDs and pairings are preserved
assert.strictEqual(compressed[1].content[0].id, "tu_1");
assert.strictEqual(compressed[2].content[0].tool_use_id, "tu_1");
assert.strictEqual(compressed[3].content[0].id, "tu_2");
assert.strictEqual(compressed[4].content[0].tool_use_id, "tu_2");
assert.strictEqual(compressed[9].content[0].id, "tu_3");
assert.strictEqual(compressed[10].content[0].tool_use_id, "tu_3");

console.log("✓ Test 4 Passed: Context Guard properly compacts middle turns without breaking turn structure or tool pairings.");

// ---------------------------------------------------------
// Test 5: Responses API Input Compaction
// ---------------------------------------------------------
console.log("\nTest 5: Responses API input compaction...");
const responsesInput = [
  "Initial user instructions for code review",
  "Middle input 1: " + "a".repeat(5000),
  "Middle input 2: " + "b".repeat(6000),
  "Recent turn 1",
  "Recent turn 2",
  "Recent turn 3",
  "Recent turn 4",
];
const responsesGuard = applyContextGuardToResponsesInput({
  input: responsesInput,
  instructions: "You are a code reviewer",
  currentEstimatedTokens: 5000,
  contextLimit: 8000,
  thresholdPct: 50, // 4000 limit
});
assert.strictEqual(responsesGuard.applied, true);
assert(responsesGuard.tokensSaved > 1000);
assert.strictEqual(responsesGuard.compressedInput[0], responsesInput[0]);
assert.strictEqual(responsesGuard.compressedInput[6], responsesInput[6]);
console.log("✓ Test 5 Passed: Responses API input correctly compacted.");

// ---------------------------------------------------------
// Test 6: OpenAI tool_calls argument JSON syntax preservation
// ---------------------------------------------------------
console.log("\nTest 6: OpenAI tool_calls JSON preservation in middle turns...");
const openAiLongConv = [
  { role: "user", content: "Review and update this codebase." },
  {
    role: "assistant",
    content: null,
    tool_calls: [
      {
        id: "call_abc",
        type: "function",
        function: {
          name: "write_file",
          arguments: JSON.stringify({
            path: "src/deep/nested/component.tsx",
            code: "export const MyComponent = () => {\n" + "  return <div>item</div>;\n".repeat(150) + "};\n",
          }),
        },
      },
    ],
  },
  { role: "tool", tool_call_id: "call_abc", content: "File saved successfully." },
  { role: "user", content: "Now check if there are lint errors." },
  { role: "assistant", content: "Checking linting now." },
  { role: "user", content: "Show me the lint output." },
  { role: "assistant", content: "Linting completed with 0 errors." },
];

const openAiTokens = estimateMessagesTokens(openAiLongConv);
const openAiGuard = applyContextGuard({
  messages: openAiLongConv,
  currentEstimatedTokens: openAiTokens,
  contextLimit: 2000,
  thresholdPct: 50,
});
assert.strictEqual(openAiGuard.applied, true);
const middleOpenAiMsg = openAiGuard.compressedMessages[1];
const middleArgs = middleOpenAiMsg.tool_calls[0].function.arguments;
// CRITICAL: arguments MUST be valid JSON!
let parsedArgs: any;
try {
  parsedArgs = JSON.parse(middleArgs);
} catch (err: any) {
  assert.fail(`Compacted tool_calls arguments is NOT valid JSON: ${err.message}`);
}
assert(parsedArgs && typeof parsedArgs === "object", "Parsed arguments should be an object");
assert.strictEqual(parsedArgs.path, "src/deep/nested/component.tsx", "Path argument must be intact");
assert(parsedArgs.code.includes("[Context Guard: compacted"), "Code argument must be compacted with marker");
console.log("✓ Test 6 Passed: OpenAI tool_calls arguments remain 100% valid JSON after compaction.");

// ---------------------------------------------------------
// Test 7: Vision base64 image data token estimation cap
// ---------------------------------------------------------
console.log("\nTest 7: Base64 vision image token estimation cap...");
const hugeBase64ImageMessage = {
  role: "user",
  content: [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk" + "A".repeat(500000),
      },
    },
  ],
};
const imageChars = extractContentChars(hugeBase64ImageMessage.content);
console.log(`Calculated chars for 500k base64 image: ${imageChars} (Expected <= 5600)`);
assert(imageChars <= 5600, `Image chars (${imageChars}) should be capped to ~1600 tokens equivalent!`);
const imageTokens = estimateMessagesTokens([hugeBase64ImageMessage]);
console.log(`Estimated tokens for base64 image: ${imageTokens} (Expected <= 1650)`);
assert(imageTokens <= 1650, `Image tokens (${imageTokens}) must be capped!`);
console.log("✓ Test 7 Passed: Vision base64 image tokens properly capped to prevent phantom blowout.");

// ---------------------------------------------------------
// Test 8: OpenAI role "function" & JSON tool output compaction
// ---------------------------------------------------------
console.log("\nTest 8: OpenAI role function & JSON tool output compaction...");
const legacyFunctionConv = [
  { role: "user", content: "Run diagnostic function" },
  {
    role: "assistant",
    content: null,
    function_call: { name: "get_system_health", arguments: "{}" },
  },
  {
    role: "function",
    name: "get_system_health",
    content: JSON.stringify({
      status: "healthy",
      details: "system diagnostic log: " + "OK\n".repeat(2000),
    }),
  },
  { role: "user", content: "Status report?" },
  { role: "assistant", content: "All systems green." },
  { role: "user", content: "Thank you." },
  { role: "assistant", content: "You are welcome!" },
];
const funcTokens = estimateMessagesTokens(legacyFunctionConv);
const funcGuard = applyContextGuard({
  messages: legacyFunctionConv,
  currentEstimatedTokens: funcTokens,
  contextLimit: 2000,
  thresholdPct: 50,
});
assert.strictEqual(funcGuard.applied, true);
const compactedFunc = funcGuard.compressedMessages[2].content;
const parsedFunc = JSON.parse(compactedFunc);
assert.strictEqual(parsedFunc.status, "healthy");
assert(parsedFunc.details.includes("[Context Guard: compacted"));
console.log("✓ Test 8 Passed: Legacy role function and JSON tool output properly compacted.");

// ---------------------------------------------------------
// Test 9: No nested compaction markers on repeated runs
// ---------------------------------------------------------
console.log("\nTest 9: Preventing nested compaction markers on repeated passes...");
const alreadyCompacted = [
  { role: "user", content: "Root task prompt" },
  {
    role: "user",
    content: [
      {
        type: "tool_result",
        tool_use_id: "tu_old",
        content: "start\n... [Context Guard: compacted 5000 characters of older tool output] ...\nend" + " extra".repeat(200),
      },
    ],
  },
  { role: "assistant", content: "Middle turn 1" },
  { role: "user", content: "Middle turn 2" },
  { role: "assistant", content: "Recent 1" },
  { role: "user", content: "Recent 2" },
  { role: "assistant", content: "Recent 3" },
  { role: "user", content: "Recent 4" },
];
const repeatGuard = applyContextGuard({
  messages: alreadyCompacted,
  currentEstimatedTokens: 5000,
  contextLimit: 4000,
  thresholdPct: 50,
});
assert.strictEqual(repeatGuard.applied, true);
const contentStr = repeatGuard.compressedMessages[1].content[0].content;
const markerCount = (contentStr.match(/Context Guard: compacted/g) || []).length;
assert.strictEqual(markerCount, 1, "Should have exactly 1 clean compaction marker, not nested!");
console.log("✓ Test 9 Passed: No nested compaction markers.");

console.log("\n========================================================");
console.log("ALL CONTEXT GUARD & TOKEN ESTIMATION TESTS PASSED 100%!");
console.log("========================================================");
