"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { ProgramExerciseData } from "./AppShell";
import { computeInitialSets, SetLog, SuggestionSet } from "@/lib/log-prefill";
import { MUSCLE_LABEL } from "@/lib/muscles";
import { selectVideoPresentation } from "@/lib/youtube";
import { NOTE_MAX_LENGTH } from "@/lib/notes";

type Tab = "info" | "log";

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
  const name = ex.name;

  const tabs: { key: Tab; label: string }[] = [
    { key: "info", label: t("exercise.guide") },
    { key: "log", label: t("exercise.logWeight") },
  ];

  const repsLabel = programExercise.reps.join(locale === "fa" ? "، " : ", ");

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
          {ex.musclesPrimary.map((m) => (
            <span
              key={m}
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{ background: `${dayColor}22`, color: dayColor }}
            >
              {MUSCLE_LABEL[m][locale === "fa" ? "fa" : "en"]}
            </span>
          ))}
          {/* Secondary movers carry visibly less weight: outlined, not filled. */}
          {ex.musclesSecondary.map((m) => (
            <span
              key={m}
              className="px-3 py-1 rounded-full text-xs font-semibold"
              style={{
                background: "transparent",
                border: `1px solid ${dayColor}66`,
                color: "var(--muted)",
              }}
            >
              {MUSCLE_LABEL[m][locale === "fa" ? "fa" : "en"]}
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
          <InfoPanel exercise={ex} dayColor={dayColor} />
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
  exercise,
  dayColor,
}: {
  exercise: ProgramExerciseData["exercise"];
  dayColor: string;
}) {
  const t = useTranslations();
  // Exercise content is English-only now, so there is no longer a language to
  // pick between here. The surrounding UI chrome stays bilingual via `t`.
  const { description, tips, mistakes } = exercise;

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
          -
        </p>
      )}

      <VideoLink exercise={exercise} />
    </div>
  );
}

/**
 * The single outbound video link that closes the guide. Nothing plays in-app.
 */
