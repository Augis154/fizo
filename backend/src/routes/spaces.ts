import { Hono } from "hono";
import { nanoid } from "nanoid";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { gender, participants, spaces } from "../db";
import { and, eq } from "drizzle-orm/sql/expressions/conditions";

const uuidSchema = v.pipe(v.string(), v.uuid());

const idParamSchema = v.object({
  id: uuidSchema,
});

const shortIdParamSchema = v.object({
  shortId: v.pipe(v.string(), v.minLength(1)),
});

const postSpacesSchema = v.object({
  organizerId: uuidSchema,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
});

const patchSpacesSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(255))),
});

enum Gender {
  Male = "male",
  Female = "female",
  // Other = "other",
}

const joinSpaceSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  age: v.optional(v.number()),
  gender: v.optional(v.enum(Gender)),
});

const joinSpaceResponseSchema = v.object({
  accessToken: v.string(),
});

export const spaceResponseSchema = v.object({
  id: uuidSchema,
  organizerId: uuidSchema,
  shortId: v.string(),
  title: v.string(),
  createdAt: v.string(),
});

const app = new Hono();

app.get(
  "/",
  describeRoute({
    operationId: "Get Spaces",
    tags: ["Spaces"],
    description: "Get all spaces",
    responses: {
      200: {
        description: "A list of spaces",
        content: {
          "application/json": {
            schema: resolver(v.array(spaceResponseSchema)),
          },
        },
      },
    },
  }),
  async (c) => {
    const allSpaces = await db.select().from(spaces);
    return c.json(allSpaces, 200);
  }
);

app.post(
  "/",
  describeRoute({
    operationId: "Create Space",
    description: "Create a new space",
    tags: ["Spaces"],
    responses: {
      201: {
        description: "Space created successfully",
      },
      500: {
        description: "Failed to create space",
      },
    },
  }),
  validator("json", postSpacesSchema),
  async (c) => {
    const body = c.req.valid("json");

    const shortId = nanoid(12);

    try {
      await db.insert(spaces).values({
        organizerId: body.organizerId,
        title: body.title,
        shortId: shortId,
      });
    } catch (error) {
      return c.json({ error: "Failed to create space", details: error }, 500);
    }

    return c.body(null, 201);
  }
);

app.get(
  "/:id",
  describeRoute({
    operationId: "Get Space",
    tags: ["Spaces"],
    description: "Get a space by its ID",
    responses: {
      200: {
        description: "Space found",
        content: {
          "application/json": {
            schema: resolver(spaceResponseSchema),
          },
        },
      },
    },
  }),
  validator("param", idParamSchema),
  async (c) => {
    const spaceId = c.req.param("id");

    const spaceList = await db.select().from(spaces).where(eq(spaces.id, spaceId));
    if (!spaceList || spaceList.length === 0) {
      return c.body(null, 404);
    }

    return c.json(spaceList[0], 200);
  }
);

app.patch(
  "/:id",
  describeRoute({
    operationId: "Update Space",
    tags: ["Spaces"],
    description: "Update a space by its ID",
    responses: {
      200: {
        description: "Space updated successfully",
        content: {
          "application/json": {
            schema: resolver(spaceResponseSchema),
          },
        },
      },
      404: {
        description: "Space not found",
      },
    },
  }),
  validator("param", idParamSchema),
  validator("json", patchSpacesSchema),
  async (c) => {
    const spaceId = c.req.param("id");
    const updatedData = c.req.valid("json");

    const updatedSpace = await db.update(spaces).set(updatedData).where(eq(spaces.id, spaceId)).returning();

    if (!updatedSpace || updatedSpace.length === 0) {
      return c.body(null, 404);
    }

    return c.json(updatedSpace[0], 200);
  }
);

app.delete(
  "/:id",
  describeRoute({
    operationId: "Delete Space",
    tags: ["Spaces"],
    description: "Delete a space by its ID",
    responses: {
      204: {
        description: "Space deleted successfully",
      },
      404: {
        description: "Space not found",
      },
    },
  }),
  validator("param", idParamSchema),
  async (c) => {
    const spaceId = c.req.param("id");

    const deletedSpace = await db.delete(spaces).where(eq(spaces.id, spaceId)).returning();

    if (!deletedSpace || deletedSpace.length === 0) {
      return c.body(null, 404);
    }

    return c.body(null, 204);
  }
);

app.get(
  "/short-id/:shortId",
  describeRoute({
    operationId: "Get Space by Short ID",
    tags: ["Spaces"],
    description: "Get a space by its short ID",
    responses: {
      200: {
        description: "Space found",
        content: {
          "application/json": {
            schema: resolver(spaceResponseSchema),
          },
        },
      },
      404: {
        description: "Space not found",
      },
    },
  }),
  validator("param", shortIdParamSchema),
  async (c) => {
    const shortId = c.req.param("shortId");

    const spaceList = await db.select().from(spaces).where(eq(spaces.shortId, shortId));
    if (!spaceList || spaceList.length === 0) {
      return c.body(null, 404);
    }

    return c.json(spaceList[0], 200);
  }
);

app.post(
  "/join/:shortId",
  describeRoute({
    operationId: "Join Space",
    tags: ["Spaces"],
    description: "Join a space by its ID",
    responses: {
      200: {
        description: "Successfully joined the space",
        content: {
          "application/json": {
            schema: resolver(joinSpaceResponseSchema),
          },
        },
      },
      404: {
        description: "Space not found",
      },
    },
  }),
  validator("param", shortIdParamSchema),
  validator("json", joinSpaceSchema),
  async (c) => {
    const shortId = c.req.param("shortId");
    const body = c.req.valid("json");

    const spaceList = await db.select().from(spaces).where(eq(spaces.shortId, shortId));
    if (!spaceList || spaceList.length === 0) {
      return c.body(null, 404);
    }

    const space = spaceList[0];

    const participantList = await db
      .select()
      .from(participants)
      .where(and(eq(participants.spaceId, space.id), eq(participants.name, body.name)));
    if (participantList && participantList.length > 0) {
      return c.json({ error: "Participant with this name already exists in the space" }, 400);
    }

    const accessToken = nanoid(32);

    await db.insert(participants).values({
      spaceId: space.id,
      name: body.name,
      age: body.age,
      gender: body.gender,
      accessToken: accessToken,
    });

    const response = {
      accessToken: accessToken,
    };

    return c.json(response, 200);
  }
);

export default app;
