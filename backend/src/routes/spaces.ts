import { Hono } from "hono";
import { nanoid } from "nanoid";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { challenges, participants, spaces } from "../db";
import { and, eq } from "drizzle-orm/sql/expressions/conditions";
import {
  idParamSchema,
  spaceShortIdParamSchema,
  createSpaceSchema,
  updateSpaceSchema,
  joinSpaceSchema,
  joinSpaceResponseSchema,
  spaceResponseSchema,
  publicSpaceResponseSchema,
  createChallengeSchema,
  challengeResponseSchema,
  participantResponseSchema,
} from "shared";
import {
  assertSpaceAccess,
  bearerSecurity,
  issueTokens,
  loadOwnedSpace,
  loadVisibleTemplate,
  requireAdmin,
  requireOrganizer,
  requireSpaceMember,
} from "../auth";

const app = new Hono();

app.get(
  "/",
  describeRoute({
    operationId: "Get Spaces",
    tags: ["Spaces", "Admin"],
    description: "Get all spaces (admin only). Organizers use GET /users/me/spaces.",
    security: bearerSecurity,
    responses: {
      200: {
        description: "A list of spaces",
        content: {
          "application/json": {
            schema: resolver(v.array(spaceResponseSchema)),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Admin role required" },
    },
  }),
  requireAdmin,
  async (c) => {
    return c.json(await db.select().from(spaces), 200);
  }
);

app.post(
  "/",
  describeRoute({
    operationId: "Create Space",
    description: "Create a new space organized by the caller",
    tags: ["Spaces"],
    security: bearerSecurity,
    responses: {
      201: {
        description: "Space created successfully",
        content: {
          "application/json": {
            schema: resolver(spaceResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Organizer role required" },
    },
  }),
  requireOrganizer,
  validator("json", createSpaceSchema),
  async (c) => {
    const body = c.req.valid("json");

    const [created] = await db
      .insert(spaces)
      .values({ organizerId: c.var.organizer.userId, title: body.title, shortId: nanoid(12) })
      .returning();

    return c.json(created, 201);
  }
);

app.get(
  "/:id",
  describeRoute({
    operationId: "Get Space",
    tags: ["Spaces"],
    description: "Get a space owned by the caller",
    security: bearerSecurity,
    responses: {
      200: {
        description: "Space found",
        content: {
          "application/json": {
            schema: resolver(spaceResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "You do not own this space" },
      404: { description: "Space not found" },
    },
  }),
  requireOrganizer,
  validator("param", idParamSchema),
  async (c) => {
    const space = await loadOwnedSpace(c.req.valid("param").id, c.var.organizer);
    return c.json(space, 200);
  }
);

app.patch(
  "/:id",
  describeRoute({
    operationId: "Update Space",
    tags: ["Spaces"],
    description: "Update a space owned by the caller",
    security: bearerSecurity,
    responses: {
      200: {
        description: "Space updated successfully",
        content: {
          "application/json": {
            schema: resolver(spaceResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "You do not own this space" },
      404: { description: "Space not found" },
    },
  }),
  requireOrganizer,
  validator("param", idParamSchema),
  validator("json", updateSpaceSchema),
  async (c) => {
    const space = await loadOwnedSpace(c.req.valid("param").id, c.var.organizer);
    const updatedData = c.req.valid("json");
    if (Object.keys(updatedData).length === 0) {
      return c.json(space, 200);
    }

    const [updated] = await db.update(spaces).set(updatedData).where(eq(spaces.id, space.id)).returning();
    return c.json(updated, 200);
  }
);

app.delete(
  "/:id",
  describeRoute({
    operationId: "Delete Space",
    tags: ["Spaces"],
    description: "Delete a space owned by the caller",
    security: bearerSecurity,
    responses: {
      204: { description: "Space deleted successfully" },
      401: { description: "Not authenticated" },
      403: { description: "You do not own this space" },
      404: { description: "Space not found" },
    },
  }),
  requireOrganizer,
  validator("param", idParamSchema),
  async (c) => {
    const space = await loadOwnedSpace(c.req.valid("param").id, c.var.organizer);
    await db.delete(spaces).where(eq(spaces.id, space.id));
    return c.body(null, 204);
  }
);

app.get(
  "/:id/challenges",
  describeRoute({
    operationId: "Get Space Challenges",
    tags: ["Spaces"],
    description: "Get all challenges of a space. Available to the space organizer and its participants.",
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
      403: { description: "No access to this space" },
      404: { description: "Space not found" },
    },
  }),
  requireSpaceMember,
  validator("param", idParamSchema),
  async (c) => {
    const spaceId = c.req.valid("param").id;
    await assertSpaceAccess(spaceId, c.var.caller);

    const spaceChallenges = await db.select().from(challenges).where(eq(challenges.spaceId, spaceId));
    return c.json(spaceChallenges, 200);
  }
);

app.post(
  "/:id/challenges",
  describeRoute({
    operationId: "Create Challenge",
    tags: ["Spaces"],
    description: "Create a challenge in a space owned by the caller",
    security: bearerSecurity,
    responses: {
      201: {
        description: "Challenge created successfully",
        content: {
          "application/json": {
            schema: resolver(challengeResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "You do not own this space" },
      404: { description: "Space or template not found" },
    },
  }),
  requireOrganizer,
  validator("param", idParamSchema),
  validator("json", createChallengeSchema),
  async (c) => {
    const space = await loadOwnedSpace(c.req.valid("param").id, c.var.organizer);
    const body = c.req.valid("json");
    await loadVisibleTemplate(body.templateId, c.var.organizer);

    const [created] = await db
      .insert(challenges)
      .values({ ...body, spaceId: space.id })
      .returning();

    return c.json(created, 201);
  }
);

app.get(
  "/:id/participants",
  describeRoute({
    operationId: "Get Space Participants",
    tags: ["Spaces"],
    description: "Get all participants of a space owned by the caller",
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
      403: { description: "You do not own this space" },
      404: { description: "Space not found" },
    },
  }),
  requireOrganizer,
  validator("param", idParamSchema),
  async (c) => {
    const space = await loadOwnedSpace(c.req.valid("param").id, c.var.organizer);
    const spaceParticipants = await db.select().from(participants).where(eq(participants.spaceId, space.id));
    return c.json(spaceParticipants, 200);
  }
);

app.get(
  "/join/:shortId",
  describeRoute({
    operationId: "Get Space by Join Link",
    tags: ["Spaces"],
    description: "Public lookup of the space behind a join link. Returns only what the join page needs.",
    responses: {
      200: {
        description: "Space found",
        content: {
          "application/json": {
            schema: resolver(publicSpaceResponseSchema),
          },
        },
      },
      404: { description: "Space not found" },
    },
  }),
  validator("param", spaceShortIdParamSchema),
  async (c) => {
    const [space] = await db
      .select({ shortId: spaces.shortId, title: spaces.title })
      .from(spaces)
      .where(eq(spaces.shortId, c.req.valid("param").shortId));
    if (!space) {
      return c.body(null, 404);
    }

    return c.json(space, 200);
  }
);

app.post(
  "/join/:shortId",
  describeRoute({
    operationId: "Join Space",
    tags: ["Spaces"],
    description: "Join a space via its short ID and receive participant tokens",
    responses: {
      201: {
        description: "Successfully joined the space",
        content: {
          "application/json": {
            schema: resolver(joinSpaceResponseSchema),
          },
        },
      },
      400: { description: "A participant with this name already exists in the space" },
      404: { description: "Space not found" },
    },
  }),
  validator("param", spaceShortIdParamSchema),
  validator("json", joinSpaceSchema),
  async (c) => {
    const body = c.req.valid("json");

    const [space] = await db.select().from(spaces).where(eq(spaces.shortId, c.req.valid("param").shortId));
    if (!space) {
      return c.body(null, 404);
    }

    const [existing] = await db
      .select()
      .from(participants)
      .where(and(eq(participants.spaceId, space.id), eq(participants.name, body.name)));
    if (existing) {
      return c.json({ error: "Participant with this name already exists in the space" }, 400);
    }

    const [participant] = await db
      .insert(participants)
      .values({ spaceId: space.id, name: body.name, age: body.age, gender: body.gender })
      .returning();

    const tokens = await issueTokens({
      kind: "participant",
      participant: { id: participant.id, spaceId: participant.spaceId },
    });

    return c.json({ participant, ...tokens }, 201);
  }
);

export default app;
