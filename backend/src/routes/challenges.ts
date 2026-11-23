import { Hono } from "hono";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { challenge_results, challenges, participants, templates } from "../db";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import {
  idParamSchema,
  updateChallengeSchema,
  challengeResponseSchema,
  createChallengeResultSchema,
  challengeResultResponseSchema,
  leaderboardEntrySchema,
  templateResponseSchema,
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
import { scoreSubmission } from "../scoring";

const routes = new Hono()
  .get(
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
  )
  .get(
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
  )
  .patch(
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
  )
  .delete(
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
  )
  .get(
    "/:id/template",
    describeRoute({
      operationId: "Get Challenge Template",
      tags: ["Challenges"],
      description:
        "Get the template a challenge uses, including its exercises and scoring rules. " +
        "Available to the space organizer and its participants, who need it to fill in a result.",
      security: bearerSecurity,
      responses: {
        200: {
          description: "Template found",
          content: {
            "application/json": {
              schema: resolver(templateResponseSchema),
            },
          },
        },
        401: { description: "Not authenticated" },
        403: { description: "No access to this challenge" },
        404: { description: "Challenge or template not found" },
      },
    }),
    requireSpaceMember,
    validator("param", idParamSchema),
    async (c) => {
      const challenge = await loadChallengeForCaller(c.req.valid("param").id, c.var.caller);

      const [template] = await db.select().from(templates).where(eq(templates.id, challenge.templateId));
      if (!template) {
        return c.body(null, 404);
      }
      return c.json(template, 200);
    }
  )
  .get(
    "/:id/results",
    describeRoute({
      operationId: "Get Challenge Results",
      tags: ["Challenges"],
      description:
        "Get all results of a challenge (leaderboard), each with the participant who submitted it. " +
        "Available to the space organizer and its participants.",
      security: bearerSecurity,
      responses: {
        200: {
          description: "A list of challenge results",
          content: {
            "application/json": {
              schema: resolver(v.array(leaderboardEntrySchema)),
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

      const results = await db
        .select({
          id: challenge_results.id,
          challengeId: challenge_results.challengeId,
          participantId: challenge_results.participantId,
          rawMetrics: challenge_results.rawMetrics,
          totalScore: challenge_results.totalScore,
          scores: challenge_results.scores,
          createdAt: challenge_results.createdAt,
          updatedAt: challenge_results.updatedAt,
          participantName: participants.name,
          participantAge: participants.age,
          participantGender: participants.gender,
        })
        .from(challenge_results)
        .innerJoin(participants, eq(participants.id, challenge_results.participantId))
        .where(eq(challenge_results.challengeId, challenge.id));
      return c.json(results, 200);
    }
  )
  .post(
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
        400: { description: "Metrics do not match the challenge's template" },
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

      const scored = await scoreSubmission(challenge, participant.id, c.req.valid("json").rawMetrics);

      const [created] = await db
        .insert(challenge_results)
        .values({ challengeId: challenge.id, participantId: participant.id, ...scored })
        .returning();

      return c.json(created, 201);
    }
  );

export default routes;
