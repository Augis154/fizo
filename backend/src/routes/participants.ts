import { Hono } from "hono";

import * as v from "valibot";
import { resolver, describeRoute } from "hono-openapi";

import db, { challenge_results, participants } from "../db";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { participantResponseSchema, challengeResultResponseSchema } from "shared";
import { bearerSecurity, requireAdmin, requireParticipant } from "../auth";

const app = new Hono();

app.get(
  "/",
  describeRoute({
    operationId: "Get Participants",
    tags: ["Participants", "Admin"],
    description: "Get all participants (admin only). Organizers use GET /spaces/:id/participants.",
    security: bearerSecurity,
    responses: {
      200: {
        description: "A list of participants",
        content: {
          "application/json": {
            schema: resolver(v.array(participantResponseSchema)),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Admin role required" },
    },
  }),
  requireAdmin,
  async (c) => {
    return c.json(await db.select().from(participants), 200);
  }
);

app.get(
  "/me",
  describeRoute({
    operationId: "Get Current Participant",
    tags: ["Participants"],
    description: "Get the authenticated participant",
    security: bearerSecurity,
    responses: {
      200: {
        description: "The current participant",
        content: {
          "application/json": {
            schema: resolver(participantResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Participant role required" },
    },
  }),
  requireParticipant,
  async (c) => {
    const [participant] = await db.select().from(participants).where(eq(participants.id, c.var.participant.id));
    if (!participant) {
      return c.body(null, 404);
    }
    return c.json(participant, 200);
  }
);

app.get(
  "/me/results",
  describeRoute({
    operationId: "Get Current Participant Results",
    tags: ["Participants"],
    description: "Get the result history of the authenticated participant",
    security: bearerSecurity,
    responses: {
      200: {
        description: "A list of the participant's results",
        content: {
          "application/json": {
            schema: resolver(v.array(challengeResultResponseSchema)),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Participant role required" },
    },
  }),
  requireParticipant,
  async (c) => {
    const results = await db
      .select()
      .from(challenge_results)
      .where(eq(challenge_results.participantId, c.var.participant.id));
    return c.json(results, 200);
  }
);

export default app;
