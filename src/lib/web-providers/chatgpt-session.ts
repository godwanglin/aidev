import { randomUUID } from "crypto";

export interface ParsedCookieResult {
  cookieString: string;
  oaiDid?: string;
  sessionToken?: string;
  format: "json" | "headers" | "netscape" | "raw";
  cookieCount: number;
}

export interface ChatGptSessionResult {
  success: boolean;
  accessToken?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    image?: string;
    picture?: string;
  };
  expires?: string;
  error?: string;
}

function extractSessionToken(cookiesMap: Record<string, string>): string | undefined {
  const keys = Object.keys(cookiesMap);
  for (const k of keys) {
    const lower = k.toLowerCase();
    if (
      lower === "__secure-next-auth.session-token" ||
      lower.startsWith("__secure-next-auth.session-token.") ||
      lower === "__host-next-auth.session-token" ||
      lower.startsWith("__host-next-auth.session-token.") ||
      lower === "next-auth.session-token" ||
      lower.startsWith("next-auth.session-token.") ||
      lower.includes("session-token") ||
      lower.includes("session_token")
    ) {
      return cookiesMap[k];
    }
  }
  return undefined;
}

/**
 * Normalizes and parses cookie input from 3 supported formats:
 * 1. JSON (array of cookie objects from Cookie-Editor / EditThisCookie or key-value object)
 * 2. Headers String (DevTools Network request headers or raw 'Cookie: ...' string)
 * 3. Netscape format (tab-separated cookies.txt format)
 */
export function parseCookieInput(rawInput: string): ParsedCookieResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      cookieString: "",
      format: "raw",
      cookieCount: 0,
    };
  }

  // 1. Try JSON Format
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const cookiesMap: Record<string, string> = {};

      if (Array.isArray(parsed)) {
        // Array of cookie objects [{ name, value, ... }]
        for (const item of parsed) {
          if (item && typeof item === "object" && item.name && item.value !== undefined) {
            cookiesMap[item.name] = String(item.value);
          }
        }
      } else if (typeof parsed === "object" && parsed !== null) {
        // Key-value map { "cookieName": "value" }
        for (const [k, v] of Object.entries(parsed)) {
          if (k && v !== undefined) {
            cookiesMap[k] = String(v);
          }
        }
      }

      const cookieKeys = Object.keys(cookiesMap);
      if (cookieKeys.length > 0) {
        const cookieString = cookieKeys.map((k) => `${k}=${cookiesMap[k]}`).join("; ");
        const oaiDid = cookiesMap["oai-did"] || cookiesMap["__Host-oai-did"];
        const sessionToken = extractSessionToken(cookiesMap);

        return {
          cookieString,
          oaiDid,
          sessionToken,
          format: "json",
          cookieCount: cookieKeys.length,
        };
      }
    } catch {
      // If JSON parsing fails, fall through to headers / netscape
    }
  }

  // 2. Try Netscape Format (lines with tab separators and domain in first column)
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const netscapeLines = lines.filter((l) => !l.startsWith("#") && l.includes("\t"));

  if (netscapeLines.length > 0 && netscapeLines.length >= Math.floor(lines.length / 2)) {
    const cookiesMap: Record<string, string> = {};
    for (const line of netscapeLines) {
      const parts = line.split("\t");
      if (parts.length >= 7) {
        const name = parts[5].trim();
        const val = parts[6].trim();
        if (name) {
          cookiesMap[name] = val;
        }
      }
    }

    const cookieKeys = Object.keys(cookiesMap);
    if (cookieKeys.length > 0) {
      const cookieString = cookieKeys.map((k) => `${k}=${cookiesMap[k]}`).join("; ");
      const oaiDid = cookiesMap["oai-did"] || cookiesMap["__Host-oai-did"];
      const sessionToken = extractSessionToken(cookiesMap);

      return {
        cookieString,
        oaiDid,
        sessionToken,
        format: "netscape",
        cookieCount: cookieKeys.length,
      };
    }
  }

  // 3. Headers String Format
  // Checks if input contains 'Cookie:' or multiple header lines
  const cookiesMap: Record<string, string> = {};
  let isHeadersFormat = false;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith("cookie:")) {
      isHeadersFormat = true;
      const rawCookiePart = line.substring(line.indexOf(":") + 1).trim();
      const pairs = rawCookiePart.split(";");
      for (const pair of pairs) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx !== -1) {
          const key = pair.substring(0, eqIdx).trim();
          const val = pair.substring(eqIdx + 1).trim();
          if (key) cookiesMap[key] = val;
        }
      }
    } else if (lower.startsWith("oai-device-id:")) {
      const did = line.substring(line.indexOf(":") + 1).trim();
      if (did && !cookiesMap["oai-did"]) {
        cookiesMap["oai-did"] = did;
      }
    }
  }

  // If no explicit 'Cookie:' line was found, parse as raw 'key=val; key2=val2'
  if (Object.keys(cookiesMap).length === 0) {
    const pairs = trimmed.split(";");
    for (const pair of pairs) {
      const eqIdx = pair.indexOf("=");
      if (eqIdx !== -1) {
        const key = pair.substring(0, eqIdx).trim();
        const val = pair.substring(eqIdx + 1).trim();
        // Ignore headers like 'accept-language: en'
        if (key && !key.includes("\n") && !key.includes("\r") && !key.includes(" ")) {
          cookiesMap[key] = val;
        }
      }
    }
  }

  const cookieKeys = Object.keys(cookiesMap);
  const cookieString = cookieKeys.map((k) => `${k}=${cookiesMap[k]}`).join("; ");
  const oaiDid = cookiesMap["oai-did"] || cookiesMap["__Host-oai-did"];
  const sessionToken = extractSessionToken(cookiesMap);

  return {
    cookieString,
    oaiDid,
    sessionToken,
    format: isHeadersFormat ? "headers" : "raw",
    cookieCount: cookieKeys.length,
  };
}

