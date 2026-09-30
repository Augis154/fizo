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

type Exercise = { key: string; name: string; unit: "reps" | "seconds" | "kg"; higherIsBetter: boolean; range: [number, number] };

const armyExercises: Exercise[] = [
  { key: "pushups", name: "Atsispaudimai per 2 min.", unit: "reps", higherIsBetter: true, range: [20, 75] },
  { key: "situps", name: "Atsilenkimai per 2 min.", unit: "reps", higherIsBetter: true, range: [30, 90] },
  { key: "run3km", name: "3 km bėgimas", unit: "seconds", higherIsBetter: false, range: [690, 1200] },
];

const hyroxExercises: Exercise[] = [
  { key: "skiErg", name: "SkiErg 1000 m", unit: "seconds", higherIsBetter: false, range: [220, 330] },
  { key: "sledPush", name: "Sled Push 50 m", unit: "seconds", higherIsBetter: false, range: [120, 300] },
  { key: "rowing", name: "Irklavimas 1000 m", unit: "seconds", higherIsBetter: false, range: [220, 320] },
  { key: "wallBalls", name: "Wall Balls x100", unit: "seconds", higherIsBetter: false, range: [240, 480] },
  { key: "run8km", name: "Bėgimas 8 x 1 km", unit: "seconds", higherIsBetter: false, range: [1800, 3000] },
];

const wodExercises: Exercise[] = [
  { key: "pullups", name: "Prisitraukimai", unit: "reps", higherIsBetter: true, range: [3, 25] },
  { key: "deadlift", name: "Mirties trauka 1RM", unit: "kg", higherIsBetter: true, range: [80, 220] },
];

const toConfig = (exercises: Exercise[]) => ({
  exercises: exercises.map(({ range, ...exercise }) => exercise),
});

const generateMetrics = (exercises: Exercise[]) =>
  Object.fromEntries(exercises.map((e) => [e.key, between(...e.range)]));

// Placeholder scoring (0-100 per exercise, averaged) until real template scoring exists.
const scoreMetrics = (exercises: Exercise[], metrics: Record<string, number>) => {
  const total = exercises.reduce((sum, e) => {
    const [min, max] = e.range;
    const normalized = (metrics[e.key] - min) / (max - min);
    return sum + (e.higherIsBetter ? normalized : 1 - normalized) * 100;
  }, 0);
  return (total / exercises.length).toFixed(2);
};

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
  const result: { name: string; age: number | null; gender: "male" | "female" | null }[] = [];
  while (result.length < count) {
    const gender = random() < 0.5 ? "male" : "female";
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
        config: toConfig(armyExercises),
      },
      { creatorId: ieva.id, title: "Hyrox", type: "hyrox", isPublic: true, config: toConfig(hyroxExercises) },
      { creatorId: jonas.id, title: "Jono privatus WOD", type: "custom", isPublic: false, config: toConfig(wodExercises) },
    ])
    .returning();

  const exercisesByTemplate = new Map([
    [armyTemplate.id, armyExercises],
    [hyroxTemplate.id, hyroxExercises],
    [wodTemplate.id, wodExercises],
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
        { title: "Kariuomenės testas Hyrox sportininkams", templateId: armyTemplate.id, start: -3, end: 20, status: "active" },
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

      const exercises = exercisesByTemplate.get(c.templateId)!;
      const resultsEnd = Math.min(endDate.getTime(), now);

      for (const participant of spaceParticipants) {
        if (random() < 0.2) continue;
        // Participants may submit several attempts during a challenge.
        const attempts = between(1, 3);
        for (let i = 0; i < attempts; i++) {
          const rawMetrics = generateMetrics(exercises);
          const submittedAt = new Date(startDate.getTime() + random() * (resultsEnd - startDate.getTime()));
          await tx.insert(challenge_results).values({
            challengeId: challenge.id,
            participantId: participant.id,
            rawMetrics,
            totalScore: scoreMetrics(exercises, rawMetrics),
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
    console.log(`  POST /spaces/join/${definition.shortId}  ${definition.title}`);
  }
});

await db.$client.end();
