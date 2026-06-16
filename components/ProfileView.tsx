"use client";

import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { UserData, ProgramData, ProgramSummary } from "./AppShell";

export default function ProfileView({
  locale,
  user,
  program,
  allPrograms,
}: {
  locale: string;
  user: UserData;
  program: ProgramData;
  allPrograms: ProgramSummary[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [weight, setWeight] = useState(String(user.weightKg));
  const [height, setHeight] = useState(String(user.heightCm));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [switching, setSwitching] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSaveProfile() {
    setSaving(true);
    await fetch("/api/user", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        weightKg: Number(weight),
        heightCm: Number(height),
      }),
    });
    setSaving(false);
    setEditing(false);
    router.refresh();
  }

  async function handleNewProgram(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const yamlContent = await file.text();
    setUploading(true);
    setUploadMsg("");
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: user.name,
          weightKg: user.weightKg,
          heightCm: user.heightCm,
          yamlContent,
        }),
      });
      if (res.ok) {
        setUploadMsg(locale === "fa" ? "✓ برنامه جدید بارگذاری شد" : "✓ New program loaded");
        setTimeout(() => {
          router.refresh();
        }, 1000);
      } else {
        setUploadMsg(locale === "fa" ? "خطا در خواندن فایل" : "Error reading file");
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleDeleteProgram(programId: number) {
    if (!confirm(locale === "fa" ? "این برنامه حذف شود؟" : "Delete this program and its logs?")) return;
    setDeletingId(programId);
    const res = await fetch(`/api/programs/${programId}`, { method: "DELETE" });
    setDeletingId(null);
    if (res.ok) {
      router.refresh();
    } else {
      const data = await res.json();
      alert(data.error ?? "Failed to delete program");
    }
  }

  async function handleSwitchProgram(programId: number) {
    if (programId === program.id) return;
    setSwitching(true);
    await fetch("/api/programs/activate", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ programId }),
    });
    setSwitching(false);
    router.refresh();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push(`/${locale}/login`);
  }

  const startDate = new Date(program.startDate).toLocaleDateString(
    locale === "fa" ? "fa-IR" : "en-US"
  );

  return (
    <div className="px-4 pt-4 pb-6">
      <h1 className="text-lg font-black mb-4" style={{ color: "var(--text)" }}>
        {t("profile.title")}
      </h1>

      {/* Profile card */}
      <div
        className="rounded-2xl p-4 mb-4"
        style={{ background: "var(--surface)" }}
      >
        {!editing ? (
          <>
            <div className="flex justify-between items-start mb-4">
              <button
                onClick={() => setEditing(true)}
                className="text-xs font-semibold px-3 py-1 rounded-lg"
                style={{
                  background: "var(--surface2)",
                  color: "var(--text)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t("profile.edit")}
              </button>
              <div className="text-2xl font-black" style={{ color: "var(--text)" }}>
                {user.name}
              </div>
            </div>
            <div className="flex gap-4">
              <div
                className="flex-1 rounded-xl p-3 text-center"
                style={{ background: "var(--surface2)" }}
              >
                <div
                  className="text-xl font-black"
                  style={{ color: "var(--text)" }}
                >
                  {user.weightKg}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  {t("common.kg")}
                </div>
              </div>
              <div
                className="flex-1 rounded-xl p-3 text-center"
                style={{ background: "var(--surface2)" }}
              >
                <div
                  className="text-xl font-black"
                  style={{ color: "var(--text)" }}
                >
                  {user.heightCm}
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                  {t("common.cm")}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl px-4 py-3 text-sm outline-none"
              style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
              }}
            />
            <div className="flex gap-3">
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder={t("profile.weight")}
                className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                style={{
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                placeholder={t("profile.height")}
                className="flex-1 rounded-xl px-4 py-3 text-sm outline-none"
                style={{
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(false)}
                className="flex-1 py-2 rounded-xl text-sm font-bold"
                style={{
                  background: "var(--surface2)",
                  color: "var(--muted)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{
                  background: "#2563eb",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {saving ? t("common.loading") : t("profile.save")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Program switcher */}
      <div
        className="rounded-2xl p-4 mb-4"
        style={{ background: "var(--surface)" }}
      >
        <h2 className="text-sm font-bold mb-3" style={{ color: "var(--text)" }}>
          {t("profile.activeProgram")}
        </h2>

        {/* Program list — each row is selectable; inactive ones can be deleted */}
        <div className="flex flex-col gap-2 mb-3">
          {allPrograms.map((p) => {
            const isActive = p.id === program.id;
            const isDeleting = deletingId === p.id;
            const name = locale === "fa" ? p.nameFa : p.nameEn;
            return (
              <div
                key={p.id}
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{
                  background: "var(--surface2)",
                  border: `1px solid ${isActive ? "#4ade80" : "var(--border)"}`,
                }}
              >
                {/* Select button */}
                <button
                  onClick={() => handleSwitchProgram(p.id)}
                  disabled={switching || isActive}
                  className="flex-1 text-sm font-bold text-right disabled:cursor-default"
                  style={{
                    color: isActive ? "#4ade80" : "var(--text)",
                    background: "none",
                    border: "none",
                    cursor: isActive ? "default" : "pointer",
                    fontFamily: "inherit",
                    textAlign: locale === "fa" ? "right" : "left",
                  }}
                >
                  {isActive ? "✓ " : ""}{name}
                </button>

                {/* Delete button — only for inactive programs */}
                {!isActive && (
                  <button
                    onClick={() => handleDeleteProgram(p.id)}
                    disabled={isDeleting}
                    title={locale === "fa" ? "حذف برنامه" : "Delete program"}
                    className="text-sm px-2 py-1 rounded-lg flex-shrink-0 disabled:opacity-40"
                    style={{
                      background: "none",
                      border: "1px solid var(--red)",
                      color: "var(--red)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {isDeleting ? "…" : "🗑"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Active program start date */}
        <div className="text-xs mb-4" style={{ color: "var(--muted)" }}>
          {t("profile.since")} {startDate}
        </div>

        {/* Upload a new program */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50"
          style={{
            background: "var(--surface2)",
            color: "var(--text)",
            border: "1px solid var(--border)",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {uploading ? t("common.loading") : `📄 ${t("profile.uploadNew")}`}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".yaml,.yml"
          onChange={handleNewProgram}
          className="hidden"
        />
        {uploadMsg && (
          <p className="text-xs mt-2 text-center" style={{ color: "var(--green)" }}>
            {uploadMsg}
          </p>
        )}
      </div>

      {/* Language switcher */}
      <div
        className="rounded-2xl p-4 mb-4"
        style={{ background: "var(--surface)" }}
      >
        <h2
          className="text-sm font-bold mb-3"
          style={{ color: "var(--text)" }}
        >
          {locale === "fa" ? "زبان" : "Language"}
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => router.push("/fa")}
            className="flex-1 py-2 rounded-xl text-sm font-bold"
            style={{
              background: locale === "fa" ? "#2563eb" : "var(--surface2)",
              color: locale === "fa" ? "#fff" : "var(--muted)",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            فارسی
          </button>
          <button
            onClick={() => router.push("/en")}
            className="flex-1 py-2 rounded-xl text-sm font-bold"
            style={{
              background: locale === "en" ? "#2563eb" : "var(--surface2)",
              color: locale === "en" ? "#fff" : "var(--muted)",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            English
          </button>
        </div>
      </div>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full py-3 rounded-xl text-sm font-bold"
        style={{
          background: "var(--surface)",
          color: "var(--red)",
          border: "1px solid var(--red)",
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {t("profile.logout")}
      </button>
    </div>
  );
}
