import db, { challenge_results, challenges, participants, spaces, templates, users } from "./backend/src/db";

const API_URL = "http://localhost:3000";

const assert = (condition: unknown, message: string) => {
  if (!condition) {
    throw new Error(message);
  }
};

const request = async (path: string, init?: RequestInit) => {
  const response = await fetch(`${API_URL}${path}`, init);
  const text = await response.text();
  let body: unknown = null;

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { response, body };
};

const json = (value: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(value),
});

const expectStatus = (response: Response, expected: number, body: unknown) => {
  assert(
    response.status === expected,
    `Expected ${response.url} to return ${expected}, got ${response.status}: ${JSON.stringify(body)}`
  );
};

let result: Awaited<ReturnType<typeof request>>;

result = await request("/openapi");
expectStatus(result.response, 200, result.body);
assert(typeof result.body === "object" && result.body !== null, "OpenAPI should return a document");

result = await request("/swagger");
expectStatus(result.response, 200, result.body);
assert(typeof result.body === "string" && result.body.includes("swagger"), "Swagger should return its HTML page");

await db.delete(challenge_results).execute();
await db.delete(challenges).execute();
await db.delete(participants).execute();
await db.delete(templates).execute();
await db.delete(spaces).execute();
await db.delete(users).execute();

const userEmail = "test@test.lt";
const userName = "Test User";
const userPassword = "password123";

result = await request("/users/register", {
  method: "POST",
  ...json({ email: userEmail, name: userName, password: userPassword }),
});
expectStatus(result.response, 201, result.body);

result = await request("/users/login", {
  method: "POST",
  ...json({ email: userEmail, password: userPassword }),
});
expectStatus(result.response, 200, result.body);
assert(typeof result.body === "object" && result.body !== null, "Login should return a user object");
const userData = result.body as { id: string; email: string; name: string };
const userId = userData.id;
assert(userData.email === userEmail && userData.name === userName, "Login returned the wrong user");

result = await request(`/users/${userId}/spaces`);
expectStatus(result.response, 200, result.body);
assert(Array.isArray(result.body) && result.body.length === 0, "A new user should have no spaces");

result = await request("/templates", {
  method: "POST",
  ...json({ creatorId: userId, title: "Template", type: "test", isPublic: true, config: {} }),
});
expectStatus(result.response, 201, result.body);

result = await request("/templates");
expectStatus(result.response, 200, result.body);
assert(Array.isArray(result.body) && result.body.length === 1, "Template list should contain the created template");
const templateId = (result.body as Array<{ id: string }>)[0].id;

result = await request(`/templates/${templateId}`);
expectStatus(result.response, 200, result.body);
assert((result.body as { title: string }).title === "Template", "Template lookup returned the wrong title");

result = await request(`/templates/${templateId}`, {
  method: "PATCH",
  ...json({ title: "Updated Template" }),
});
expectStatus(result.response, 200, result.body);
assert((result.body as { title: string }).title === "Updated Template", "Template update did not change the title");

result = await request("/spaces", {
  method: "POST",
  ...json({ organizerId: userId, title: "Test Space" }),
});
expectStatus(result.response, 201, result.body);

result = await request("/spaces");
expectStatus(result.response, 200, result.body);
assert(Array.isArray(result.body) && result.body.length === 1, "Space list should contain the created space");
const space = (result.body as Array<{ id: string; shortId: string; title: string }>)[0];
const spaceId = space.id;

result = await request(`/spaces/${spaceId}`);
expectStatus(result.response, 200, result.body);
assert((result.body as { title: string }).title === "Test Space", "Space lookup returned the wrong title");

result = await request(`/spaces/${spaceId}`, {
  method: "PATCH",
  ...json({ title: "Updated Space" }),
});
expectStatus(result.response, 200, result.body);
assert((result.body as { title: string }).title === "Updated Space", "Space update did not change the title");

