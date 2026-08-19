"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";

/**
 * One-time claim of the account that predates accounts.
 *
 * Shown once, to whoever knows the old shared passphrase. It attaches a
 * username and password to the existing training history and makes that account
 * the admin. Once claimed, the API answers 410 and this page redirects to login.
 */
export default function ClaimPage() {
  const t = useTranslations();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();

  const [available, setAvailable] = useState<boolean | null>(null);
  const [passphrase, setPassphrase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/auth/claim")
      .then((r) => r.json())
      .then((d) => {
        setAvailable(d.available === true);
        if (d.available !== true) {
          router.replace(`/${locale}/login`);
        }
      })
      .catch(() => setAvailable(false));
  }, [locale, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase, username, password }),
      });
      if (res.ok) {
        router.push(`/${locale}`);
      } else {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? t("auth.error"));
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

  if (available === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {t("common.loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black mb-1" style={{ color: "var(--text)" }}>
            {t("app.name")}
          </h1>
        </div>

        <form onSubmit={handleSubmit} className="rounded-2xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h2 className="text-lg font-bold mb-2" style={{ color: "var(--text)" }}>
            {t("auth.claimTitle")}
          </h2>
          <p className="text-sm mb-5" style={{ color: "var(--muted)" }}>
            {t("auth.claimIntro")}
          </p>

          <label className="block text-sm mb-2" style={{ color: "var(--muted)" }}>
            {t("auth.oldPassphrase")}
          </label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-sm mb-4 outline-none"
            style={inputStyle}
            autoComplete="current-password"
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
            style={{ background: "var(--d1)" }}
          >
            {loading ? t("common.loading") : t("auth.claim")}
          </button>
        </form>
      </div>
    </div>
  );
}
