"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Mail,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";

interface LoginFormProps {
  initialCaptcha: {
    captchaImage: string;
    captchaToken: string;
  };
}

function formatUserFriendlyError(errMsg: string | undefined): string {
  if (!errMsg) return "Autentikasi gagal. Silakan periksa email dan password Anda.";
  const lower = errMsg.toLowerCase();
  // Filter out internal code leaks / stack traces / raw query dumps
  if (
    lower.includes("prisma") ||
    lower.includes("invocation") ||
    lower.includes("unknown argument") ||
    lower.includes("syntaxerror") ||
    lower.includes("typeerror") ||
    lower.includes("database") ||
    lower.includes("sqlite") ||
    lower.includes("at ") ||
    lower.includes("select ") ||
    lower.includes("where:")
  ) {
    return "Terjadi kendala pada server internal. Silakan coba beberapa saat lagi.";
  }
  return errMsg;
}

export default function LoginForm({ initialCaptcha }: LoginFormProps) {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Server-rendered initial captcha (Zero XHR on page load)
  const [captchaImage, setCaptchaImage] = useState(initialCaptcha.captchaImage);
  const [captchaToken, setCaptchaToken] = useState(initialCaptcha.captchaToken);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [renderTimestamp] = useState<number>(() => Date.now());

  async function reloadCaptcha() {
    try {
      const res = await fetch("/api/auth/captcha");
      const json = await res.json();
      if (json.captchaImage && json.captchaToken) {
        setCaptchaImage(json.captchaImage);
        setCaptchaToken(json.captchaToken);
        setCaptchaAnswer("");
      }
    } catch {}
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const endpoint = isRegister ? "/api/auth/register" : "/api/auth/login";
    const payload = isRegister
      ? {
          email,
          password,
          name,
          captchaAnswer,
          captchaToken,
          honeypot,
          renderTimestamp,
        }
      : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(formatUserFriendlyError(json.error));
        if (isRegister) reloadCaptcha();
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("Gagal terhubung ke server. Silakan periksa koneksi Anda.");
      if (isRegister) reloadCaptcha();
    }
    setLoading(false);
  }

  return (
    <div className="login-screen">
      <div className="login-box">
        <div className="login-brand">
          <img src="/logo.png" alt="Aidev Gateway Logo" className="login-logo-img" />
          <h2>Aidev Gateway</h2>
          <p>AI Gateway & High-Performance Proxy Platform</p>
        </div>

        <div className="login-card">
          <div className="login-tabs">
            <button
              className={`login-tab ${!isRegister ? "active" : ""}`}
              onClick={() => {
                setIsRegister(false);
                setError("");
              }}
            >
              Sign In
            </button>
            <button
              className={`login-tab ${isRegister ? "active" : ""}`}
              onClick={() => {
                setIsRegister(true);
                setError("");
              }}
            >
              Create Account
            </button>
          </div>

          {error && <div className="login-error">{error}</div>}

          <form onSubmit={handleSubmit} className="login-form">
            <input suppressHydrationWarning
              type="text"
              name="company_website_honeypot"
              style={{ display: "none" }}
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />

            {isRegister && (
              <div className="form-group">
                <label>Full Name</label>
                <input suppressHydrationWarning
                  className="control w-full"
                  placeholder="e.g. Aiden Developer"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required={isRegister}
                />
              </div>
            )}

            <div className="form-group">
              <label>Email or Username</label>
              <div className="input-icon-wrap">
                <Mail size={13} className="input-icon" />
                <input suppressHydrationWarning
                  type="text"
                  autoComplete="username"
                  className="control w-full pl-7"
                  placeholder="admin@devportal.local atau admin"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Password</label>
              <div className="input-icon-wrap">
                <Lock size={13} className="input-icon" />
                <input suppressHydrationWarning
                  type="password"
                  className="control w-full pl-7"
                  placeholder="••••••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>

            {isRegister && (
              <div className="captcha-container">
                <div className="captcha-label-row">
                  <span className="text-xs font-semibold text-ink flex items-center gap-1">
                    <ShieldAlert size={12} className="text-blue" />
                    Security Verification:
                  </span>
                  <button
                    type="button"
                    className="btn-refresh-captcha"
                    onClick={reloadCaptcha}
                    title="Get new security image"
                  >
                    <RefreshCw size={11} />
                  </button>
                </div>
                <div className="captcha-input-row">
                  {captchaImage ? (
                    <img
                      src={captchaImage}
                      alt="Security Code"
                      className="captcha-img"
                    />
                  ) : (
                    <span className="captcha-question-badge">Loading...</span>
                  )}
                  <input suppressHydrationWarning
                    type="text"
                    className="control captcha-input uppercase font-mono"
                    placeholder="Enter 5-chars"
                    maxLength={5}
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    required={isRegister}
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              className="primary w-full btn-login"
              disabled={loading}
            >
              <span>
                {loading
                  ? "Processing..."
                  : isRegister
                  ? "Sign Up & Claim 10M Tokens"
                  : "Sign In to Console"}
              </span>
              <ArrowRight size={13} />
            </button>
          </form>

          <div className="login-footer-hints">
            <div className="flex items-center gap-1.5 text-xs text-muted">
              <ShieldCheck size={12} className="text-blue" />
              <span>Server-Rendered Zero-XHR Captcha</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
