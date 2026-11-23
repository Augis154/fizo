import db, { challenge_results, challenges, participants, refreshTokens, spaces, templates, users } from "./backend/src/db";

const API_URL = process.env.API_URL ?? "http://localhost:3000";

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

type RequestOptions = { method?: string; body?: unknown; token?: string };

const request = async (path: string, { method = "GET", body, token }: RequestOptions = {}) => {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: any = null;

  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  return { response, body: parsed };
};

const expectStatus = async (path: string, options: RequestOptions, expected: number) => {
  const result = await request(path, options);
  assert(
    result.response.status === expected,
    `Expected ${options.method ?? "GET"} ${path} to return ${expected}, got ${result.response.status}: ${JSON.stringify(result.body)}`
  );
  return result.body;
};

let body: any;

body = await expectStatus("/openapi", {}, 200);
assert(body?.components?.securitySchemes?.bearerAuth, "OpenAPI should document bearer auth");

body = await expectStatus("/swagger", {}, 200);
assert(typeof body === "string" && body.includes("swagger"), "Swagger should return its HTML page");

await db.delete(challenge_results).execute();
await db.delete(challenges).execute();
await db.delete(refreshTokens).execute();
await db.delete(participants).execute();
await db.delete(templates).execute();
await db.delete(spaces).execute();
await db.delete(users).execute();

// Organizers
const organizerA = { email: "a@test.lt", name: "Organizer A", password: "password123" };
const organizerB = { email: "b@test.lt", name: "Organizer B", password: "password123" };

body = await expectStatus("/auth/register", { method: "POST", body: organizerA }, 201);
assert(body.user.email === organizerA.email && body.accessToken && body.refreshToken, "Register should log the user in");
await expectStatus("/users/me", { token: body.accessToken }, 200);
await expectStatus("/auth/register", { method: "POST", body: organizerB }, 201);
body = await expectStatus("/auth/register", { method: "POST", body: organizerA }, 409);
assert(!("details" in body), "Error responses must not leak database details");

await expectStatus("/auth/login", { method: "POST", body: { email: organizerA.email, password: "wrongpass" } }, 401);

body = await expectStatus("/auth/login", { method: "POST", body: { email: organizerA.email, password: organizerA.password } }, 200);
assert(body.user.email === organizerA.email, "Login returned the wrong user");
const userAId: string = body.user.id;
let tokenA: string = body.accessToken;
let refreshA: string = body.refreshToken;

body = await expectStatus("/auth/login", { method: "POST", body: { email: organizerB.email, password: organizerB.password } }, 200);
const tokenB: string = body.accessToken;
const refreshB: string = body.refreshToken;

const admin = { email: "admin@test.lt", name: "Admin", password: "password123" };
await db.insert(users).values({
  email: admin.email,
  name: admin.name,
  passwordHash: await Bun.password.hash(admin.password),
  role: "admin",
});
body = await expectStatus("/auth/login", { method: "POST", body: { email: admin.email, password: admin.password } }, 200);
assert(body.user.role === "admin", "Admin login should report the admin role");
const tokenAdmin: string = body.accessToken;

await expectStatus("/users", { token: tokenA }, 403);
body = await expectStatus("/users", { token: tokenAdmin }, 200);
assert(body.length === 3 && body.every((u: any) => !("passwordHash" in u)), "Admin should list users without hashes");

await expectStatus("/users/me", {}, 401);
await expectStatus("/users/me", { token: "not-a-jwt" }, 401);
body = await expectStatus("/users/me", { token: tokenA }, 200);
assert(body.name === organizerA.name, "GET /users/me returned the wrong user");

// Refresh rotation: old refresh token is single-use
body = await expectStatus("/auth/refresh", { method: "POST", body: { refreshToken: refreshA } }, 200);
await expectStatus("/auth/refresh", { method: "POST", body: { refreshToken: refreshA } }, 401);
tokenA = body.accessToken;
refreshA = body.refreshToken;

// Templates
body = await expectStatus(
  "/templates",
  { method: "POST", token: tokenA, body: { title: "Private", type: "test", isPublic: false, config: { reps: 10 } } },
  201
);
const privateTemplateId: string = body.id;
assert(body.config.reps === 10, "Template config should be preserved");

body = await expectStatus(
  "/templates",
  { method: "POST", token: tokenA, body: { title: "Public", type: "test", isPublic: true, config: {} } },
  201
);
const publicTemplateId: string = body.id;

body = await expectStatus("/templates", { token: tokenB }, 200);
assert(body.length === 1 && body[0].id === publicTemplateId, "Organizer B should only see the public template");
body = await expectStatus("/templates", { token: tokenA }, 200);
assert(body.length === 2, "Organizer A should see both templates");

