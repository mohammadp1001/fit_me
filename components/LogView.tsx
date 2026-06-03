"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DAY_COLORS } from "./AppShell";

type LogEntry = {
  id: number;
  date: string;
  sets: Array<{ weight: number | null; reps: number | null }>;
  programExercise: {
    exercise: { nameFa: string; nameEn: string };
    day: { dayNumber: number; nameFa: string; nameEn: string };
  };
};

type GroupedExercise = {
  nameFa: string;
  nameEn: string;
  dayNumber: number;
  dayNameFa: string;
  dayNameEn: string;
  sessions: Array<{ date: string; sets: LogEntry["sets"] }>;
};

export default function LogView({ locale }: { locale: string }) {
  const t = useTranslations();
  const [grouped, setGrouped] = useState<GroupedExercise[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/logs");
        if (!res.ok) return;
        const data = await res.json();
        const logs: LogEntry[] = data.logs;

        const map = new Map<string, GroupedExercise>();
        for (const log of logs) {
          const key = log.programExercise.exercise.nameFa;
          if (!map.has(key)) {
            map.set(key, {
              nameFa: log.programExercise.exercise.nameFa,
              nameEn: log.programExercise.exercise.nameEn,
              dayNumber: log.programExercise.day.dayNumber,
              dayNameFa: log.programExercise.day.nameFa,
              dayNameEn: log.programExercise.day.nameEn,
              sessions: [],
            });
          }
          map.get(key)!.sessions.push({
            date: log.date.split("T")[0],
            sets: log.sets,
          });
        }

        setGrouped(Array.from(map.values()));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {t("common.loading")}
        </p>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <h1 className="text-lg font-black mb-4" style={{ color: "var(--text)" }}>
        {t("log.title")}
      </h1>

      {grouped.length === 0 ? (
        <div
          className="text-center py-16"
          style={{ color: "var(--muted2)" }}
        >
          <p className="text-sm mb-2">{t("log.empty")}</p>
          <p className="text-xs" style={{ color: "#333" }}>
            {t("log.emptyHint")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {grouped.map((ex) => {
            const color = DAY_COLORS[ex.dayNumber] || "#888";
            const name = locale === "fa" ? ex.nameFa : ex.nameEn;
            const dayName = locale === "fa" ? ex.dayNameFa : ex.dayNameEn;

            return (
              <div
                key={ex.nameFa}
                className="rounded-2xl p-4"
                style={{
                  background: "var(--surface)",
                  borderRight: `3px solid ${color}`,
                }}
              >
                <div
                  className="text-sm font-bold mb-1"
                  style={{ color: "var(--text)" }}
                >
                  {name}
                </div>
                <div
                  className="text-xs mb-3"
                  style={{ color }}
                >
                  {dayName}
                </div>

                {ex.sessions.map((session) => (
                  <div key={session.date} className="mb-3">
                    <div
                      className="text-xs mb-1"
                      style={{ color: "#555", direction: "ltr", textAlign: locale === "fa" ? "right" : "left" }}
                    >
                      {session.date}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {session.sets.map((s, i) =>
                        s.weight ? (
                          <span
                            key={i}
                            className="px-2 py-1 rounded-full text-xs"
                            style={{
                              background: "var(--surface2)",
                              color: "#bbb",
                            }}
                          >
                            {locale === "fa" ? `ست ${i + 1}` : `S${i + 1}`}: {s.weight}kg
                            {s.reps ? ` × ${s.reps}` : ""}
                          </span>
                        ) : null
                      )}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
