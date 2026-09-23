// RTK Token Saver: Context & Prompt Compression Engine
// Inspired by 9Router RTK Token Saver

const LOCKFILE_REGEX = /(?:diff --git a\/(?:.*\/)?(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|composer\.lock|poetry\.lock|bun\.lockb) b\/(?:.*\/)?\1[\s\S]*?)(?=(?:diff --git|$))/g;
const BINARY_DIFF_REGEX = /(?:diff --git a\/.* b\/.*[\s\S]*?GIT binary patch[\s\S]*?)(?=(?:diff --git|$))/g;
const ANSI_REGEX = /[\u001b\x1b]\[[0-9;]*[a-zA-Z]/g;

const JUNK_PATH_REGEX = /^(?:[│\s├──└──|+-]*)(?:node_modules|\.git|\.next|dist|build|coverage|\.turbo|\.cache|vendor|__pycache__|\.pytest_cache)\b.*$/gm;

/**
 * Compresses Git diffs by condensing lockfiles and stripping redundant headers.
 */
export function compactGitDiff(text: string): string {
  if (!text || text.length < 50) return text;

  // 1. Condense Lockfiles
  let result = text.replace(LOCKFILE_REGEX, (match, filename) => {
    const lines = match.split("\n");
    let added = 0;
    let deleted = 0;
    for (const line of lines) {
      if (line.startsWith("+") && !line.startsWith("+++")) added++;
      else if (line.startsWith("-") && !line.startsWith("---")) deleted++;
    }
    return `diff --git a/${filename} b/${filename}\n[Lockfile ${filename} diff omitted: +${added} -${deleted} lines]\n`;
  });

  // 2. Omit Binary Patches
  result = result.replace(BINARY_DIFF_REGEX, (match) => {
    const firstLine = match.split("\n")[0] || "diff --git [binary]";
    return `${firstLine}\n[Binary file diff omitted]\n`;
  });

  // 3. Strip redundant index / mode headers
  result = result.replace(/^index [0-9a-f]{7,40}\.\.[0-9a-f]{7,40}.*$/gm, "");
  result = result.replace(/^(?:old|new) mode [0-9]{6}$/gm, "");
  result = result.replace(/^similarity index [0-9]+%$/gm, "");

  // 4. Collapse runs of multiple empty lines
  result = result.replace(/\n{3,}/g, "\n\n");

  return result;
}

/**
 * Minifies file and directory trees by filtering out junk/build directories.
 */
export function minifyFileTree(text: string): string {
  if (!text || text.length < 50) return text;
  return text.replace(JUNK_PATH_REGEX, "");
}

/**
 * Cleans terminal logs, ANSI colors, and collapses repeated lines.
 */
export function sanitizeTerminalLogs(text: string): string {
  if (!text || text.length < 30) return text;

  // 1. Strip ANSI escape sequences
  let clean = text.replace(ANSI_REGEX, "");

  // 2. Collapse consecutive repeating lines (e.g. webpack building, repeated polling)
  const lines = clean.split("\n");
  const compactedLines: string[] = [];
  let repeatCount = 1;
  let prevLine: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i];
    if (prevLine !== null && current === prevLine && current.trim().length > 5) {
      repeatCount++;
    } else {
      if (repeatCount > 2) {
        compactedLines.push(`... [repeated x${repeatCount} lines]`);
      } else if (repeatCount === 2) {
        compactedLines.push(prevLine!);
      }
      compactedLines.push(current);
      prevLine = current;
      repeatCount = 1;
    }
  }

  if (repeatCount > 2) {
    compactedLines.push(`... [repeated x${repeatCount} lines]`);
  } else if (repeatCount === 2 && prevLine !== null) {
    compactedLines.push(prevLine);
  }

  clean = compactedLines.join("\n");
  return clean;
}

/**
 * Applies all RTK context compression rules to an arbitrary string prompt.
 */
export function compressPrompt(text: string): { compressed: string; savedChars: number } {
  if (!text || typeof text !== "string" || text.length < 60) {
    return { compressed: text, savedChars: 0 };
  }

  const step1 = compactGitDiff(text);
  const step2 = minifyFileTree(step1);
  const step3 = sanitizeTerminalLogs(step2);

  const savedChars = Math.max(0, text.length - step3.length);
  return { compressed: step3, savedChars };
}

/**
 * Compresses standard OpenAI / Anthropic chat messages array.
 */
export function compressMessages(messages: any[]): { compressedMessages: any[]; tokensSaved: number } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { compressedMessages: messages, tokensSaved: 0 };
  }

  let totalSavedChars = 0;

  const compressedMessages = messages.map((m) => {
    if (!m) return m;

    if (typeof m.content === "string") {
      const { compressed, savedChars } = compressPrompt(m.content);
      totalSavedChars += savedChars;
      return { ...m, content: compressed };
    }

    if (Array.isArray(m.content)) {
      const compressedParts = m.content.map((part: any) => {
        if (part && part.type === "text" && typeof part.text === "string") {
          const { compressed, savedChars } = compressPrompt(part.text);
          totalSavedChars += savedChars;
          return { ...part, text: compressed };
        }
        return part;
      });
      return { ...m, content: compressedParts };
    }

    return m;
  });

  const tokensSaved = Math.max(0, Math.ceil(totalSavedChars / 3.5));
  return { compressedMessages, tokensSaved };
}

/**
 * Compresses OpenAI Responses API input and instructions.
 */
export function compressResponsesInput(body: any): {
  compressedBody: any;
  tokensSaved: number;
} {
  if (!body || typeof body !== "object") {
    return { compressedBody: body, tokensSaved: 0 };
  }

  let totalSavedChars = 0;
  const newBody = { ...body };

  if (typeof newBody.instructions === "string") {
    const { compressed, savedChars } = compressPrompt(newBody.instructions);
    totalSavedChars += savedChars;
    newBody.instructions = compressed;
  }

  if (typeof newBody.input === "string") {
    const { compressed, savedChars } = compressPrompt(newBody.input);
    totalSavedChars += savedChars;
    newBody.input = compressed;
  } else if (Array.isArray(newBody.input)) {
    newBody.input = newBody.input.map((item: any) => {
      if (typeof item === "string") {
        const { compressed, savedChars } = compressPrompt(item);
        totalSavedChars += savedChars;
        return compressed;
      }
      if (item && typeof item === "object" && typeof item.content === "string") {
        const { compressed, savedChars } = compressPrompt(item.content);
        totalSavedChars += savedChars;
        return { ...item, content: compressed };
      }
      return item;
    });
  }

  const tokensSaved = Math.max(0, Math.ceil(totalSavedChars / 3.5));
  return { compressedBody: newBody, tokensSaved };
}
