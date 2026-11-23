import * as v from "valibot";

import type { ParticipantGender } from "./enums";
import { aggregateKindSchema } from "./template";
import type { Aggregate, Exercise, RawMetrics, ScoringBracket, TemplateConfig } from "./template";

/**
 * Scoring lives here, in `shared`, so the backend can compute the authoritative score on submit and
 * the frontend can show the same numbers live as the participant types.
 */

/** The participant attributes that scoring can depend on. Both may be unknown. */
export type Scorable = {
  age?: number | null;
  gender?: ParticipantGender | null;
};

export const exerciseScoreSchema = v.object({
  key: v.string(),
  name: v.string(),
  /** The submitted measurement, or `null` if the exercise was not performed. */
  value: v.nullable(v.number()),
  points: v.number(),
  /** `null` when the exercise awards no points (`scoring.kind === "none"`). */
  maxPoints: v.nullable(v.number()),
  passPoints: v.nullable(v.number()),
  /** `null` when the exercise has no pass mark of its own. */
  passed: v.nullable(v.boolean()),
});

/**
 * The stored shape of `challenge_result.scores`. Snapshotting this on submit keeps historical
 * results and leaderboards stable when a template is edited later.
 */
export const scoreBreakdownSchema = v.object({
  exercises: v.array(exerciseScoreSchema),
  /** Points under `sum`/`average`, total seconds under `rawTimeSum`. */
  total: v.number(),
  /** `null` when the total is not a points score. */
  maxTotal: v.nullable(v.number()),
  passTotal: v.nullable(v.number()),
  /** `null` when the template sets no overall pass mark. */
  passed: v.nullable(v.boolean()),
  aggregate: aggregateKindSchema,
  /** How to rank a leaderboard on `total`. */
  lowerIsBetter: v.boolean(),
});

export type ExerciseScore = v.InferOutput<typeof exerciseScoreSchema>;
export type ScoreBreakdown = v.InferOutput<typeof scoreBreakdownSchema>;

const matchesBracket = (bracket: ScoringBracket, { age, gender }: Scorable) => {
  if (bracket.gender !== undefined && bracket.gender !== gender) return false;
  if (bracket.minAge !== undefined || bracket.maxAge !== undefined) {
    if (age === null || age === undefined) return false;
    if (bracket.minAge !== undefined && age < bracket.minAge) return false;
    if (bracket.maxAge !== undefined && age > bracket.maxAge) return false;
  }
  return true;
};

/**
 * A lower-is-better measurement of zero means "not performed", matching FIZO202 where a 3 km run
 * time of 0 scores nothing rather than a perfect score.
 */
const notPerformed = (exercise: Exercise, value: number | null) =>
  value === null || (!exercise.higherIsBetter && value <= 0);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** Points for one exercise. Returns 0 whenever the measurement reaches no threshold. */
export const scoreExercise = (exercise: Exercise, value: number | null, participant: Scorable): number => {
  const { scoring } = exercise;
  if (scoring.kind === "none") return 0;
  if (notPerformed(exercise, value)) return 0;

  const measured = value as number;

  if (scoring.kind === "linear") {
    const span = scoring.full - scoring.zero;
    if (span === 0) return measured === scoring.full ? scoring.maxPoints : 0;
    const ratio = (measured - scoring.zero) / span;
    return clamp(Math.round(ratio * scoring.maxPoints), 0, scoring.maxPoints);
  }

  // The first matching bracket wins, so configs list specific brackets before general ones.
  const bracket = scoring.brackets.find((b) => matchesBracket(b, participant));
  if (!bracket) return 0;

  // Best points among every threshold the measurement reaches.
  let points = 0;
  for (const row of bracket.rows) {
    const reached = exercise.higherIsBetter ? measured >= row.value : measured <= row.value;
    if (reached && row.points > points) points = row.points;
  }
  return Math.min(points, scoring.maxPoints);
};

/** The highest points an exercise can award, or `null` if it awards none. */
export const exerciseMaxPoints = (exercise: Exercise): number | null => {
  const { scoring } = exercise;
  if (scoring.kind === "none") return null;
  if (scoring.kind === "linear") return scoring.maxPoints;
  const best = Math.max(...scoring.brackets.flatMap((b) => b.rows.map((r) => r.points)));
  return Math.min(best, scoring.maxPoints);
};