result = await request(`/spaces/short-id/${space.shortId}`);
expectStatus(result.response, 200, result.body);
assert((result.body as { id: string }).id === spaceId, "Short space lookup returned the wrong space");

result = await request(`/spaces/join/${space.shortId}`, {
  method: "POST",
  ...json({ name: "Test Participant", age: 30, gender: "male" }),
});
expectStatus(result.response, 200, result.body);
assert(
  typeof (result.body as { accessToken?: string }).accessToken === "string",
  "Joining a space should return an access token"
);

result = await request(`/users/${userId}/spaces`);
expectStatus(result.response, 200, result.body);
assert(Array.isArray(result.body) && result.body.length === 1, "User spaces should contain the created space");

const startDate = new Date().toISOString();
const endDate = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
result = await request("/challenges", {
  method: "POST",
  ...json({ title: "H1 Challenge", spaceId, templateId, startDate, endDate, status: "active" }),
});
expectStatus(result.response, 201, result.body);

result = await request("/challenges", {
  method: "POST",
  ...json({ title: "H2 Challenge", spaceId, templateId, startDate, endDate, status: "active" }),
});
expectStatus(result.response, 201, result.body);

result = await request("/challenges");
expectStatus(result.response, 200, result.body);
assert(Array.isArray(result.body) && result.body.length === 2, "Challenge list should contain both challenges");
const challengeId = (result.body as Array<{ id: string }>)[0].id;

result = await request(`/challenges/${challengeId}`);
expectStatus(result.response, 200, result.body);
assert((result.body as { title: string }).title === "H1 Challenge", "Challenge lookup returned the wrong title");

result = await request(`/challenges/${challengeId}`, {
  method: "PATCH",
  ...json({ title: "Updated Challenge" }),
});
expectStatus(result.response, 200, result.body);
assert((result.body as { title: string }).title === "Updated Challenge", "Challenge update did not change the title");

const participantId = (await db.select().from(participants))[0].id;
result = await request("/challenge-results", {
  method: "POST",
  ...json({ challengeId, participantId, rawMetrics: { repetitions: 10 } }),
});
expectStatus(result.response, 201, result.body);

result = await request("/challenge-results");
expectStatus(result.response, 200, result.body);
assert(Array.isArray(result.body) && result.body.length === 1, "Result list should contain the created result");
const challengeResultId = (result.body as Array<{ id: string }>)[0].id;

result = await request(`/challenge-results/${challengeResultId}`);
expectStatus(result.response, 200, result.body);
assert(
  (result.body as { challengeId: string }).challengeId === challengeId,
  "Result lookup returned the wrong challenge"
);

result = await request(`/challenge-results/${challengeResultId}`, {
  method: "PATCH",
  ...json({ rawMetrics: { repetitions: 12 } }),
});
expectStatus(result.response, 200, result.body);
assert(
  (result.body as { rawMetrics: { repetitions: number } }).rawMetrics.repetitions === 12,
  "Result update did not change raw metrics"
);

result = await request(`/challenges/${challengeId}/results`);
expectStatus(result.response, 200, result.body);
assert(Array.isArray(result.body) && result.body.length === 1, "Challenge results should contain the created result");

result = await request(`/challenge-results/${challengeResultId}`, { method: "DELETE" });
expectStatus(result.response, 204, result.body);

result = await request(`/challenges/${challengeId}/results`);
expectStatus(result.response, 404, result.body);

result = await request(`/challenges/${challengeId}`, { method: "DELETE" });
expectStatus(result.response, 204, result.body);

result = await request(`/spaces/${spaceId}`, { method: "DELETE" });
expectStatus(result.response, 204, result.body);

result = await request(`/templates/${templateId}`, { method: "DELETE" });
expectStatus(result.response, 204, result.body);

result = await request(`/users/${userId}`, { method: "DELETE" });
expectStatus(result.response, 204, result.body);

console.log("API smoke test passed.");
await db.$client.end();

export {};
