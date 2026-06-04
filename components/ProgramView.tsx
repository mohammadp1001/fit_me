"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DAY_COLORS, ProgramData, ProgramExerciseData } from "./AppShell";
import ExerciseDetail from "./ExerciseDetail";

export default function ProgramView({
  locale,
  program,
}: {
  locale: string;
  program: ProgramData;
}) {
  const t = useTranslations();
  const [activeDay, setActiveDay] = useState(1);
  const [selectedEx, setSelectedEx] = useState<ProgramExerciseData | null>(
    null
  );

  const day = program.days.find((d) => d.dayNumber === activeDay);
  const color = DAY_COLORS[activeDay] || "#888";

  if (selectedEx) {
    return (
      <ExerciseDetail
        locale={locale}
        programExercise={selectedEx}
        dayColor={DAY_COLORS[activeDay] || "#888"}
        onBack={() => setSelectedEx(null)}
      />
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        className="sticky top-0 z-10"
        style={{ background: "#111", borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex justify-between items-center px-4 py-3">
          <span
            className="text-xs font-semibold"
            style={{ color: "var(--muted)" }}
          >
            {locale === "fa" ? program.nameFa : program.nameEn}
          </span>
          <span
            className="text-lg font-black"
            style={{ color: "var(--text)" }}
          >
            {t("app.name")}
          </span>
        </div>
        {/* Day tabs */}
        <div className="flex gap-2 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {program.days.map((d) => {
            const dc = DAY_COLORS[d.dayNumber] || "#888";
            const isActive = d.dayNumber === activeDay;
            return (
              <button
                key={d.id}
                onClick={() => setActiveDay(d.dayNumber)}
                className="px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap flex-shrink-0 transition-all"
                style={{
                  background: isActive ? dc : "var(--surface2)",
                  color: isActive ? "#fff" : "var(--muted)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {locale === "fa" ? d.nameFa.split("—")[0]?.trim() || d.nameFa : d.nameEn.split("—")[0]?.trim() || d.nameEn}
              </button>
            );
          })}
        </div>
      </div>

      {/* Exercise list */}
      <div className="px-4 pt-4">
        {day && (
          <>
            <div
              className="text-sm font-bold mb-3"
              style={{ color }}
            >
              {locale === "fa" ? day.nameFa : day.nameEn}
            </div>
            <ExerciseList
              locale={locale}
              exercises={day.exercises}
              dayColor={color}
              onSelect={setSelectedEx}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ExerciseList({
  locale,
  exercises,
  dayColor,
  onSelect,
}: {
  locale: string;
  exercises: ProgramExerciseData[];
  dayColor: string;
  onSelect: (ex: ProgramExerciseData) => void;
}) {
  const t = useTranslations();
  const groups: { group: string | null; items: ProgramExerciseData[] }[] = [];

  for (const ex of exercises) {
    if (ex.supersetGroup) {
      const existing = groups.find((g) => g.group === ex.supersetGroup);
      if (existing) {
        existing.items.push(ex);
      } else {
        groups.push({ group: ex.supersetGroup, items: [ex] });
      }
    } else {
      groups.push({ group: null, items: [ex] });
    }
  }

  return (
    <div className="flex flex-col gap-0">
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.group && (
            <div
              className="text-xs font-bold py-1 px-3 mb-1 mt-2 rounded-r-lg"
              style={{
                background: "#1f1700",
                borderRight: "3px solid #f59e0b",
                color: "#f59e0b",
              }}
            >
              ⚡ {t("program.superset")}
            </div>
          )}
          {group.items.map((ex) => {
            const borderColor = group.group ? "#f59e0b" : dayColor;
            const repsLabel = ex.reps.join("، ");
            const name =
              locale === "fa" ? ex.exercise.nameFa : ex.exercise.nameEn;
            const muscles = ex.exercise.muscles.join(" · ");
            return (
              <button
                key={ex.id}
                onClick={() => onSelect(ex)}
                className="w-full rounded-xl p-4 mb-2 flex justify-between items-center text-right transition-colors"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  borderRight: `3px solid ${borderColor}`,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                <div className="flex-1 text-right">
                  <div
                    className="text-sm font-bold mb-1"
                    style={{ color: "var(--text)" }}
                  >
                    {name}
                  </div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>
                    {ex.setsCount} {t("program.sets")} | {repsLabel}{" "}
                    {t("program.reps")}
                  </div>
                  {muscles && (
                    <div
                      className="text-xs mt-1"
                      style={{ color: "var(--muted2)" }}
                    >
                      {muscles}
                    </div>
                  )}
                </div>
                <span
                  className="text-lg mr-2"
                  style={{ color: "var(--muted2)" }}
                >
                  ‹
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
