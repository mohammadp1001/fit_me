"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { ProgramExerciseData } from "./AppShell";

type Tab = "info" | "video" | "log";

type SetLog = { weight: string; reps: string };

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ExerciseDetail({
  locale,
  programExercise,
  dayColor,
  onBack,
}: {
  locale: string;
  programExercise: ProgramExerciseData;
  dayColor: string;
  onBack: () => void;
}) {
  const t = useTranslations();
  const [tab, setTab] = useState<Tab>("info");
  const ex = programExercise.exercise;
  const name = locale === "fa" ? ex.nameFa : ex.nameEn;

  const tabs: { key: Tab; label: string }[] = [
    { key: "info", label: t("exercise.guide") },
    { key: "video", label: t("exercise.video") },
    { key: "log", label: t("exercise.logWeight") },
  ];

  const repsLabel = programExercise.reps.join("، ");

  return (
    <div className="px-4 pb-6">
      <button
        onClick={onBack}
        className="py-3 block text-sm font-semibold"
        style={{ color: dayColor, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        {t("exercise.back")}
      </button>

      {/* Header card */}
      <div
        className="rounded-2xl p-4 mb-3"
        style={{
          background: "var(--surface)",
          borderTop: `3px solid ${dayColor}`,
        }}
      >
        <div className="text-base font-black mb-1" style={{ color: "var(--text)" }}>
          {name}
        </div>
        <div className="text-xs mb-3" style={{ color: "#888" }}>
          {programExercise.setsCount} {t("program.sets")} | {repsLabel} {t("program.reps")}
        </div>
        <div className="flex flex-wrap gap-2">
          {ex.muscles.map((m) => (
            <span
              key={m}
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: `${dayColor}22`, color: dayColor }}
            >
              {m}
            </span>
          ))}
        </div>
        {programExercise.supersetGroup && (
          <div
            className="mt-3 px-3 py-2 rounded-lg text-xs font-semibold"
            style={{ background: "#0d1f0d", color: "var(--green)" }}
          >
            ⚡ {t("program.superset")}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 mb-3">
        {tabs.map((tb) => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className="flex-1 py-2 rounded-xl text-xs font-bold transition-all"
            style={{
              background: tab === tb.key ? dayColor : "var(--surface)",
              color: tab === tb.key ? "#fff" : "var(--muted)",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Panel */}
      <div
        className="rounded-2xl p-4"
        style={{ background: "var(--surface)" }}
      >
        {tab === "info" && (
          <InfoPanel locale={locale} exercise={ex} dayColor={dayColor} />
        )}
        {tab === "video" && (
          <VideoPanel locale={locale} exercise={ex} />
        )}
        {tab === "log" && (
          <LogPanel
            locale={locale}
            programExercise={programExercise}
            dayColor={dayColor}
          />
        )}
      </div>
    </div>
  );
}

function InfoPanel({
  locale,
  exercise,
  dayColor,
}: {
  locale: string;
  exercise: ProgramExerciseData["exercise"];
  dayColor: string;
}) {
  const t = useTranslations();
  const description = locale === "fa" ? exercise.descriptionFa : exercise.descriptionEn;
  const tips = locale === "fa" ? exercise.tipsFa : exercise.tipsEn;
  const mistakes = locale === "fa" ? exercise.mistakesFa : exercise.mistakesEn;

  return (
    <div className="flex flex-col gap-5">
      {description && (
        <div>
          <div
            className="text-xs font-bold mb-2 pb-1"
            style={{ color: dayColor, borderBottom: `1px solid ${dayColor}33` }}
          >
            {t("exercise.description")}
          </div>
          <p className="text-sm leading-relaxed" style={{ color: "#ddd" }}>
            {description}
          </p>
        </div>
      )}

      {tips.length > 0 && (
        <div>
          <div
            className="text-xs font-bold mb-2 pb-1"
            style={{ color: "var(--green)", borderBottom: "1px solid #4ade8033" }}
          >
            {t("exercise.tips")}
          </div>
          <div className="flex flex-col gap-2">
            {tips.map((tip, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-sm mt-0.5" style={{ color: "var(--green)" }}>✓</span>
                <span className="text-sm leading-relaxed" style={{ color: "#ddd" }}>{tip}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mistakes.length > 0 && (
        <div>
          <div
            className="text-xs font-bold mb-2 pb-1"
            style={{ color: "var(--red)", borderBottom: "1px solid #ef444433" }}
          >
            {t("exercise.mistakes")}
          </div>
          <div className="flex flex-col gap-2">
            {mistakes.map((m, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="text-sm mt-0.5" style={{ color: "var(--red)" }}>✕</span>
                <span className="text-sm leading-relaxed" style={{ color: "#ddd" }}>{m}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!description && tips.length === 0 && mistakes.length === 0 && (
        <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>
          —
        </p>
      )}
    </div>
  );
}

function VideoPanel({
  locale,
  exercise,
}: {
  locale: string;
  exercise: ProgramExerciseData["exercise"];
}) {
  const t = useTranslations();
  return (
    <div>
      <p className="text-xs text-center mb-3" style={{ color: "#777" }}>
        {locale === "fa" ? "نحوه انجام حرکت" : "How to perform this exercise"}
      </p>
      {exercise.wikiUrl ? (
        <a
          href={exercise.wikiUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl p-4"
          style={{
            background: "#1a2a1a",
            border: "1px solid #2a4a2a",
            textDecoration: "none",
          }}
        >
          <span className="text-2xl">💪</span>
          <span
            className="text-sm font-bold flex-1"
            style={{ color: "var(--green)" }}
          >
            {t("exercise.watchVideo")}
          </span>
          <span style={{ color: "var(--green)" }}>←</span>
        </a>
      ) : (
        <p className="text-sm text-center py-4" style={{ color: "var(--muted)" }}>
          {locale === "fa" ? "لینک ویدیو موجود نیست" : "No video link available"}
        </p>
      )}
    </div>
  );
}

function LogPanel({
  locale,
  programExercise,
  dayColor,
}: {
  locale: string;
  programExercise: ProgramExerciseData;
  dayColor: string;
}) {
  const t = useTranslations();
  const today = getToday();
  const [sets, setSets] = useState<SetLog[]>(
    Array.from({ length: programExercise.setsCount }, (_, i) => ({
      weight: "",
      reps: String(programExercise.reps[i] || programExercise.reps[programExercise.reps.length - 1] || ""),
    }))
  );
  const [saveMsg, setSaveMsg] = useState("");
  const [history, setHistory] = useState<Array<{ date: string; sets: SetLog[] }>>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    async function loadHistory() {
      try {
        const res = await fetch(
          `/api/logs?programExerciseId=${programExercise.id}`
        );
        if (res.ok) {
          const data = await res.json();
          setHistory(
            data.logs.map((l: { date: string; sets: SetLog[] }) => ({
              date: l.date.split("T")[0],
              sets: l.sets,
            }))
          );
          // Pre-fill today's sets if exists
          const todayLog = data.logs.find(
            (l: { date: string }) => l.date.split("T")[0] === today
          );
          if (todayLog) {
            setSets(
              todayLog.sets.map((s: SetLog) => ({
                weight: String(s.weight ?? ""),
                reps: String(s.reps ?? ""),
              }))
            );
          }
        }
      } finally {
        setLoadingHistory(false);
      }
    }
    loadHistory();
  }, [programExercise.id, today]);

  function updateSet(idx: number, field: "weight" | "reps", val: string) {
    setSets((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  }

  async function handleSave() {
    const payload = sets.map((s) => ({
      weight: s.weight ? Number(s.weight) : null,
      reps: s.reps ? parseInt(s.reps) : null,
    }));
    const res = await fetch("/api/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        programExerciseId: programExercise.id,
        date: today,
        sets: payload,
      }),
    });
    if (res.ok) {
      setSaveMsg(t("exercise.saved"));
      setTimeout(() => setSaveMsg(""), 2000);
      setHistory((prev) => {
        const filtered = prev.filter((h) => h.date !== today);
        return [{ date: today, sets }, ...filtered];
      });
    }
  }

  return (
    <div>
      <div className="text-xs mb-1" style={{ color: "#888" }}>
        {locale === "fa" ? "تاریخ" : "Date"}
      </div>
      <div className="text-sm mb-4" style={{ color: "#888", direction: "ltr", textAlign: locale === "fa" ? "right" : "left" }}>
        {today}
      </div>

      {/* Set headers */}
      <div className="flex gap-2 mb-2 text-xs font-bold" style={{ color: "var(--muted)" }}>
        <div style={{ width: 38 }}></div>
        <div className="flex-1 text-center">{t("exercise.weight")}</div>
        <div className="flex-1 text-center">
          {t("exercise.actualReps")}
          <span className="ms-1 font-normal" style={{ color: "var(--muted2)" }}>
            ({t("exercise.plannedReps")})
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 mb-4">
        {sets.map((s, i) => {
          const planned = programExercise.reps[i] ?? programExercise.reps[programExercise.reps.length - 1];
          return (
            <div key={i} className="flex items-center gap-2">
              <span
                className="text-xs font-bold text-center flex-shrink-0"
                style={{ width: 38, color: dayColor }}
              >
                {locale === "fa" ? `ست ${i + 1}` : `S${i + 1}`}
              </span>
              <input
                type="number"
                value={s.weight}
                onChange={(e) => updateSet(i, "weight", e.target.value)}
                placeholder="—"
                inputMode="decimal"
                className="flex-1 rounded-xl py-3 text-sm text-center outline-none"
                style={{
                  background: "#252525",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  direction: "ltr",
                }}
              />
              <input
                type="number"
                value={s.reps}
                onChange={(e) => updateSet(i, "reps", e.target.value)}
                placeholder={String(planned)}
                inputMode="numeric"
                className="flex-1 rounded-xl py-3 text-sm text-center outline-none"
                style={{
                  background: "#252525",
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  direction: "ltr",
                }}
              />
            </div>
          );
        })}
      </div>

      <button
        onClick={handleSave}
        className="w-full py-3 rounded-xl font-bold text-sm text-white"
        style={{ background: dayColor, border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        {t("exercise.save")}
      </button>
      {saveMsg && (
        <p className="text-center text-sm mt-2" style={{ color: "var(--green)" }}>
          {saveMsg}
        </p>
      )}

      {/* History */}
      {!loadingHistory && history.length > 0 && (
        <div className="mt-5">
          <div className="text-xs mb-3" style={{ color: "#666" }}>
            {t("exercise.previousSessions")}
          </div>
          {history.filter((h) => h.date !== today).slice(0, 5).map((h) => (
            <div
              key={h.date}
              className="rounded-xl p-3 mb-2"
              style={{ background: "#111", border: "1px solid var(--border)" }}
            >
              <div className="text-xs mb-2" style={{ color: "#555", direction: "ltr" }}>
                {h.date}
              </div>
              <div className="flex flex-wrap gap-2">
                {h.sets.map((s, i) =>
                  s.weight ? (
                    <span
                      key={i}
                      className="px-2 py-1 rounded-full text-xs font-semibold"
                      style={{ background: `${dayColor}22`, color: dayColor }}
                    >
                      {locale === "fa" ? `ست ${i + 1}` : `S${i + 1}`}: {s.weight}kg × {s.reps}
                    </span>
                  ) : null
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