await expectStatus(`/templates/${privateTemplateId}`, { token: tokenB }, 404);
await expectStatus(`/templates/${publicTemplateId}`, { token: tokenB }, 200);
await expectStatus(`/templates/${publicTemplateId}`, { method: "PATCH", token: tokenB, body: { title: "Hijack" } }, 403);
await expectStatus(`/templates/${publicTemplateId}`, { method: "DELETE", token: tokenB }, 403);

body = await expectStatus(
  `/templates/${privateTemplateId}`,
  { method: "PATCH", token: tokenA, body: { title: "Updated Template" } },
  200
);
assert(body.title === "Updated Template", "Template update did not change the title");

body = await expectStatus("/users/me/templates", { token: tokenA }, 200);
assert(body.length === 2, "Organizer A should own two templates");

// Spaces
body = await expectStatus("/spaces", { method: "POST", token: tokenA, body: { title: "Test Space" } }, 201);
const spaceId: string = body.id;
const shortId: string = body.shortId;

await expectStatus(`/spaces/${spaceId}`, { token: tokenB }, 403);
await expectStatus(`/spaces/${spaceId}`, { method: "PATCH", token: tokenB, body: { title: "Hijack" } }, 403);
await expectStatus(`/spaces/${spaceId}`, { method: "DELETE", token: tokenB }, 403);

body = await expectStatus(`/spaces/${spaceId}`, { method: "PATCH", token: tokenA, body: { title: "Updated Space" } }, 200);
assert(body.title === "Updated Space", "Space update did not change the title");

body = await expectStatus("/users/me/spaces", { token: tokenA }, 200);
assert(body.length === 1, "Organizer A should have one space");
body = await expectStatus("/users/me/spaces", { token: tokenB }, 200);
assert(body.length === 0, "Organizer B should have no spaces");

body = await expectStatus(`/spaces/join/${shortId}`, {}, 200);
assert(body.title === "Updated Space", "Join link lookup returned the wrong space");
assert(!("id" in body) && !("organizerId" in body), "Public space lookup must not expose internal IDs");
await expectStatus("/spaces/join/does-not-exist", {}, 404);

// Challenges
const startDate = new Date().toISOString();
const endDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
const challengeBody = { title: "H1 Challenge", templateId: privateTemplateId, startDate, endDate, status: "active" };

await expectStatus(`/spaces/${spaceId}/challenges`, { method: "POST", token: tokenB, body: challengeBody }, 403);
body = await expectStatus(`/spaces/${spaceId}/challenges`, { method: "POST", token: tokenA, body: challengeBody }, 201);
const challengeId: string = body.id;

body = await expectStatus(`/spaces/${spaceId}/challenges`, { token: tokenA }, 200);
assert(body.length === 1, "Space should have one challenge");

body = await expectStatus(`/challenges/${challengeId}`, { method: "PATCH", token: tokenA, body: { title: "Updated Challenge" } }, 200);
assert(body.title === "Updated Challenge", "Challenge update did not change the title");
await expectStatus(`/challenges/${challengeId}`, { method: "PATCH", token: tokenB, body: { title: "Hijack" } }, 403);

// Participants
body = await expectStatus(`/spaces/join/${shortId}`, { method: "POST", body: { name: "Participant 1", age: 30, gender: "male" } }, 201);
const participant1Token: string = body.accessToken;
const participant1Refresh: string = body.refreshToken;
body = await expectStatus(`/spaces/join/${shortId}`, { method: "POST", body: { name: "Participant 2" } }, 201);
const participant2Token: string = body.accessToken;
await expectStatus(`/spaces/join/${shortId}`, { method: "POST", body: { name: "Participant 2" } }, 400);

await expectStatus("/users/me", { token: participant1Token }, 403);
await expectStatus("/spaces", { method: "POST", token: participant1Token, body: { title: "Nope" } }, 403);

body = await expectStatus("/participants/me", { token: participant1Token }, 200);
assert(body.name === "Participant 1", "GET /participants/me returned the wrong participant");

body = await expectStatus(`/spaces/${spaceId}/participants`, { token: tokenA }, 200);
assert(body.length === 2, "Space should have two participants");
await expectStatus(`/spaces/${spaceId}/participants`, { token: tokenB }, 403);

body = await expectStatus(`/spaces/${spaceId}/challenges`, { token: participant1Token }, 200);
assert(body.length === 1, "Participant should see the space's challenges");
await expectStatus(`/challenges/${challengeId}`, { token: participant1Token }, 200);
await expectStatus(`/challenges/${challengeId}`, { method: "DELETE", token: participant1Token }, 403);

