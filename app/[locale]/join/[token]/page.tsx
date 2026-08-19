"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";

/**
 * Redeeming an invite link.
 *
 * The token is validated server-side when the form is submitted, not here -
 * this page renders for any token so that a bad one cannot be distinguished
 * from a good one by whether the page loads.
 */
export default function JoinPage() {
  const t = useTranslations();
  const router = useRouter();
  const { locale, token } = useParams<{ locale: string; token: string }>();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, username, password, name }),
      });
      if (res.ok) {
        // Straight to onboarding: a new account has a library but no program.
        router.push(`/${locale}`);
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? t("auth.inviteInvalid"));
      }
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    background: "var(--surface2)",
    border: "1px solid var(--border)",
    color: "var(--text)",
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black mb-1" style={{ color: "var(--text)" }}>
            {t("app.name")}
          </h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {t("auth.signupIntro")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: "var(--text)" }}>
            {t("auth.signupTitle")}
          </h2>

          <label className="block text-sm mb-2" style={{ color: "var(--muted)" }}>
            {t("auth.displayName")}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm mb-4 outline-none"
            style={inputStyle}
            autoFocus
          />

          <label className="block text-sm mb-2" style={{ color: "var(--muted)" }}>
            {t("auth.username")}
          </label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={t("auth.usernamePlaceholder")}
            className="w-full rounded-xl px-4 py-3 text-sm mb-4 outline-none"
            style={inputStyle}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />

          <label className="block text-sm mb-2" style={{ color: "var(--muted)" }}>
            {t("auth.password")}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm mb-1 outline-none"
            style={inputStyle}
            autoComplete="new-password"
          />
          <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
            {t("auth.passwordHint")}
          </p>

          {error && (
            <p className="text-sm mb-3" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50"
            style={{ background: "var(--d3)" }}
          >
            {loading ? t("common.loading") : t("auth.createAccount")}
          </button>
        </form>
      </div>
    </div>
  );
}
