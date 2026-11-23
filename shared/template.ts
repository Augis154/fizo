import * as v from "valibot";

import { ParticipantGender } from "./enums";

/**
 * A template's `config` column describes which exercises a challenge measures and how each
 * measurement turns into points. Everything here is stored as JSON in `template.config`, so it is
 * validated on the way in rather than enforced by the database.
 */

export const exerciseUnitSchema = v.picklist(["reps", "seconds", "kg", "meters"]);

/** How the result form renders the field. `time` shows a mm:ss pair but still stores seconds. */
export const exerciseInputSchema = v.picklist(["number", "time"]);

export const aggregateKindSchema = v.picklist(["sum", "average", "rawTimeSum"]);

/** One threshold row: reaching `value` is worth `points`. */
export const scoringRowSchema = v.object({
  value: v.number(),
  points: v.pipe(v.number(), v.minValue(0)),
});

/**
 * A set of thresholds that applies to one group of participants. An absent `gender`, `minAge` or
 * `maxAge` means "no constraint on this", so `{ rows }` alone applies to everybody. Both age bounds
 * are inclusive.
 */
export const scoringBracketSchema = v.object({
  gender: v.optional(v.enum(ParticipantGender)),
  minAge: v.optional(v.pipe(v.number(), v.minValue(0))),
  maxAge: v.optional(v.pipe(v.number(), v.minValue(0))),
  rows: v.pipe(v.array(scoringRowSchema), v.minLength(1)),
});

export const scoringSchema = v.variant("kind", [
  /** No points: the raw value is the result. Hyrox-style events rank on time alone. */
  v.object({ kind: v.literal("none") }),

  /**
   * Straight-line interpolation: `zero` scores 0 points and `full` scores `maxPoints`, with values
   * in between scaled and anything outside clamped. For a lower-is-better exercise put the slower
   * value in `zero` (e.g. `zero: 1200, full: 690` for a 3 km run).
   */
  v.object({
    kind: v.literal("linear"),
    zero: v.number(),
    full: v.number(),
    maxPoints: v.optional(v.pipe(v.number(), v.minValue(1)), 100),
  }),

  /**
   * Threshold lookup, the way the real FIZO202 / army tables work — points come from a table, not a
   * formula. The first bracket that matches the participant wins, so order brackets from most to
   * least specific.
   */
  v.object({
    kind: v.literal("table"),
    maxPoints: v.optional(v.pipe(v.number(), v.minValue(1)), 100),
    brackets: v.pipe(v.array(scoringBracketSchema), v.minLength(1)),
  }),
]);

export const exerciseSchema = v.object({
  /** Stable identifier used as the key in a result's `rawMetrics`. */
  key: v.pipe(v.string(), v.regex(/^[a-zA-Z][a-zA-Z0-9_]*$/), v.maxLength(50)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  unit: exerciseUnitSchema,
  input: v.optional(exerciseInputSchema, "number"),
  higherIsBetter: v.boolean(),
  /** Whether a result may be submitted without this exercise. */
  required: v.optional(v.boolean(), true),
  /** Points needed to pass this exercise on its own (60 in FIZO202). Omit for no per-exercise mark. */
  passPoints: v.optional(v.pipe(v.number(), v.minValue(0))),
  scoring: scoringSchema,
});

export const aggregateSchema = v.object({
  kind: aggregateKindSchema,
  /** Total needed to pass overall (180 in FIZO202). */
  passTotal: v.optional(v.pipe(v.number(), v.minValue(0))),
});

const templateConfigObjectSchema = v.object({
  exercises: v.pipe(v.array(exerciseSchema), v.minLength(1)),
  /** Set when any exercise's table brackets are age-dependent, so the join form can require it. */
  requiresAge: v.optional(v.boolean(), false),
  requiresGender: v.optional(v.boolean(), false),
  aggregate: aggregateSchema,
});

export const templateConfigSchema = v.pipe(
  templateConfigObjectSchema,
  v.check(
    ({ exercises }) => new Set(exercises.map((e) => e.key)).size === exercises.length,
    "Exercise keys must be unique"
  )
);

export type ExerciseUnit = v.InferOutput<typeof exerciseUnitSchema>;
export type ExerciseInput = v.InferOutput<typeof exerciseInputSchema>;
export type AggregateKind = v.InferOutput<typeof aggregateKindSchema>;
export type ScoringRow = v.InferOutput<typeof scoringRowSchema>;
export type ScoringBracket = v.InferOutput<typeof scoringBracketSchema>;
export type Scoring = v.InferOutput<typeof scoringSchema>;
export type Exercise = v.InferOutput<typeof exerciseSchema>;
export type Aggregate = v.InferOutput<typeof aggregateSchema>;
export type TemplateConfig = v.InferOutput<typeof templateConfigSchema>;

export const parseTemplateConfig = (config: unknown): TemplateConfig => v.parse(templateConfigSchema, config);

/** Validates a stored config, which may predate the current schema. */
export const safeParseTemplateConfig = (config: unknown) => v.safeParse(templateConfigSchema, config);

/** Raw metrics are a flat `exerciseKey -> measurement` map; `null` means "not performed". */
export const rawMetricsSchema = v.record(v.string(), v.nullable(v.number()));

export type RawMetrics = v.InferOutput<typeof rawMetricsSchema>;

/**
 * Validates submitted metrics against the template: no unknown keys, every required exercise
 * present, and no negative measurements.
 */
export const parseRawMetricsFor = (config: TemplateConfig, metrics: RawMetrics) => {
  const byKey = new Map(config.exercises.map((e) => [e.key, e]));

  for (const key of Object.keys(metrics)) {
    if (!byKey.has(key)) {
      throw new Error(`Unknown exercise "${key}" for this challenge's template`);
    }
  }

  const parsed: RawMetrics = {};
  for (const exercise of config.exercises) {
    const value = metrics[exercise.key] ?? null;
    if (value === null) {
      if (exercise.required) {
        throw new Error(`Exercise "${exercise.name}" is required`);
      }
      parsed[exercise.key] = null;
      continue;
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`Exercise "${exercise.name}" must be a non-negative number`);
    }
    parsed[exercise.key] = value;
  }

  return parsed;
};