/**
 * Verifies and fetches ChatGPT session token from https://chatgpt.com/api/auth/session
 * using the provided cookies and browser-emulated headers.
 */
export async function verifyAndFetchChatGptSession(
  cookieInput: string
): Promise<ChatGptSessionResult> {
  try {
    const parsed = parseCookieInput(cookieInput);
    let cookieString = parsed.cookieString;

    if (!cookieString) {
      return {
        success: false,
        error: "Cookie tidak boleh kosong.",
      };
    }

    // Ensure oai-did is present in cookies
    let oaiDid = parsed.oaiDid;
    if (!oaiDid) {
      oaiDid = randomUUID();
      cookieString = `${cookieString}; oai-did=${oaiDid}`;
    }

    const res = await fetch("https://chatgpt.com/api/auth/session", {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Sec-Ch-Ua": '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
        Referer: "https://chatgpt.com/",
        Cookie: cookieString,
        Priority: "u=1, i",
      },
    });

    if (res.status === 403) {
      return {
        success: false,
        error: "Akses diblokir oleh Cloudflare (HTTP 403). Pastikan cookie menyertakan cf_clearance atau gunakan proxy.",
      };
    }

    if (!res.ok) {
      return {
        success: false,
        error: `Gagal memverifikasi session ChatGPT: HTTP ${res.status} ${res.statusText}`,
      };
    }

    const data = await res.json();

    if (!data || !data.accessToken) {
      return {
        success: false,
        error:
          "Cookie valid tapi sesi login tidak ditemukan / expired (tidak ada accessToken di respon /api/auth/session). Silakan periksa apakah Anda sudah login di chatgpt.com saat mengambil cookie.",
      };
    }

    return {
      success: true,
      accessToken: data.accessToken,
      user: data.user,
      expires: data.expires,
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message || "Gagal menghubungi chatgpt.com",
    };
  }
}
