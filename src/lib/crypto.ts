import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16; // Standard 128-bit auth tag

function getMasterKey(): Buffer {
  const secret = process.env.ENCRYPTION_MASTER_KEY || "aidev_gateway_default_fallback_secret_key_2026";
  // Always derive a strict 32-byte (256-bit) key using SHA-256
  return crypto.createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a sensitive plaintext string (e.g. API key, OAuth token) using AES-256-GCM.
 * Output format: "ivHex:tagHex:encryptedHex"
 */
export function encryptCredential(plaintext: string): string {
  if (!plaintext) return "";
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted string.
 * Expects format: "ivHex:tagHex:encryptedHex"
 */
export function decryptCredential(encryptedData: string): string {
  if (!encryptedData) return "";
  try {
    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format");
    }

    const [ivHex, tagHex, cipherHex] = parts;
    const key = getMasterKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(tagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(cipherHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("Decryption failed:", error);
    return "";
  }
}

/**
 * Masks an API key for safe frontend display (e.g. "sk-proj-••••••••1a2b").
 */
export function maskApiKey(apiKey: string | null | undefined): string {
  if (!apiKey) return "";
  const trimmed = apiKey.trim();
  if (trimmed.length <= 8) {
    return "••••••••";
  }

  // Detect common prefixes
  const knownPrefixes = ["sk-proj-", "sk-ant-", "sk-or-", "sk-int-", "sk-"];
  for (const prefix of knownPrefixes) {
    if (trimmed.startsWith(prefix)) {
      const remaining = trimmed.slice(prefix.length);
      const lastFour = remaining.length >= 4 ? remaining.slice(-4) : remaining;
      return `${prefix}••••••••${lastFour}`;
    }
  }

  // Generic key masking
  const prefix = trimmed.slice(0, 4);
  const lastFour = trimmed.slice(-4);
  return `${prefix}••••••••${lastFour}`;
}
