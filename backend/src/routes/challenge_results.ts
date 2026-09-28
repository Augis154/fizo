import { Hono } from "hono";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { challenge_results } from "../db";
import { eq } from "drizzle-orm/sql/expressions/conditions";

const uuidSchema = v.pipe(v.string(), v.uuid());

const idParamSchema = v.object({
  id: uuidSchema,
});

const jsonObjectSchema = v.record(v.string(), v.unknown());

const postChallengeResultsSchema = v.object({
  challengeId: uuidSchema,
  participantId: uuidSchema,
  rawMetrics: jsonObjectSchema,
});

const patchChallengeResultsSchema = v.object({
  rawMetrics: v.optional(jsonObjectSchema),
});

export const challengeResultResponseSchema = v.object({
  id: uuidSchema,
  challengeId: uuidSchema,
  participantId: uuidSchema,
  rawMetrics: jsonObjectSchema,
  createdAt: v.string(),
  updatedAt: v.string(),
});

const app = new Hono();

app.get(
  "/",
  describeRoute({
    operationId: "Get Challenge Results",
    tags: ["Challenges Results"],
    description: "Get all challenge results",
    responses: {
      200: {
        description: "A list of challenge results",
        content: {
          "application/json": {
            schema: resolver(v.array(challengeResultResponseSchema)),
          },
        },
      },
    },
  }),
  async (c) => {
    const allChallengeResults = await db.select().from(challenge_results);
    return c.json(allChallengeResults, 200);
  }
);

app.post(
  "/",
  describeRoute({
    operationId: "Create Challenge Result",
    description: "Create a new challenge result",
    tags: ["Challenges Results"],
    responses: {
      201: {
        description: "Challenge created successfully",
      },
      500: {
        description: "Failed to create challenge",
      },
    },
  }),
  validator("json", postChallengeResultsSchema),
  async (c) => {
    const body = c.req.valid("json");

    try {
      await db.insert(challenge_results).values({
        challengeId: body.challengeId,
        participantId: body.participantId,
        rawMetrics: body.rawMetrics,
        totalScore: "0.00",
      });
    } catch (error) {
      return c.json({ error: "Failed to create challenge result", details: error }, 500);
    }

    return c.body(null, 201);
  }
);

app.get(
  "/:id",
  describeRoute({
    operationId: "Get Challenge Result",
    tags: ["Challenges Results"],
    description: "Get a challenge result by its ID",
    responses: {
      200: {
        description: "Challenge found",
        content: {
          "application/json": {
            schema: resolver(challengeResultResponseSchema),
          },
        },
      },
    },
  }),
  validator("param", idParamSchema),
  async (c) => {
    const challengeResultId = c.req.param("id");

    const challengeList = await db.select().from(challenge_results).where(eq(challenge_results.id, challengeResultId));
    if (!challengeList || challengeList.length === 0) {
      return c.body(null, 404);
    }

    return c.json(challengeList[0], 200);
  }
);

app.patch(
  "/:id",
  describeRoute({
    operationId: "Update Challenge Result",
    tags: ["Challenges Results"],
    description: "Update a challenge result by its ID",
    responses: {
      200: {
        description: "Challenge updated successfully",
        content: {
          "application/json": {
            schema: resolver(challengeResultResponseSchema),
          },
        },
      },
      404: {
        description: "Challenge not found",
      },
    },
  }),
  validator("param", idParamSchema),
  validator("json", patchChallengeResultsSchema),
  async (c) => {
    const challengeResultId = c.req.param("id");
    const updatedData = c.req.valid("json");

    const updatedChallenge = await db
      .update(challenge_results)
      .set(updatedData)
      .where(eq(challenge_results.id, challengeResultId))
      .returning();

    if (!updatedChallenge || updatedChallenge.length === 0) {
      return c.body(null, 404);
    }

    return c.json(updatedChallenge[0], 200);
  }
);

app.delete(
  "/:id",
  describeRoute({
    operationId: "Delete Challenge Result",
    tags: ["Challenges Results"],
    description: "Delete a challenge result by its ID",
    responses: {
      204: {
        description: "Challenge result deleted successfully",
      },
      404: {
        description: "Challenge result not found",
      },
    },
  }),
  validator("param", idParamSchema),
  async (c) => {
    const challengeResultId = c.req.param("id");

    const deletedChallenge = await db
      .delete(challenge_results)
      .where(eq(challenge_results.id, challengeResultId))
      .returning();

    if (!deletedChallenge || deletedChallenge.length === 0) {
      return c.body(null, 404);
    }

    return c.body(null, 204);
  }
);

export default app;
