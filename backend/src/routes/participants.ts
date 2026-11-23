import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { challenge_results, participants } from "../db";
import { and, eq, ne } from "drizzle-orm/sql/expressions/conditions";
import { participantResponseSchema, challengeResultResponseSchema, updateParticipantSchema } from "shared";
import { bearerSecurity, requireAdmin, requireParticipant } from "../auth";
import { nameMatches } from "../participants";

const routes = new Hono()
  .get(
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
  )
  .get(
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
  )
  .patch(
    "/me",
    describeRoute({
      operationId: "Update Current Participant",
      tags: ["Participants"],
      description:
        "Update the authenticated participant's own details. Age and gender are what age- and " +
        "gender-banded scoring tables read, so a participant who joined without them can add them here.",
      security: bearerSecurity,
      responses: {
        200: {
          description: "The updated participant",
          content: {
            "application/json": {
              schema: resolver(participantResponseSchema),
            },
          },
        },
        400: { description: "A participant with this name already exists in the space" },
        401: { description: "Not authenticated" },
        403: { description: "Participant role required" },
        404: { description: "Participant not found" },
      },
    }),
    requireParticipant,
    validator("json", updateParticipantSchema),
    async (c) => {
      const { id, spaceId } = c.var.participant;
      const updatedData = c.req.valid("json");

      const [existing] = await db.select().from(participants).where(eq(participants.id, id));
      if (!existing) {
        return c.body(null, 404);
      }
      if (Object.keys(updatedData).length === 0) {
        return c.json(existing, 200);
      }

      // Names identify participants within a space, the same rule the join form enforces.
      if (updatedData.name !== undefined && updatedData.name !== existing.name) {
        const [clash] = await db
          .select({ id: participants.id })
          .from(participants)
          .where(and(eq(participants.spaceId, spaceId), nameMatches(updatedData.name), ne(participants.id, id)));
        if (clash) {
          throw new HTTPException(400, { message: "Participant with this name already exists in the space" });
        }
      }

      const [updated] = await db.update(participants).set(updatedData).where(eq(participants.id, id)).returning();
      return c.json(updated, 200);
    }
  )
  .get(
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

export default routes;