// Challenge results
await expectStatus(`/challenges/${challengeId}/results`, { method: "POST", token: tokenA, body: { rawMetrics: { repetitions: 1 } } }, 403);
body = await expectStatus(
  `/challenges/${challengeId}/results`,
  { method: "POST", token: participant1Token, body: { rawMetrics: { repetitions: 10 } } },
  201
);
const challengeResultId: string = body.id;

body = await expectStatus(`/challenges/${challengeId}/results`, { token: participant2Token }, 200);
assert(body.length === 1, "Leaderboard should be visible to other participants");
body = await expectStatus(`/challenges/${challengeId}/results`, { token: tokenA }, 200);
assert(body.length === 1, "Leaderboard should be visible to the organizer");
await expectStatus(`/challenges/${challengeId}/results`, { token: tokenB }, 403);

await expectStatus(`/challenge-results/${challengeResultId}`, { token: tokenA }, 200);
await expectStatus(`/challenge-results/${challengeResultId}`, { token: tokenB }, 403);

await expectStatus(
  `/challenge-results/${challengeResultId}`,
  { method: "PATCH", token: participant2Token, body: { rawMetrics: { repetitions: 99 } } },
  403
);
body = await expectStatus(
  `/challenge-results/${challengeResultId}`,
  { method: "PATCH", token: participant1Token, body: { rawMetrics: { repetitions: 12 } } },
  200
);
assert(body.rawMetrics.repetitions === 12, "Result update did not change raw metrics");

// Admin sees everything
await expectStatus("/spaces", { token: tokenA }, 403);
await expectStatus("/spaces", { token: participant1Token }, 403);
body = await expectStatus("/spaces", { token: tokenAdmin }, 200);
assert(body.length === 1, "Admin should see all spaces");
await expectStatus(`/spaces/${spaceId}`, { token: tokenAdmin }, 200);
await expectStatus(`/templates/${privateTemplateId}`, { token: tokenAdmin }, 200);
body = await expectStatus("/templates", { token: tokenAdmin }, 200);
assert(body.length === 2, "Admin should see private templates too");
body = await expectStatus("/challenges", { token: tokenAdmin }, 200);
assert(body.length === 1, "Admin should see all challenges");
body = await expectStatus("/challenge-results", { token: tokenAdmin }, 200);
assert(body.length === 1, "Admin should see all results");
await expectStatus("/challenge-results", { token: tokenA }, 403);
body = await expectStatus("/participants", { token: tokenAdmin }, 200);
assert(body.length === 2, "Admin should see all participants");
await expectStatus(`/challenges/${challengeId}/results`, { token: tokenAdmin }, 200);
body = await expectStatus(`/users/${userAId}`, { token: tokenAdmin }, 200);
assert(body.email === organizerA.email, "Admin user lookup returned the wrong user");
await expectStatus(`/users/${userAId}`, { token: tokenB }, 403);

body = await expectStatus("/participants/me/results", { token: participant1Token }, 200);
assert(body.length === 1, "Participant 1 should have one result");
body = await expectStatus("/participants/me/results", { token: participant2Token }, 200);
assert(body.length === 0, "Participant 2 should have no results");

await expectStatus(`/challenge-results/${challengeResultId}`, { method: "DELETE", token: participant2Token }, 403);
await expectStatus(`/challenge-results/${challengeResultId}`, { method: "DELETE", token: participant1Token }, 204);

body = await expectStatus(`/challenges/${challengeId}/results`, { token: tokenA }, 200);
assert(body.length === 0, "Results should be empty after deletion");

// Participant refresh
body = await expectStatus("/auth/refresh", { method: "POST", body: { refreshToken: participant1Refresh } }, 200);
await expectStatus("/participants/me", { token: body.accessToken }, 200);

// Cleanup through the API
body = await expectStatus(`/templates/${privateTemplateId}`, { method: "DELETE", token: tokenA }, 409);
assert(!("details" in body), "Error responses must not leak database details");
await expectStatus(`/challenges/${challengeId}`, { method: "DELETE", token: tokenA }, 204);
await expectStatus(`/spaces/${spaceId}`, { method: "DELETE", token: tokenA }, 204);
await expectStatus(`/templates/${privateTemplateId}`, { method: "DELETE", token: tokenA }, 204);
await expectStatus(`/templates/${publicTemplateId}`, { method: "DELETE", token: tokenA }, 204);

// Logout revokes the refresh token
await expectStatus("/auth/logout", { method: "POST", body: { refreshToken: refreshB } }, 204);
await expectStatus("/auth/refresh", { method: "POST", body: { refreshToken: refreshB } }, 401);

await expectStatus("/users/me", { method: "DELETE", token: tokenA }, 204);
await expectStatus("/users/me", { method: "DELETE", token: tokenB }, 204);
await expectStatus("/users/me", { method: "DELETE", token: tokenAdmin }, 204);

console.log("API smoke test passed.");
await db.$client.end();

export {};
