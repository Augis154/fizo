import { ParticipantGender, scoreResult, type Exercise, type ScoringBracket, type TemplateConfig } from "shared";

import db, { challenge_results, challenges, participants, refreshTokens, spaces, templates, users } from "../db";

const PASSWORD = "password123";
const DAY = 24 * 60 * 60 * 1000;

// Deterministic PRNG so every seed run produces the same data.
let state = 42;
const random = () => {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (min: number, max: number) => Math.round(min + random() * (max - min));

/**
 * Points ladder used to build the army test's lookup tables. Giving the 60- and 100-point
 * thresholds for a group and interpolating between them keeps the tables readable while producing
 * the same threshold-lookup shape as the real FIZO202 tables.
 *
 * The numbers below are illustrative, not the official FIZO202 norms — the real tables come from
 * `202.xlsx`, which is not in this repo. Replace these brackets with the imported rows when it is.
 */
const POINTS_LADDER = [60, 70, 80, 90, 100];

const band = (sixty: number, hundred: number) =>
  POINTS_LADDER.map((points) => ({
    points,
    value: Math.round(sixty + ((hundred - sixty) * (points - 60)) / 40),
  }));

/** Age bands, youngest first. The first matching bracket wins, so order matters. */
const ageBands = [{ maxAge: 29 }, { minAge: 30, maxAge: 39 }, { minAge: 40, maxAge: 49 }, { minAge: 50 }];

/**
 * Builds brackets for both genders across the four age bands. `male` and `female` each give the
 * `[60pt, 100pt]` thresholds per age band, youngest first.
 */
const genderedBrackets = (
  male: [number, number][],
  female: [number, number][]
): [ScoringBracket, ...ScoringBracket[]] => {
  const brackets = ([ParticipantGender.Male, ParticipantGender.Female] as const).flatMap((gender) =>
    (gender === ParticipantGender.Male ? male : female).map((thresholds, index) => ({
      gender,
      ...ageBands[index],
      rows: band(...thresholds),
    }))
  );
  return brackets as [ScoringBracket, ...ScoringBracket[]];
};

const armyExercises: Exercise[] = [
  {
    key: "pushups",
    name: "Atsispaudimai",
    unit: "reps",
    input: "number",
    higherIsBetter: true,
    required: true,
    passPoints: 60,
    scoring: {
      kind: "table",
      maxPoints: 100,
      brackets: genderedBrackets(
        [
          [44, 75],
          [38, 68],
          [32, 60],
          [26, 50],
        ],
        [
          [22, 45],
          [18, 40],
          [14, 34],
          [10, 28],
        ]
      ),
    },
  },
  {
    key: "situps",
    name: "Atsilenkimai",
    unit: "reps",
    input: "number",
    higherIsBetter: true,
    required: true,
    passPoints: 60,
    scoring: {
      kind: "table",
      maxPoints: 100,
      brackets: genderedBrackets(
        [
          [48, 90],
          [43, 82],
          [38, 74],
          [32, 64],
        ],
        [
          [40, 80],
          [35, 72],
          [30, 64],
          [24, 54],
        ]
      ),
    },
  },
  {
    key: "run3km",
    // Lower is better, so the 60-point threshold is the slower time.
    name: "3 km bėgimas",
    unit: "seconds",
    input: "time",
    higherIsBetter: false,
    required: true,
    passPoints: 60,
    scoring: {
      kind: "table",
      maxPoints: 100,
      brackets: genderedBrackets(
        [
          [900, 690],
          [960, 720],
          [1020, 780],
          [1110, 840],
        ],
        [
          [1050, 810],
          [1110, 840],
          [1170, 900],
          [1260, 960],
        ]
      ),
    },
  },
];

/** Hyrox is raced, not scored: the finish time is the result, so no exercise awards points. */
const hyroxExercises: Exercise[] = [
  {
    key: "skiErg",
    name: "SkiErg 1000 m",
    unit: "seconds",
    input: "time",
    higherIsBetter: false,
    required: true,
    scoring: { kind: "none" },
  },
  {
    key: "sledPush",
    name: "Sled Push 50 m",
    unit: "seconds",
    input: "time",
    higherIsBetter: false,
    required: true,
    scoring: { kind: "none" },
  },
  {
    key: "rowing",
    name: "Irklavimas 1000 m",
    unit: "seconds",
    input: "time",
    higherIsBetter: false,
    required: true,
    scoring: { kind: "none" },
  },
  {
    key: "wallBalls",
    name: "Wall Balls x100",
    unit: "seconds",
    input: "time",
    higherIsBetter: false,
    required: true,
    scoring: { kind: "none" },
  },
  {
    key: "run8km",
    name: "Bėgimas 8 x 1 km",
    unit: "seconds",
    input: "time",
    higherIsBetter: false,
    required: true,
    scoring: { kind: "none" },
  },
];

/** A hand-made template: straight-line scoring between a "zero" and a "full marks" value. */
const wodExercises: Exercise[] = [
  {
    key: "pullups",
    name: "Prisitraukimai",
    unit: "reps",
    input: "number",
    higherIsBetter: true,
    required: true,
    scoring: { kind: "linear", zero: 3, full: 25, maxPoints: 100 },
  },
  {
    key: "deadlift",
    name: "Štangos kėlimas",
    unit: "kg",
    input: "number",
    higherIsBetter: true,
    required: false,
    scoring: { kind: "linear", zero: 80, full: 220, maxPoints: 100 },
  },
];

const armyConfig: TemplateConfig = {
  exercises: armyExercises,
  requiresAge: true,
  requiresGender: true,
  aggregate: { kind: "sum", passTotal: 180 },
};

const hyroxConfig: TemplateConfig = {
  exercises: hyroxExercises,
  requiresAge: false,
  requiresGender: false,
  aggregate: { kind: "rawTimeSum" },
};

const wodConfig: TemplateConfig = {
  exercises: wodExercises,
  requiresAge: false,
  requiresGender: false,
  aggregate: { kind: "average", passTotal: 50 },
};

/** Plausible measurement ranges, used only to invent seed data. */
const seedRanges: Record<string, [number, number]> = {
  pushups: [20, 75],
  situps: [30, 90],
  run3km: [690, 1200],
  skiErg: [220, 330],
  sledPush: [120, 300],
  rowing: [220, 320],
  wallBalls: [240, 480],
  run8km: [1800, 3000],
  pullups: [3, 25],
  deadlift: [80, 220],
};

const generateMetrics = (config: TemplateConfig) =>
  Object.fromEntries(
    config.exercises
      // Optional exercises are sometimes left out, as the result form allows.
      .filter((exercise) => exercise.required || random() > 0.3)
      .map((exercise) => [exercise.key, between(...seedRanges[exercise.key])])
  );

const firstNames = {
  male: ["Jonas", "Tomas", "Mantas", "Lukas", "Paulius", "Darius", "Andrius", "Karolis"],
  female: ["Ieva", "Greta", "Austėja", "Rūta", "Monika", "Eglė", "Lina", "Agnė"],
};
const lastNames = {
  male: ["Kazlauskas", "Petrauskas", "Jankauskas", "Butkus", "Stankevičius", "Vasiliauskas"],
  female: ["Kazlauskaitė", "Petrauskienė", "Jankauskaitė", "Butkutė", "Stankevičiūtė", "Vasiliauskienė"],
};

const generateParticipants = (count: number) => {
  const used = new Set<string>();
  const result: { name: string; age: number | null; gender: ParticipantGender | null }[] = [];
  while (result.length < count) {
    const gender = random() < 0.5 ? ParticipantGender.Male : ParticipantGender.Female;
    const first = firstNames[gender][between(0, firstNames[gender].length - 1)];
    const last = lastNames[gender][between(0, lastNames[gender].length - 1)];
    const name = `${first} ${last}`;
    if (used.has(name)) continue;
    used.add(name);
    // Some participants skip optional fields, as the join form allows.
    const skipDetails = random() < 0.15;
    result.push({ name, age: skipDetails ? null : between(18, 55), gender: skipDetails ? null : gender });
  }
  return result;
};

const now = Date.now();

await db.transaction(async (tx) => {
  await tx.delete(challenge_results);
  await tx.delete(refreshTokens);
  await tx.delete(challenges);
  await tx.delete(participants);
  await tx.delete(spaces);
  await tx.delete(templates);
  await tx.delete(users);

  const passwordHash = await Bun.password.hash(PASSWORD);
  const [admin, jonas, ieva] = await tx
    .insert(users)
    .values([
      { email: "admin@fizo.lt", name: "Administratorius", passwordHash, role: "admin" },
      { email: "jonas@fizo.lt", name: "Jonas Organizatorius", passwordHash },
      { email: "ieva@fizo.lt", name: "Ieva Organizatorė", passwordHash },
    ])
    .returning();

  const [armyTemplate, hyroxTemplate, wodTemplate] = await tx
    .insert(templates)
    .values([
      {
        creatorId: jonas.id,
        title: "Kariuomenės fizinio parengtumo testas",
        type: "army_pft",
        isPublic: true,
        config: armyConfig,
      },
      { creatorId: ieva.id, title: "Hyrox", type: "hyrox", isPublic: true, config: hyroxConfig },
      { creatorId: jonas.id, title: "Jono privatus WOD", type: "custom", isPublic: false, config: wodConfig },
    ])
    .returning();

  const configByTemplate = new Map([
    [armyTemplate.id, armyConfig],
    [hyroxTemplate.id, hyroxConfig],
    [wodTemplate.id, wodConfig],
  ]);

  const spaceDefinitions = [
    {
      organizerId: jonas.id,
      shortId: "vilnius-pft",
      title: "Vilniaus bataliono testas 2026",
      participantCount: 8,
      challenges: [
        { title: "Pavasario testas", templateId: armyTemplate.id, start: -60, end: -45, status: "finished" },
        { title: "Rudens testas", templateId: armyTemplate.id, start: -5, end: 10, status: "active" },
      ],
    },
    {
      organizerId: jonas.id,
      shortId: "draugu-wod",
      title: "Draugų WOD lyga",
      participantCount: 5,
      challenges: [
        { title: "Rugsėjo WOD", templateId: wodTemplate.id, start: -20, end: 10, status: "active" },
        { title: "Spalio WOD", templateId: wodTemplate.id, start: 15, end: 45, status: "upcoming" },
      ],
    },
    {
      organizerId: ieva.id,
      shortId: "hyrox-kaunas",
      title: "Hyrox Kaunas 2026",
      participantCount: 10,
      challenges: [
        { title: "Hyrox treniruočių iššūkis", templateId: hyroxTemplate.id, start: -30, end: -1, status: "finished" },
        { title: "Hyrox Kaunas finalas", templateId: hyroxTemplate.id, start: -2, end: 5, status: "active" },
        {
          title: "Kariuomenės testas Hyrox sportininkams",
          templateId: armyTemplate.id,
          start: -3,
          end: 20,
          status: "active",
        },
      ],
    },
  ];

  let resultCount = 0;

  for (const definition of spaceDefinitions) {
    const [space] = await tx
      .insert(spaces)
      .values({ organizerId: definition.organizerId, shortId: definition.shortId, title: definition.title })
      .returning();

    const spaceParticipants = await tx
      .insert(participants)
      .values(generateParticipants(definition.participantCount).map((p) => ({ ...p, spaceId: space.id })))
      .returning();

    for (const c of definition.challenges) {
      const startDate = new Date(now + c.start * DAY);
      const endDate = new Date(now + c.end * DAY);
      const [challenge] = await tx
        .insert(challenges)
        .values({ spaceId: space.id, templateId: c.templateId, title: c.title, startDate, endDate, status: c.status })
        .returning();

      if (c.status === "upcoming") continue;

      const config = configByTemplate.get(c.templateId)!;
      const resultsEnd = Math.min(endDate.getTime(), now);

      for (const participant of spaceParticipants) {
        if (random() < 0.2) continue;
        // Participants may submit several attempts during a challenge.
        const attempts = between(1, 3);
        for (let i = 0; i < attempts; i++) {
          const rawMetrics = generateMetrics(config);
          // Scored with the same shared code the API uses, so seeded data matches real submissions.
          const scores = scoreResult(config, rawMetrics, participant);
          const submittedAt = new Date(startDate.getTime() + random() * (resultsEnd - startDate.getTime()));
          await tx.insert(challenge_results).values({
            challengeId: challenge.id,
            participantId: participant.id,
            rawMetrics,
            scores,
            totalScore: scores.total.toFixed(2),
            createdAt: submittedAt,
            updatedAt: submittedAt,
          });
          resultCount++;
        }
      }
    }
  }

  console.log("Database seeded:");
  console.log(`  users: 3, templates: 3, spaces: ${spaceDefinitions.length}, results: ${resultCount}`);
  console.log(`\nLogins (password: ${PASSWORD}):`);
  console.log(`  ${admin.email} (admin)`);
  console.log(`  ${jonas.email} (organizer)`);
  console.log(`  ${ieva.email} (organizer)`);
  console.log("\nJoin links (short IDs):");
  for (const definition of spaceDefinitions) {
    console.log(`  /join/${definition.shortId}  ${definition.title}`);
  }
});

await db.$client.end();