const aggregate = (kind: Aggregate["kind"], values: number[]) => {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return kind === "average" ? Math.round((sum / values.length) * 100) / 100 : sum;
};

/**
 * Scores a whole submission. This is what the backend stores on the result row, so a later template
 * edit cannot rewrite history.
 */
export const scoreResult = (config: TemplateConfig, metrics: RawMetrics, participant: Scorable): ScoreBreakdown => {
  const exercises: ExerciseScore[] = config.exercises.map((exercise) => {
    const value = metrics[exercise.key] ?? null;
    const points = scoreExercise(exercise, value, participant);
    const passPoints = exercise.passPoints ?? null;
    return {
      key: exercise.key,
      name: exercise.name,
      value,
      points,
      maxPoints: exerciseMaxPoints(exercise),
      passPoints,
      passed: passPoints === null ? null : points >= passPoints,
    };
  });

  const { kind, passTotal } = config.aggregate;

  // `rawTimeSum` totals the measurements themselves (Hyrox: the finish time is the result), so a
  // missing exercise contributes nothing and the lowest total wins.
  const total =
    kind === "rawTimeSum"
      ? aggregate(
          "sum",
          exercises.map((e) => e.value ?? 0)
        )
      : aggregate(
          kind,
          exercises.map((e) => e.points)
        );

  const scored = config.exercises.map(exerciseMaxPoints).filter((max): max is number => max !== null);
  const maxTotal = kind === "rawTimeSum" || scored.length === 0 ? null : aggregate(kind, scored);

  // FIZO202 requires both marks: 60 points in every exercise *and* 180 in total. So a template that
  // sets either kind of pass mark fails a submission that misses any of them.
  const totalPassed =
    passTotal === undefined ? null : kind === "rawTimeSum" ? total > 0 && total <= passTotal : total >= passTotal;
  const exercisesPassed = exercises.every((score) => score.passed !== false);
  const hasExerciseMark = exercises.some((score) => score.passed !== null);

  return {
    exercises,
    total,
    maxTotal,
    passTotal: passTotal ?? null,
    passed: totalPassed === null && !hasExerciseMark ? null : (totalPassed ?? true) && exercisesPassed,
    aggregate: kind,
    lowerIsBetter: kind === "rawTimeSum",
  };
};

export type ExerciseTarget = { points: number; value: number };

/**
 * The thresholds that apply to one participant, lowest points first — a generalised version of
 * FIZO202's "your personal 60/100-point targets" table. Empty when the exercise awards no points or
 * no bracket matches the participant (typically a missing age or gender).
 */
export const exerciseTargets = (exercise: Exercise, participant: Scorable): ExerciseTarget[] => {
  const { scoring } = exercise;
  if (scoring.kind === "none") return [];
  if (scoring.kind === "linear") {
    return [
      { points: 0, value: scoring.zero },
      { points: scoring.maxPoints, value: scoring.full },
    ];
  }

  const bracket = scoring.brackets.find((b) => matchesBracket(b, participant));
  if (!bracket) return [];
  return [...bracket.rows].sort((a, b) => a.points - b.points);
};

/**
 * Whether scoring this exercise needs participant details that are missing, which would otherwise
 * silently score zero.
 */
export const missingScorableFields = (config: TemplateConfig, participant: Scorable): ("age" | "gender")[] => {
  const needsBrackets = config.exercises.some((e) => e.scoring.kind === "table");
  if (!needsBrackets) return [];

  const missing: ("age" | "gender")[] = [];
  if (config.requiresAge && (participant.age === null || participant.age === undefined)) missing.push("age");
  if (config.requiresGender && !participant.gender) missing.push("gender");
  return missing;
};

/** Ranks results for a leaderboard, best first. Ties keep their relative order. */
export const rankByScore = <T>(entries: T[], score: (entry: T) => number, lowerIsBetter: boolean): T[] =>
  entries
    .map((entry, index) => ({ entry, index, value: score(entry) }))
    .sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value) || a.index - b.index)
    .map(({ entry }) => entry);
