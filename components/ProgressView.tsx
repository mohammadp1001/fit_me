"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ProgramData, DAY_COLORS } from "./AppShell";
import {
  MUSCLE_GROUP,
  MUSCLE_GROUP_LABEL,
  MuscleGroup,
  WEEKLY_SET_FLOOR,
  WEEKLY_SET_CEILING,
  type VolumeVerdict,
} from "@/lib/muscles";

const VERDICT_COLOR: Record<VolumeVerdict, string> = {
  low: "#f59e0b",
  adequate: "#16a34a",
  high: "#e85d26",
};

function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ProgressView({
  locale,
  program,
}: {
  locale: string;
  program: ProgramData;
}) {
  const t = useTranslations();
  const [bodyWeights, setBodyWeights] = useState<
    Array<{ date: string; weightKg: number }>
  >([]);
  const [newWeight, setNewWeight] = useState("");
  const [newDate, setNewDate] = useState(getToday());
  const [saveMsg, setSaveMsg] = useState("");

  const [selectedExerciseId, setSelectedExerciseId] = useState<number | null>(
    null
  );
  const [exerciseLogs, setExerciseLogs] = useState<
    Array<{ date: string; bestWeight: number }>
  >([]);

  const [volume, setVolume] = useState<
    Array<{ group: MuscleGroup; sets: number; verdict: VolumeVerdict }>
  >([]);
  const [volumeWindowDays, setVolumeWindowDays] = useState(7);

  // All exercises from program for the selector
  const allExercises = program.days.flatMap((d) =>
    d.exercises.map((pe) => ({ ...pe, dayNumber: d.dayNumber }))
  );

  // Groups the active program is meant to train. Kept in the chart even at zero
  // sets, because "your program trains hamstrings and you logged none" is the
  // single most useful thing this view can say. Groups the program never trains
  // are dropped so the chart isn't padded with permanent zeroes.
  const programmedGroups = new Set<MuscleGroup>(
    allExercises.flatMap((pe) =>
      [...pe.exercise.musclesPrimary, ...pe.exercise.musclesSecondary].map(
        (m) => MUSCLE_GROUP[m]
      )
    )
  );

  const volumeData = volume
    .filter((v) => v.sets > 0 || programmedGroups.has(v.group))
    .map((v) => ({
      ...v,
      label: MUSCLE_GROUP_LABEL[v.group][locale === "fa" ? "fa" : "en"],
    }));

  // Fixed 5-set gridlines, always extending past the ceiling landmark so both
  // reference lines stay on-chart even in a light week. Letting recharts pick
  // ticks against a dynamic max produced uneven steps (0, 7, 14, 25).
  const volumeAxisMax = Math.max(
    Math.ceil(Math.max(0, ...volumeData.map((v) => v.sets)) / 5) * 5,
    WEEKLY_SET_CEILING + 5
  );
  const volumeTicks = Array.from(
    { length: volumeAxisMax / 5 + 1 },
    (_, i) => i * 5
  );

  useEffect(() => {
    fetch("/api/volume")
      .then((r) => r.json())
      .then((data) => {
        setVolume(data.groups ?? []);
        if (data.windowDays) setVolumeWindowDays(data.windowDays);
      })
      .catch(() => setVolume([]));
  }, []);

  useEffect(() => {
    fetch("/api/body-weight")
      .then((r) => r.json())
      .then((data) => {
        setBodyWeights(
          data.entries.map((e: { date: string; weightKg: number }) => ({
            date: e.date.split("T")[0],
            weightKg: e.weightKg,
          }))
        );
      });
  }, []);

  useEffect(() => {
    if (!selectedExerciseId) return;
    fetch(`/api/logs?exerciseId=${selectedExerciseId}`)
      .then((r) => r.json())
      .then((data) => {
        const byDate = new Map<string, number>();
        for (const log of data.logs) {
          const date = log.date.split("T")[0];
          const best = Math.max(
            ...log.sets
              .map((s: { weight: number | null }) => s.weight || 0)
              .filter((w: number) => w > 0)
          );
          if (best > 0) {
            byDate.set(date, Math.max(byDate.get(date) || 0, best));
          }
        }
        setExerciseLogs(
          Array.from(byDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, bestWeight]) => ({ date, bestWeight }))
        );
      });
  }, [selectedExerciseId]);

  async function handleSaveWeight() {
    if (!newWeight || isNaN(Number(newWeight))) return;
    const res = await fetch("/api/body-weight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weightKg: Number(newWeight), date: newDate }),
    });
    if (res.ok) {
      setSaveMsg("✓");
      setTimeout(() => setSaveMsg(""), 2000);
      setBodyWeights((prev) => {
        const filtered = prev.filter((w) => w.date !== newDate);
        return [...filtered, { date: newDate, weightKg: Number(newWeight) }].sort(
          (a, b) => a.date.localeCompare(b.date)
        );
      });
      setNewWeight("");
    }
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <h1 className="text-lg font-black mb-4" style={{ color: "var(--text)" }}>
        {t("progress.title")}
      </h1>

      {/* Body weight */}
      <section
        className="rounded-2xl p-4 mb-4"
        style={{ background: "var(--surface)" }}
      >
        <h2
          className="text-sm font-bold mb-3"
          style={{ color: "var(--text)" }}
        >
          {t("progress.bodyWeight")}
        </h2>

        {/* Log form */}
        <div className="flex gap-2 mb-4 items-center">
          <input
            type="number"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            placeholder="70"
            inputMode="decimal"
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              direction: "ltr",
            }}
          />
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              direction: "ltr",
            }}
          />
          <button
            onClick={handleSaveWeight}
            className="px-4 py-2 rounded-xl text-sm font-bold text-white"
            style={{
              background: "#16a34a",
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            {saveMsg || t("progress.save")}
          </button>
        </div>

        {bodyWeights.length > 1 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={bodyWeights}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#666" }}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#666" }}
                domain={["auto", "auto"]}
                tickFormatter={(v) => `${v}kg`}
              />
              <Tooltip
                contentStyle={{
                  background: "#1e1e1e",
                  border: "1px solid #2a2a2a",
                  color: "#f0ede8",
                  fontSize: 12,
                }}
                formatter={(v) => [`${v}kg`, t("progress.weightKg")]}
              />
              <Line
                type="monotone"
                dataKey="weightKg"
                stroke="#4ade80"
                strokeWidth={2}
                dot={{ r: 3, fill: "#4ade80" }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-center py-4" style={{ color: "var(--muted2)" }}>
            {t("progress.noData")}
          </p>
        )}
      </section>

      {/* Weekly volume per muscle group */}
      <section
        className="rounded-2xl p-4"
        style={{ background: "var(--surface)" }}
      >
        <h2 className="text-sm font-bold mb-1" style={{ color: "var(--text)" }}>
          {locale === "fa" ? "حجم تمرین هر گروه عضلانی" : "Volume by Muscle Group"}
        </h2>
        <p className="text-xs mb-3" style={{ color: "var(--muted2)" }}>
          {locale === "fa"
            ? `ست‌های انجام‌شده در ${volumeWindowDays} روز گذشته (حرکت کمکی نیم ست)`
            : `Hard sets logged in the last ${volumeWindowDays} days (a secondary mover counts as half)`}
        </p>

        {volumeData.length > 0 ? (
          // Recharts lays a category axis out left-to-right regardless of the
          // ambient direction; under RTL the tick labels get clipped against
          // the plot area. Pinning the chart to LTR keeps the axis intact -
          // the labels themselves still shape correctly as Persian text.
          <div style={{ direction: "ltr" }}>
          <ResponsiveContainer width="100%" height={volumeData.length * 30 + 30}>
            <BarChart
              data={volumeData}
              layout="vertical"
              margin={{ top: 0, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fontSize: 10, fill: "#666" }}
                allowDecimals={false}
                domain={[0, volumeAxisMax]}
                ticks={volumeTicks}
              />
              <YAxis
                type="category"
                dataKey="label"
                // Wide enough for the longest Persian group label
                // ("نزدیک‌کننده") without truncation.
                width={92}
                tick={{ fontSize: 10, fill: "#666" }}
              />
              {/* Landmark bands: below the floor is undertrained, above the
                  ceiling is likely more than can be recovered from. */}
              <ReferenceLine x={WEEKLY_SET_FLOOR} stroke="#f59e0b" strokeDasharray="4 4" />
              <ReferenceLine x={WEEKLY_SET_CEILING} stroke="#e85d26" strokeDasharray="4 4" />
              <Tooltip
                cursor={{ fill: "#ffffff08" }}
                contentStyle={{
                  background: "#1e1e1e",
                  border: "1px solid #2a2a2a",
                  color: "#f0ede8",
                  fontSize: 12,
                }}
                formatter={(v) => [
                  `${v}`,
                  locale === "fa" ? "ست" : "sets",
                ]}
              />
              <Bar dataKey="sets" radius={[0, 4, 4, 0]}>
                {volumeData.map((entry) => (
                  <Cell key={entry.group} fill={VERDICT_COLOR[entry.verdict]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </div>
        ) : (
          <p
            className="text-sm text-center py-4"
            style={{ color: "var(--muted2)" }}
          >
            {t("progress.noData")}
          </p>
        )}
      </section>

      {/* Exercise progress */}
      <section
        className="rounded-2xl p-4"
        style={{ background: "var(--surface)" }}
      >
        <h2
          className="text-sm font-bold mb-3"
          style={{ color: "var(--text)" }}
        >
          {locale === "fa" ? "پیشرفت حرکات" : "Exercise Progress"}
        </h2>

        <select
          value={selectedExerciseId || ""}
          onChange={(e) =>
            setSelectedExerciseId(e.target.value ? Number(e.target.value) : null)
          }
          className="w-full rounded-xl px-3 py-2 text-sm mb-4 outline-none"
          style={{
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            color: selectedExerciseId ? "var(--text)" : "var(--muted)",
            fontFamily: "inherit",
            direction: locale === "fa" ? "rtl" : "ltr",
          }}
        >
          <option value="">{t("progress.selectExercise")}</option>
          {allExercises.map((pe) => (
            <option key={pe.exercise.id} value={pe.exercise.id}>
              {locale === "fa" ? pe.exercise.nameFa : pe.exercise.nameEn}
            </option>
          ))}
        </select>

        {selectedExerciseId && exerciseLogs.length > 1 ? (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={exerciseLogs}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 10, fill: "#666" }}
                tickFormatter={(v) => v.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#666" }}
                domain={["auto", "auto"]}
                tickFormatter={(v) => `${v}kg`}
              />
              <Tooltip
                contentStyle={{
                  background: "#1e1e1e",
                  border: "1px solid #2a2a2a",
                  color: "#f0ede8",
                  fontSize: 12,
                }}
                formatter={(v) => [`${v}kg`, t("progress.bestSet")]}
              />
              <Line
                type="monotone"
                dataKey="bestWeight"
                stroke={
                  DAY_COLORS[
                    allExercises.find(
                      (pe) => pe.exercise.id === selectedExerciseId
                    )?.dayNumber || 1
                  ]
                }
                strokeWidth={2}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : selectedExerciseId && exerciseLogs.length <= 1 ? (
          <p
            className="text-sm text-center py-4"
            style={{ color: "var(--muted2)" }}
          >
            {t("progress.noData")}
          </p>
        ) : null}
      </section>
    </div>
  );
}
