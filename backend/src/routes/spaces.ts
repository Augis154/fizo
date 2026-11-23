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
import { getPgErrorCode, PG_UNIQUE_VIOLATION } from "../db/errors";
import { nameMatches } from "../participants";
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

const routes = new Hono()
  .get(
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
  )
  .post(
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
  )
  .get(
    "/:id",
    describeRoute({
      operationId: "Get Space",
      tags: ["Spaces"],
      description: "Get a space. Available to its organizer and its participants.",
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
        403: { description: "No access to this space" },
        404: { description: "Space not found" },
      },
    }),
    requireSpaceMember,
    validator("param", idParamSchema),
    async (c) => {
      const spaceId = c.req.valid("param").id;
      await assertSpaceAccess(spaceId, c.var.caller);

      const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId));
      if (!space) {
        return c.body(null, 404);
      }
      return c.json(space, 200);
    }
  )
  .patch(
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
  )
  .delete(
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
  )
  .get(
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
  )
  .post(
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
  )
  .get(
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
  )
  .get(
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
  )
  .post(
    "/join/:shortId",
    describeRoute({
      operationId: "Join Space",
      tags: ["Spaces"],
      description:
        "Join a space via its short ID and receive participant tokens. Participants are identified " +
        "by name within a space, so submitting a name that already joined returns that participant " +
        "and their history instead of creating a new one — this is how someone gets back in after " +
        "clearing their browser or switching device.",
      responses: {
        200: {
          description: "Rejoined as an existing participant",
          content: {
            "application/json": {
              schema: resolver(joinSpaceResponseSchema),
            },
          },
        },
        201: {
          description: "Successfully joined as a new participant",
          content: {
            "application/json": {
              schema: resolver(joinSpaceResponseSchema),
            },
          },
        },
        404: { description: "Space not found" },
      },
    }),
    validator("param", spaceShortIdParamSchema),
    validator("json", joinSpaceSchema),
    async (c) => {
      const body = c.req.valid("json");

      const [space] = await db
        .select()
        .from(spaces)
        .where(eq(spaces.shortId, c.req.valid("param").shortId));
      if (!space) {
        return c.body(null, 404);
      }

      const rejoin = async (participant: typeof participants.$inferSelect) => {
        const tokens = await issueTokens({
          kind: "participant",
          participant: { id: participant.id, spaceId: participant.spaceId },
        });
        return { participant, ...tokens, rejoined: true as const };
      };

      const [existing] = await db
        .select()
        .from(participants)
        .where(and(eq(participants.spaceId, space.id), nameMatches(body.name)));

      if (existing) {
        // Rejoining: hand back the existing participant so their results come with them. Age and
        // gender are only overwritten when supplied, so rejoining with the fields left blank does
        // not wipe details the participant has already filled in.
        const details = {
          ...(body.age !== undefined ? { age: body.age } : {}),
          ...(body.gender !== undefined ? { gender: body.gender } : {}),
        };

        const participant =
          Object.keys(details).length > 0
            ? (await db.update(participants).set(details).where(eq(participants.id, existing.id)).returning())[0]
            : existing;

        return c.json(await rejoin(participant), 200);
      }

      let created: typeof participants.$inferSelect;
      try {
        [created] = await db
          .insert(participants)
          .values({ spaceId: space.id, name: body.name, age: body.age, gender: body.gender })
          .returning();
      } catch (error) {
        // Two devices can join the same name at once; the unique index lets one through and the
        // loser rejoins rather than seeing a conflict.
        if (getPgErrorCode(error) !== PG_UNIQUE_VIOLATION) {
          throw error;
        }
        const [raced] = await db
          .select()
          .from(participants)
          .where(and(eq(participants.spaceId, space.id), nameMatches(body.name)));
        if (!raced) {
          throw error;
        }
        return c.json(await rejoin(raced), 200);
      }

      const tokens = await issueTokens({
        kind: "participant",
        participant: { id: created.id, spaceId: created.spaceId },
      });

      return c.json({ participant: created, ...tokens, rejoined: false }, 201);
    }
  );

export default routes;
