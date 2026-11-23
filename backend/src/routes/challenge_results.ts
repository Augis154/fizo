import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { challenge_results } from "../db";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { idParamSchema, updateChallengeResultSchema, challengeResultResponseSchema } from "shared";
import {
  bearerSecurity,
  loadChallengeForCaller,
  requireAdmin,
  requireParticipant,
  requireSpaceMember,
  type Caller,
} from "../auth";
import { scoreSubmission } from "../scoring";

const loadResultForCaller = async (resultId: string, caller: Caller) => {
  const [result] = await db.select().from(challenge_results).where(eq(challenge_results.id, resultId));
  if (!result) {
    throw new HTTPException(404, { message: "Challenge result not found" });
  }
  const challenge = await loadChallengeForCaller(result.challengeId, caller);
  return { result, challenge };
};

const routes = new Hono()
  .get(
    "/",
    describeRoute({
      operationId: "Get All Challenge Results",
      tags: ["Challenges Results", "Admin"],
      description: "Get all challenge results (admin only). Others use GET /challenges/:id/results.",
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
        403: { description: "Admin role required" },
      },
    }),
    requireAdmin,
    async (c) => {
      return c.json(await db.select().from(challenge_results), 200);
    }
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "Get Challenge Result",
      tags: ["Challenges Results"],
      description: "Get a challenge result by its ID. Available to the space organizer and its participants.",
      security: bearerSecurity,
      responses: {
        200: {
          description: "Challenge result found",
          content: {
            "application/json": {
              schema: resolver(challengeResultResponseSchema),
            },
          },
        },
        401: { description: "Not authenticated" },
        403: { description: "No access to this result" },
        404: { description: "Challenge result not found" },
      },
    }),
    requireSpaceMember,
    validator("param", idParamSchema),
    async (c) => {
      const { result } = await loadResultForCaller(c.req.valid("param").id, c.var.caller);
      return c.json(result, 200);
    }
  )
  .patch(
    "/:id",
    describeRoute({
      operationId: "Update Challenge Result",
      tags: ["Challenges Results"],
      description: "Update a result submitted by the authenticated participant",
      security: bearerSecurity,
      responses: {
        200: {
          description: "Challenge result updated successfully",
          content: {
            "application/json": {
              schema: resolver(challengeResultResponseSchema),
            },
          },
        },
        400: { description: "Metrics do not match the challenge's template" },
        401: { description: "Not authenticated" },
        403: { description: "You can only update your own results" },
        404: { description: "Challenge result not found" },
      },
    }),
    requireParticipant,
    validator("param", idParamSchema),
    validator("json", updateChallengeResultSchema),
    async (c) => {
      const participant = c.var.participant;
      const { result, challenge } = await loadResultForCaller(c.req.valid("param").id, {
        kind: "participant",
        participant,
      });
      if (result.participantId !== participant.id) {
        throw new HTTPException(403, { message: "You can only update your own results" });
      }

      const { rawMetrics } = c.req.valid("json");
      if (rawMetrics === undefined) {
        return c.json(result, 200);
      }

      const scored = await scoreSubmission(challenge, participant.id, rawMetrics);

      const [updated] = await db
        .update(challenge_results)
        .set(scored)
        .where(eq(challenge_results.id, result.id))
        .returning();
      return c.json(updated, 200);
    }
  )
  .delete(
    "/:id",
    describeRoute({
      operationId: "Delete Challenge Result",
      tags: ["Challenges Results"],
      description: "Delete a result. Allowed for the participant who submitted it and the space organizer.",
      security: bearerSecurity,
      responses: {
        204: { description: "Challenge result deleted successfully" },
        401: { description: "Not authenticated" },
        403: { description: "No permission to delete this result" },
        404: { description: "Challenge result not found" },
      },
    }),
    requireSpaceMember,
    validator("param", idParamSchema),
    async (c) => {
      const caller = c.var.caller;
      const { result } = await loadResultForCaller(c.req.valid("param").id, caller);
      if (caller.kind === "participant" && result.participantId !== caller.participant.id) {
        throw new HTTPException(403, { message: "You can only delete your own results" });
      }

      await db.delete(challenge_results).where(eq(challenge_results.id, result.id));
      return c.body(null, 204);
    }
  );

export default routes;
