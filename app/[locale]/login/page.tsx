"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      if (res.ok) {
        router.push(`/${locale}`);
      } else {
        setError(t("auth.error"));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black mb-1" style={{ color: "var(--text)" }}>
            {t("app.name")}
          </h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {t("app.tagline")}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="rounded-2xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <h2 className="text-lg font-bold mb-4" style={{ color: "var(--text)" }}>
            {t("auth.title")}
          </h2>
          <label className="block text-sm mb-2" style={{ color: "var(--muted)" }}>
            {t("auth.passphrase")}
          </label>
          <input
            type="password"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            placeholder={t("auth.passphrasePlaceholder")}
            className="w-full rounded-xl px-4 py-3 text-sm mb-4 outline-none"
            style={{ background: "var(--surface2)", border: "1px solid var(--border)", color: "var(--text)" }}
            autoFocus
          />
          {error && (
            <p className="text-sm mb-3" style={{ color: "var(--red)" }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50"
            style={{ background: "var(--d2)" }}
          >
            {loading ? t("common.loading") : t("auth.login")}
          </button>
        </form>
        <div className="flex justify-center gap-4 mt-6">
          <button
            onClick={() => router.push("/fa/login")}
            className="text-xs"
            style={{ color: locale === "fa" ? "var(--text)" : "var(--muted)" }}
          >
            فارسی
          </button>
          <button
            onClick={() => router.push("/en/login")}
            className="text-xs"
            style={{ color: locale === "en" ? "var(--text)" : "var(--muted)" }}
          >
            English
          </button>
        </div>
      </div>
    </div>
  );
}
