import { Hono } from "hono";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { challenge_results, challenges } from "../db";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { challengeResultResponseSchema } from "./challenge_results";

const uuidSchema = v.pipe(v.string(), v.uuid());

const idParamSchema = v.object({
  id: uuidSchema,
});

const postChallengesSchema = v.object({
  spaceId: uuidSchema,
  templateId: uuidSchema,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  startDate: v.pipe(v.string(), v.toDate()),
  endDate: v.pipe(v.string(), v.toDate()),
  status: v.string(),
});

const patchChallengesSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(255))),
});

export const challengeResponseSchema = v.object({
  id: uuidSchema,
  spaceId: uuidSchema,
  templateId: uuidSchema,
  title: v.string(),
  startDate: v.date(),
  endDate: v.date(),
  status: v.string(),
  createdAt: v.string(),
});

const app = new Hono();

app.get(
  "/",
  describeRoute({
    operationId: "Get Challenges",
    tags: ["Challenges"],
    description: "Get all challenges",
    responses: {
      200: {
        description: "A list of challenges",
        content: {
          "application/json": {
            schema: resolver(v.array(challengeResponseSchema)),
          },
        },
      },
    },
  }),
  async (c) => {
    const allChallenges = await db.select().from(challenges);
    return c.json(allChallenges, 200);
  }
);

app.post(
  "/",
  describeRoute({
    operationId: "Create Challenge",
    description: "Create a new challenge",
    tags: ["Challenges"],
    responses: {
      201: {
        description: "Challenge created successfully",
      },
      500: {
        description: "Failed to create challenge",
      },
    },
  }),
  validator("json", postChallengesSchema),
  async (c) => {
    const body = c.req.valid("json");

    try {
      await db.insert(challenges).values({
        title: body.title,
        spaceId: body.spaceId,
        templateId: body.templateId,
        startDate: body.startDate,
        endDate: body.endDate,
        status: body.status,
      });
    } catch (error) {
      return c.json({ error: "Failed to create challenge", details: error }, 500);
    }

    return c.body(null, 201);
  }
);

app.get(
  "/:id",
  describeRoute({
    operationId: "Get Challenge",
    tags: ["Challenges"],
    description: "Get a challenge by its ID",
    responses: {
      200: {
        description: "Challenge found",
        content: {
          "application/json": {
            schema: resolver(challengeResponseSchema),
          },
        },
      },
    },
  }),
  validator("param", idParamSchema),
  async (c) => {
    const challengeId = c.req.param("id");

    const challengeList = await db.select().from(challenges).where(eq(challenges.id, challengeId));
    if (!challengeList || challengeList.length === 0) {
      return c.body(null, 404);
    }

    return c.json(challengeList[0], 200);
  }
);

app.patch(
  "/:id",
  describeRoute({
    operationId: "Update Challenge",
    tags: ["Challenges"],
    description: "Update a challenge by its ID",
    responses: {
      200: {
        description: "Challenge updated successfully",
        content: {
          "application/json": {
            schema: resolver(challengeResponseSchema),
          },
        },
      },
      404: {
        description: "Challenge not found",
      },
    },
  }),
  validator("param", idParamSchema),
  validator("json", patchChallengesSchema),
  async (c) => {
    const challengeId = c.req.param("id");
    const updatedData = c.req.valid("json");

    const updatedChallenge = await db
      .update(challenges)
      .set(updatedData)
      .where(eq(challenges.id, challengeId))
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
    operationId: "Delete Challenge",
    tags: ["Challenges"],
    description: "Delete a challenge by its ID",
    responses: {
      204: {
        description: "Challenge deleted successfully",
      },
      404: {
        description: "Challenge not found",
      },
    },
  }),
  validator("param", idParamSchema),
  async (c) => {
    const challengeId = c.req.param("id");

    const deletedChallenge = await db.delete(challenges).where(eq(challenges.id, challengeId)).returning();

    if (!deletedChallenge || deletedChallenge.length === 0) {
      return c.body(null, 404);
    }

    return c.body(null, 204);
  }
);

app.get(
  "/:id/results",
  describeRoute({
    operationId: "Get Challenge Results",
    tags: ["Challenges"],
    description: "Get all results for a specific challenge by its ID",
    responses: {
      200: {
        description: "A list of challenge results",
        content: {
          "application/json": {
            schema: resolver(v.array(challengeResultResponseSchema)),
          },
        },
      },
      404: {
        description: "Challenge not found",
      },
    },
  }),
  validator("param", idParamSchema),
  async (c) => {
    const challengeId = c.req.param("id");

    const challengeResults = await db
      .select()
      .from(challenge_results)
      .where(eq(challenge_results.challengeId, challengeId));
    if (!challengeResults || challengeResults.length === 0) {
      return c.body(null, 404);
    }

    return c.json(challengeResults, 200);
  }
);

export default app;
