import { Hono } from "hono";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { challenge_results, challenges } from "../db";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import {
  idParamSchema,
  updateChallengeSchema,
  challengeResponseSchema,
  createChallengeResultSchema,
  challengeResultResponseSchema,
} from "shared";
import {
  bearerSecurity,
  loadChallengeForCaller,
  loadVisibleTemplate,
  requireAdmin,
  requireOrganizer,
  requireParticipant,
  requireSpaceMember,
} from "../auth";

const app = new Hono();

app.get(
  "/",
  describeRoute({
    operationId: "Get Challenges",
    tags: ["Challenges", "Admin"],
    description: "Get all challenges (admin only). Others use GET /spaces/:id/challenges.",
    security: bearerSecurity,
    responses: {
      200: {
        description: "A list of challenges",
        content: {
          "application/json": {
            schema: resolver(v.array(challengeResponseSchema)),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Admin role required" },
    },
  }),
  requireAdmin,
  async (c) => {
    return c.json(await db.select().from(challenges), 200);
  }
);

app.get(
  "/:id",
  describeRoute({
    operationId: "Get Challenge",
    tags: ["Challenges"],
    description: "Get a challenge by its ID. Available to the space organizer and its participants.",
    security: bearerSecurity,
    responses: {
      200: {
        description: "Challenge found",
        content: {
          "application/json": {
            schema: resolver(challengeResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "No access to this challenge" },
      404: { description: "Challenge not found" },
    },
  }),
  requireSpaceMember,
  validator("param", idParamSchema),
  async (c) => {
    const challenge = await loadChallengeForCaller(c.req.valid("param").id, c.var.caller);
    return c.json(challenge, 200);
  }
);

app.patch(
  "/:id",
  describeRoute({
    operationId: "Update Challenge",
    tags: ["Challenges"],
    description: "Update a challenge in a space owned by the caller",
    security: bearerSecurity,
    responses: {
      200: {
        description: "Challenge updated successfully",
        content: {
          "application/json": {
            schema: resolver(challengeResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "You do not own this challenge's space" },
      404: { description: "Challenge or template not found" },
    },
  }),
  requireOrganizer,
  validator("param", idParamSchema),
  validator("json", updateChallengeSchema),
  async (c) => {
    const challenge = await loadChallengeForCaller(c.req.valid("param").id, {
      kind: "organizer",
      ...c.var.organizer,
    });
    const updatedData = c.req.valid("json");
    if (Object.keys(updatedData).length === 0) {
      return c.json(challenge, 200);
    }
    if (updatedData.templateId) {
      await loadVisibleTemplate(updatedData.templateId, c.var.organizer);
    }

    const [updated] = await db.update(challenges).set(updatedData).where(eq(challenges.id, challenge.id)).returning();
    return c.json(updated, 200);
  }
);

app.delete(
  "/:id",
  describeRoute({
    operationId: "Delete Challenge",
    tags: ["Challenges"],
    description: "Delete a challenge in a space owned by the caller",
    security: bearerSecurity,
    responses: {
      204: { description: "Challenge deleted successfully" },
      401: { description: "Not authenticated" },
      403: { description: "You do not own this challenge's space" },
      404: { description: "Challenge not found" },
    },
  }),
  requireOrganizer,
  validator("param", idParamSchema),
  async (c) => {
    const challenge = await loadChallengeForCaller(c.req.valid("param").id, {
      kind: "organizer",
      ...c.var.organizer,
    });
    await db.delete(challenges).where(eq(challenges.id, challenge.id));
    return c.body(null, 204);
  }
);

app.get(
  "/:id/results",
  describeRoute({
    operationId: "Get Challenge Results",
    tags: ["Challenges"],
    description: "Get all results of a challenge (leaderboard). Available to the space organizer and its participants.",
    security: bearerSecurity,
    responses: {
      200: {
        description: "A list of challenge results",
        content: {
          "application/json": {
            schema: resolver(v.array(challengeResultResponseSchema)),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "No access to this challenge" },
      404: { description: "Challenge not found" },
    },
  }),
  requireSpaceMember,
  validator("param", idParamSchema),
  async (c) => {
    const challenge = await loadChallengeForCaller(c.req.valid("param").id, c.var.caller);

    const results = await db.select().from(challenge_results).where(eq(challenge_results.challengeId, challenge.id));
    return c.json(results, 200);
  }
);

app.post(
  "/:id/results",
  describeRoute({
    operationId: "Create Challenge Result",
    tags: ["Challenges"],
    description: "Submit a result for a challenge as the authenticated participant",
    security: bearerSecurity,
    responses: {
      201: {
        description: "Result created successfully",
        content: {
          "application/json": {
            schema: resolver(challengeResultResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Participant role required, or challenge is not in the participant's space" },
      404: { description: "Challenge not found" },
    },
  }),
  requireParticipant,
  validator("param", idParamSchema),
  validator("json", createChallengeResultSchema),
  async (c) => {
    const participant = c.var.participant;
    const challenge = await loadChallengeForCaller(c.req.valid("param").id, { kind: "participant", participant });

    const [created] = await db
      .insert(challenge_results)
      .values({
        challengeId: challenge.id,
        participantId: participant.id,
        rawMetrics: c.req.valid("json").rawMetrics,
        totalScore: "0.00",
      })
      .returning();

    return c.json(created, 201);
  }
);

export default app;
