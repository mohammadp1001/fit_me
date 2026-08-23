"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

/**
 * The coach's proposed program, and the decision about it.
 *
 * Discoverable without hunting: a banner appears above the program the moment a
 * proposal exists, and opens the review inline. A draft the user never sees is
 * a feature that does nothing.
 *
 * The screen shows what would *change*, not the YAML. The user is being asked
 * to replace what they are following, and the only question they have is which
 * exercises are new, which are gone, and which moved.
 */

type ExerciseChange =
  | { kind: "added"; name: string; sets: number; reps: number[]; note: string }
  | { kind: "removed"; name: string; sets: number; reps: number[] }
  | {
      kind: "changed";
      name: string;
      from: { sets: number; reps: number[] };
      to: { sets: number; reps: number[] };
      note: string;
    }
  | { kind: "unchanged"; name: string; sets: number; reps: number[] };

type DayChange = {
  name: string;
  previousName: string | null;
  kind: "added" | "removed" | "changed" | "unchanged";
  exercises: ExerciseChange[];
};

type Draft = {
  id: number;
  name: string;
  rationale: string;
  diff: {
    programName: { from: string; to: string; changed: boolean };
    days: DayChange[];
    totals: { added: number; removed: number; changed: number; unchanged: number };
    identical: boolean;
  };
};

const TONE = {
  added: { color: "var(--green)", background: "#16302b", mark: "+" },
  removed: { color: "#e8836a", background: "#3a221c", mark: "−" },
  changed: { color: "#e0b341", background: "#332a14", mark: "→" },
  unchanged: { color: "var(--muted)", background: "transparent", mark: "" },
} as const;

const setsLabel = (sets: number, reps: number[]) =>
  `${sets} × ${reps.join(", ")}`;

export default function ProgramProposal({
  initial,
}: {
  initial: Draft | null;
}) {
  const t = useTranslations();
  const router = useRouter();
  // Server-rendered, so the banner is present on first paint. This is the one
  // thing on the screen that needs an answer - it should not pop in.
  const [draft, setDraft] = useState<Draft | null>(initial);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"approve" | "discard" | null>(null);
  const [confirming, setConfirming] = useState<"approve" | "discard" | null>(null);
  const [error, setError] = useState("");

  async function decide(action: "approve" | "discard") {
    if (!draft) return;
    setBusy(action);
    setError("");
    try {
      const res = await fetch("/api/programs/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: draft.id, action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? t("common.error"));
        return;
      }
      setDraft(null);
      setOpen(false);
      router.refresh();
    } finally {
      setBusy(null);
      setConfirming(null);
    }
  }

  if (!draft) return null;

  const { totals } = draft.diff;
  const summary = [
    totals.added > 0 ? t("proposal.countAdded", { count: totals.added }) : null,
    totals.removed > 0 ? t("proposal.countRemoved", { count: totals.removed }) : null,
    totals.changed > 0 ? t("proposal.countChanged", { count: totals.changed }) : null,
  ].filter(Boolean);

  return (
    <div className="px-4 pt-4">
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: "var(--surface)", border: "1px solid #3a3a1c" }}
      >
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 text-start"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
          aria-expanded={open}
        >
          <span className="text-xl">🧠</span>
          <span className="flex-1">
            <span
              className="block text-sm font-bold"
              style={{ color: "var(--text)" }}
            >
              {t("proposal.title")}
            </span>
            <span className="block text-xs mt-0.5" style={{ color: "var(--muted)" }}>
              {draft.name}
              {summary.length > 0 ? ` · ${summary.join(" · ")}` : ""}
            </span>
          </span>
          <span style={{ color: "var(--muted)" }}>{open ? "▲" : "▼"}</span>
        </button>

        {open && (
          <div className="px-4 pb-4 flex flex-col gap-4">
            {/* Why, before what. A diff with no reason is not a decision aid. */}
            <p
              className="text-xs leading-relaxed rounded-xl px-3 py-2"
              style={{
                background: "var(--surface2)",
                color: "var(--text)",
                whiteSpace: "pre-wrap",
              }}
            >
              {draft.rationale}
            </p>

            {draft.diff.programName.changed && (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {t("proposal.renamed", {
                  from: draft.diff.programName.from,
                  to: draft.diff.programName.to,
                })}
              </p>
            )}

            {draft.diff.identical ? (
              <p className="text-xs" style={{ color: "var(--muted)" }}>
                {t("proposal.noChanges")}
              </p>
            ) : (
              draft.diff.days.map((day, i) => (
                <div key={`${day.name}-${i}`} className="flex flex-col gap-1">
                  <div
                    className="text-xs font-bold"
                    style={{ color: "var(--text)" }}
                  >
                    {day.name}
                    {day.previousName && (
                      <span className="font-normal" style={{ color: "var(--muted)" }}>
                        {" "}
                        ({t("proposal.was", { name: day.previousName })})
                      </span>
                    )}
                    {day.kind === "added" && (
                      <span style={{ color: TONE.added.color }}> · {t("proposal.newDay")}</span>
                    )}
                    {day.kind === "removed" && (
                      <span style={{ color: TONE.removed.color }}>
                        {" "}
                        · {t("proposal.droppedDay")}
                      </span>
                    )}
                  </div>

                  {day.exercises.map((change, j) => {
                    const tone = TONE[change.kind];
                    return (
                      <div
                        key={j}
                        className="flex items-baseline gap-2 rounded-lg px-2 py-1"
                        style={{ background: tone.background }}
                      >
                        <span
                          className="text-xs font-bold w-3 flex-shrink-0 text-center"
                          style={{ color: tone.color, direction: "ltr" }}
                        >
                          {tone.mark}
                        </span>
                        <span
                          className="text-xs flex-1"
                          style={{
                            color:
                              change.kind === "unchanged"
                                ? "var(--muted)"
                                : "var(--text)",
                          }}
                        >
                          {change.name}
                        </span>
                        <span
                          className="text-xs tabular-nums"
                          style={{ color: tone.color, direction: "ltr" }}
                        >
                          {change.kind === "changed"
                            ? `${setsLabel(change.from.sets, change.from.reps)} → ${setsLabel(change.to.sets, change.to.reps)}`
                            : setsLabel(change.sets, change.reps)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))
            )}

            {error && (
              <p className="text-xs" style={{ color: "#e8836a" }}>
                {error}
              </p>
            )}

            {/* Two taps for both actions. Neither replacing a training block
                nor throwing away a proposal should happen on a stray tap. */}
            <div className="flex gap-2">
              <button
                onClick={() =>
                  confirming === "discard" ? decide("discard") : setConfirming("discard")
                }
                disabled={busy !== null}
                className="flex-1 py-2 rounded-xl text-sm font-bold"
                style={{
                  background: "var(--surface2)",
                  color: confirming === "discard" ? "#e8836a" : "var(--muted)",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {confirming === "discard"
                  ? t("proposal.confirmDiscard")
                  : t("proposal.discard")}
              </button>
              <button
                onClick={() =>
                  confirming === "approve" ? decide("approve") : setConfirming("approve")
                }
                disabled={busy !== null}
                className="flex-1 py-2 rounded-xl text-sm font-bold text-white"
                style={{
                  background: confirming === "approve" ? "#1d7a4c" : "#2563eb",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                {busy === "approve"
                  ? t("common.loading")
                  : confirming === "approve"
                    ? t("proposal.confirmApprove")
                    : t("proposal.approve")}
              </button>
            </div>
            <p className="text-xs" style={{ color: "var(--muted2)" }}>
              {t("proposal.footnote")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
