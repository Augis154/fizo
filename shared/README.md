# Templates and scoring

A **template** describes what a challenge measures and how each measurement becomes points. A
**challenge** points at one template; every result submitted to that challenge is validated and
scored against it.

Templates live in the `template` table. The exercises and scoring rules are a JSON document in its
`config` column, validated by `templateConfigSchema` in [template.ts](template.ts) on the way in —
so the column is `jsonb`, but the shape is enforced by the API, not left free-form.

Scoring itself is in [scoring.ts](scoring.ts), in `shared` rather than in the backend, because both
sides need it: the API computes the authoritative score when a result is submitted, and the browser
runs the same code to preview the score live as the participant types.

## Config shape

```ts
{
  exercises: Exercise[],     // at least one, with unique `key`s
  requiresAge: boolean,      // set when scoring brackets depend on age
  requiresGender: boolean,
  aggregate: { kind: "sum" | "average" | "rawTimeSum", passTotal?: number },
}
```

Each exercise:

```ts
{
  key: "pushups",            // identifier used in a result's rawMetrics; /^[a-zA-Z][a-zA-Z0-9_]*$/
  name: "Atsispaudimai per 2 min.",
  unit: "reps" | "seconds" | "kg" | "meters",
  input: "number" | "time",  // "time" renders a mm:ss pair but still stores seconds
  higherIsBetter: boolean,
  required: boolean,         // if false, a result may omit it
  passPoints: 60,            // optional: points needed to pass this exercise alone
  scoring: Scoring,
}
```

## The three scoring kinds

**`table`** — a threshold lookup, how the real FIZO202 and army tables work. Points come from rows,
not a formula. Brackets narrow by gender and age range; **the first bracket that matches the
participant wins**, so list specific brackets before general ones. An absent `gender`, `minAge` or
`maxAge` means "no constraint", and both age bounds are inclusive.

```ts
{
  kind: "table",
  maxPoints: 100,
  brackets: [
    { gender: "male", maxAge: 29,            rows: [{ value: 44, points: 60 }, { value: 75, points: 100 }] },
    { gender: "male", minAge: 30, maxAge: 39, rows: [{ value: 38, points: 60 }, { value: 68, points: 100 }] },
    { gender: "female", maxAge: 29,          rows: [{ value: 22, points: 60 }, { value: 45, points: 100 }] },
  ],
}
```

A measurement scores the **best points of every threshold it reaches** — `>= value` for a
higher-is-better exercise, `<= value` for a lower-is-better one — clamped to `maxPoints`. Reaching
no threshold scores 0, and so does a participant for whom no bracket matches (usually a missing age
or gender; `missingScorableFields` detects this so the UI can warn instead of silently scoring 0).

**`linear`** — straight-line interpolation, for templates written by hand. `zero` scores 0 points
and `full` scores `maxPoints`, with values in between scaled and anything outside clamped. For a
lower-is-better exercise put the slower value in `zero`:

```ts
{ kind: "linear", zero: 1200, full: 690, maxPoints: 100 }   // a 3 km run: 20:00 → 0 pts, 11:30 → 100
```

**`none`** — no points at all; the raw measurement is the result. Hyrox-style events rank on time
alone.

```ts
{
  kind: "none";
}
```

## Totals

`aggregate.kind` decides what the stored `totalScore` means:

| kind         | total                  | ranking          |
| ------------ | ---------------------- | ---------------- |
| `sum`        | points added up        | highest first    |
| `average`    | mean of the points     | highest first    |
| `rawTimeSum` | the measurements added | **lowest** first |

Under `rawTimeSum` the finish time _is_ the result, so no exercise awards points and a missing
exercise contributes nothing. Under `sum` and `average` an exercise that was not performed scores 0
and still counts toward the average.

A submission passes only if it meets **every** mark the template sets — `passTotal` _and_ each
exercise's `passPoints`. This is what FIZO202 requires: 60 points in every exercise and 180 in
total, so 190 points with a zero-scoring run is a fail.

A lower-is-better measurement of `0` means "not performed" and scores 0 rather than full marks,
matching FIZO202's treatment of a 3 km run time of zero.

## How a result is stored

`POST /challenges/:id/results` takes only `rawMetrics` — a flat `exerciseKey -> number | null` map.
The API then:

1. loads the challenge's template config,
2. validates the metrics against it (`parseRawMetricsFor`: no unknown keys, every required exercise
   present, no negatives — otherwise `400`),
3. scores them with `scoreResult`, using the participant's age and gender,
4. stores `rawMetrics`, the numeric `totalScore`, and the full breakdown in `scores`.

The `scores` column is a **snapshot**. Editing a template later does not rewrite past results or
reorder old leaderboards, and a participant who corrects their age keeps the scores they were
already given. Editing a result (`PATCH /challenge-results/:id`) re-scores it, so `totalScore` can
never drift from `rawMetrics`.

## Adding a template type

Nothing is hardcoded per sport — `templates.type` is just a label. A new standardised test is a new
row with the right `config`; see [../backend/src/scripts/seed.ts](../backend/src/scripts/seed.ts)
for worked examples of all three scoring kinds.

The army test's brackets in the seed are **illustrative, not the official FIZO202 norms** — the real
tables come from `202.xlsx`, which is not in this repo. Replace those brackets with the imported
rows when it is available; nothing else has to change.