function VideoLink({
  exercise,
}: {
  exercise: ProgramExerciseData["exercise"];
}) {
  const t = useTranslations();
  const video = selectVideoPresentation(exercise.videoUrl, exercise.wikiUrl);

  if (video.kind === "none") return null;

  const style =
    video.kind === "youtube"
      ? { background: "#2a1a1a", border: "1px solid #4a2a2a", color: "#ff4d4d", icon: "▶️" }
      : { background: "#1a2a1a", border: "1px solid #2a4a2a", color: "var(--green)", icon: "💪" };

  const label =
    video.kind === "youtube"
      ? t("exercise.openInYouTube")
      : video.kind === "wiki"
        ? t("exercise.watchVideo")
        : t("exercise.watchVideoFile");

  return (
    <a
      href={video.href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 rounded-xl p-4"
      style={{
        background: style.background,
        border: style.border,
        textDecoration: "none",
      }}
    >
      <span className="text-2xl">{style.icon}</span>
      <span className="text-sm font-bold flex-1" style={{ color: style.color }}>
        {label}
      </span>
      <span style={{ color: style.color }}>←</span>
    </a>
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
  const [sets, setSets] = useState<SetLog[]>(() =>
    computeInitialSets({
      setsCount: programExercise.setsCount,
      programReps: programExercise.reps,
      suggestionSets: null,
      todaysLogSets: null,
    })
  );
  const noteFieldId = useId();
  const [note, setNote] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [history, setHistory] = useState<
    Array<{ date: string; sets: SetLog[]; plannedReps: number[]; note: string }>
  >([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [rationale, setRationale] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTodayLog(): Promise<SetLog[] | null> {
      try {
        const res = await fetch(
          `/api/logs?programExerciseId=${programExercise.id}`
        );
        if (!res.ok) return null;
        const data = await res.json();
        if (cancelled) return null;
        setHistory(
          data.logs.map(
            (l: {
              date: string;
              sets: SetLog[];
              plannedReps?: number[];
              note?: string;
            }) => ({
              date: l.date.split("T")[0],
              sets: l.sets,
              plannedReps: l.plannedReps ?? [],
              note: l.note ?? "",
            })
          )
        );
        const todayLog = data.logs.find(
          (l: { date: string }) => l.date.split("T")[0] === today
        );
        if (!todayLog) return null;
        setNote(todayLog.note ?? "");
        return todayLog.sets.map((s: SetLog) => ({
          weight: String(s.weight ?? ""),
          reps: String(s.reps ?? ""),
        }));
      } catch {
        return null;
      }
    }

    async function loadSuggestion(): Promise<{
      sets: SuggestionSet[];
      rationale: string;
    } | null> {
      try {
        const res = await fetch(
          `/api/suggestions?programExerciseId=${programExercise.id}&date=${today}`
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data.suggestion ?? null;
      } catch {
        return null;
      }
    }

    async function load() {
      const [todaysLogSets, suggestion] = await Promise.all([
        loadTodayLog(),
        loadSuggestion(),
      ]);
      if (cancelled) return;
      setRationale(!todaysLogSets && suggestion ? suggestion.rationale : null);
      setSets(
        computeInitialSets({
          setsCount: programExercise.setsCount,
          programReps: programExercise.reps,
          suggestionSets: suggestion?.sets ?? null,
          todaysLogSets,
        })
      );
      setLoadingHistory(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [programExercise.id, programExercise.setsCount, programExercise.reps, today]);

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
        note,
      }),
    });
    if (res.ok) {
      setSaveMsg(t("exercise.saved"));
      setTimeout(() => setSaveMsg(""), 2000);
      setHistory((prev) => {
        const filtered = prev.filter((h) => h.date !== today);
        return [
          {
            date: today,
            sets,
            note,
            plannedReps: Array.from(
              { length: programExercise.setsCount },
              (_, i) =>
                programExercise.reps[i] ??
                programExercise.reps[programExercise.reps.length - 1]
            ),
          },
          ...filtered,
        ];
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

      {rationale && (
        <div
          className="rounded-xl px-3 py-2 mb-4 text-xs leading-relaxed"
          style={{
            background: `${dayColor}14`,
            border: `1px solid ${dayColor}33`,
            color: "var(--text)",
          }}
        >
          <span className="font-bold" style={{ color: dayColor }}>
            🧠 {t("exercise.suggestion")}:{" "}
          </span>
          {rationale}
        </div>
      )}

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
                step="any"
                min="0"
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
                step="1"
                min="0"
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

      <div className="flex flex-col gap-1 mb-4">
        <label
          className="text-xs font-bold"
          style={{ color: "var(--muted)" }}
          htmlFor={noteFieldId}
        >
          {t("exercise.note")}
        </label>
        <textarea
          id={noteFieldId}
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX_LENGTH))}
          placeholder={t("exercise.notePlaceholder")}
          rows={3}
          maxLength={NOTE_MAX_LENGTH}
          className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-y"
          style={{
            background: "#252525",
            border: "1px solid var(--border)",
            color: "var(--text)",
            fontFamily: "inherit",
            lineHeight: 1.6,
          }}
        />
        {/* Only shown as the limit approaches - a counter on an empty box is
            noise, and this screen is read between sets. */}
        {note.length > NOTE_MAX_LENGTH - 100 && (
          <span
            className="text-xs self-end"
            style={{ color: "var(--muted2)", direction: "ltr" }}
          >
            {note.length} / {NOTE_MAX_LENGTH}
          </span>
        )}
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
                {h.sets.map((s, i) => {
                  if (!s.weight) return null;
                  const planned = h.plannedReps[i];
                  const actual = Number(s.reps);
                  // Only a real shortfall is called out. Matching or beating
                  // the target needs no decoration - the point is to make a
                  // missed rep visible, not to grade every set.
                  const missed =
                    planned !== undefined &&
                    Number.isFinite(actual) &&
                    actual < planned;
                  return (
                    <span
                      key={i}
                      className="px-2 py-1 rounded-full text-xs font-semibold"
                      style={
                        missed
                          ? { background: "#3a221c", color: "#e8836a" }
                          : { background: `${dayColor}22`, color: dayColor }
                      }
                    >
                      {locale === "fa" ? `ست ${i + 1}` : `S${i + 1}`}: {s.weight}kg × {s.reps}
                      {missed ? (
                        <span className="font-normal opacity-80">
                          {" "}
                          / {planned}
                        </span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
              {h.note && (
                <p
                  className="text-xs mt-2 leading-relaxed"
                  style={{ color: "var(--muted)", whiteSpace: "pre-wrap" }}
                >
                  {h.note}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
