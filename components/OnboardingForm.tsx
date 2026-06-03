"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

const DAY_COLORS = ["#e85d26", "#2563eb", "#16a34a"];

export default function OnboardingForm({ locale }: { locale: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [yamlContent, setYamlContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setYamlContent(ev.target?.result as string);
    };
    reader.readAsText(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = t("onboarding.errors.name");
    if (!weight || isNaN(Number(weight)) || Number(weight) <= 0)
      errs.weight = t("onboarding.errors.weight");
    if (!height || isNaN(Number(height)) || Number(height) <= 0)
      errs.height = t("onboarding.errors.height");
    if (!yamlContent) errs.file = t("onboarding.errors.file");
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    setLoading(true);
    setErrors({});
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          weightKg: Number(weight),
          heightCm: Number(height),
          yamlContent,
        }),
      });

      if (res.ok) {
        router.push(`/${locale}`);
      } else {
        const data = await res.json();
        setErrors({ file: data.error || t("onboarding.errors.file") });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen p-6"
      style={{ background: "var(--bg)" }}
    >
      <div className="max-w-sm mx-auto">
        <div className="text-center mb-8 pt-8">
          <h1
            className="text-3xl font-black mb-1"
            style={{ color: "var(--text)" }}
          >
            {t("app.name")}
          </h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {t("onboarding.subtitle")}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div
            className="rounded-2xl p-5"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <h2
              className="text-base font-bold mb-4"
              style={{ color: "var(--text)" }}
            >
              {t("onboarding.title")}
            </h2>

            <div className="flex flex-col gap-3">
              <div>
                <label
                  className="block text-xs mb-1"
                  style={{ color: "var(--muted)" }}
                >
                  {t("onboarding.name")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("onboarding.namePlaceholder")}
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                  style={{
                    background: "var(--surface2)",
                    border: `1px solid ${errors.name ? "var(--red)" : "var(--border)"}`,
                    color: "var(--text)",
                  }}
                />
                {errors.name && (
                  <p className="text-xs mt-1" style={{ color: "var(--red)" }}>
                    {errors.name}
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label
                    className="block text-xs mb-1"
                    style={{ color: "var(--muted)" }}
                  >
                    {t("onboarding.weight")}
                  </label>
                  <input
                    type="number"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="70"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{
                      background: "var(--surface2)",
                      border: `1px solid ${errors.weight ? "var(--red)" : "var(--border)"}`,
                      color: "var(--text)",
                    }}
                  />
                  {errors.weight && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--red)" }}
                    >
                      {errors.weight}
                    </p>
                  )}
                </div>
                <div className="flex-1">
                  <label
                    className="block text-xs mb-1"
                    style={{ color: "var(--muted)" }}
                  >
                    {t("onboarding.height")}
                  </label>
                  <input
                    type="number"
                    value={height}
                    onChange={(e) => setHeight(e.target.value)}
                    placeholder="175"
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none"
                    style={{
                      background: "var(--surface2)",
                      border: `1px solid ${errors.height ? "var(--red)" : "var(--border)"}`,
                      color: "var(--text)",
                    }}
                  />
                  {errors.height && (
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--red)" }}
                    >
                      {errors.height}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div
            className="rounded-2xl p-5"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
            }}
          >
            <h2
              className="text-base font-bold mb-1"
              style={{ color: "var(--text)" }}
            >
              {t("onboarding.uploadProgram")}
            </h2>
            <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
              {t("onboarding.uploadHint")}
            </p>
            <label
              className="flex flex-col items-center justify-center rounded-xl py-6 cursor-pointer transition-colors"
              style={{
                background: "var(--surface2)",
                border: `2px dashed ${errors.file ? "var(--red)" : "var(--border)"}`,
              }}
            >
              <span className="text-2xl mb-2">📄</span>
              <span
                className="text-sm font-semibold"
                style={{ color: yamlContent ? "var(--green)" : "var(--muted)" }}
              >
                {fileName || t("onboarding.uploadHint")}
              </span>
              <input
                type="file"
                accept=".yaml,.yml"
                onChange={handleFile}
                className="hidden"
              />
            </label>
            {errors.file && (
              <p className="text-xs mt-2" style={{ color: "var(--red)" }}>
                {errors.file}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-sm text-white disabled:opacity-50"
            style={{ background: "#2563eb" }}
          >
            {loading ? t("common.loading") : t("onboarding.submit")}
          </button>
        </form>
      </div>
    </div>
  );
}
