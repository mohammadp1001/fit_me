"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import ProgramView from "./ProgramView";
import LogView from "./LogView";
import ProgressView from "./ProgressView";
import ProfileView from "./ProfileView";

const DAY_COLORS: Record<number, string> = {
  1: "#e85d26",
  2: "#2563eb",
  3: "#16a34a",
  4: "#9333ea",
  5: "#0891b2",
  6: "#d97706",
  7: "#db2777",
};

export type ProgramData = {
  id: number;
  nameFa: string;
  nameEn: string;
  startDate: string;
  days: DayData[];
};

export type DayData = {
  id: number;
  dayNumber: number;
  nameFa: string;
  nameEn: string;
  exercises: ProgramExerciseData[];
};

export type ProgramExerciseData = {
  id: number;
  setsCount: number;
  reps: number[];
  displayOrder: number;
  supersetGroup: string | null;
  exercise: ExerciseData;
};

export type ExerciseData = {
  id: number;
  nameFa: string;
  nameEn: string;
  muscles: string[];
  descriptionFa: string;
  descriptionEn: string;
  tipsFa: string[];
  tipsEn: string[];
  mistakesFa: string[];
  mistakesEn: string[];
  wikiUrl: string;
  videoUrl: string;
};

export type UserData = {
  id: number;
  name: string;
  weightKg: number;
  heightCm: number;
  createdAt: string;
};

type Tab = "program" | "log" | "progress" | "profile";

export { DAY_COLORS };

export default function AppShell({
  locale,
  user,
  program,
}: {
  locale: string;
  user: UserData;
  program: ProgramData;
}) {
  const t = useTranslations();
  const [activeTab, setActiveTab] = useState<Tab>("program");
  const isRtl = locale === "fa";

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: "program", label: t("nav.program"), icon: "📋" },
    { key: "log", label: t("nav.log"), icon: "📊" },
    { key: "progress", label: t("nav.progress"), icon: "📈" },
    { key: "profile", label: t("nav.profile"), icon: "👤" },
  ];

  return (
    <div
      className="flex flex-col min-h-screen"
      style={{ background: "var(--bg)" }}
    >
      {/* Content — pad enough for nav bar + phone home indicator */}
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
      >
        {activeTab === "program" && (
          <ProgramView locale={locale} program={program} />
        )}
        {activeTab === "log" && <LogView locale={locale} />}
        {activeTab === "progress" && (
          <ProgressView locale={locale} program={program} />
        )}
        {activeTab === "profile" && (
          <ProfileView locale={locale} user={user} program={program} />
        )}
      </div>

      {/* Bottom navigation */}
      <nav
        className="fixed bottom-0 left-0 right-0 flex"
        style={{
          background: "#111",
          borderTop: "1px solid var(--border)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex-1 flex flex-col items-center gap-1 py-3 transition-colors"
            style={{
              color: activeTab === tab.key ? "var(--text)" : "var(--muted)",
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            <span className="text-lg">{tab.icon}</span>
            <span className="text-xs font-semibold">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
