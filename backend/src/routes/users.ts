import { Hono } from "hono";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { spaces, templates, users } from "../db";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { idParamSchema, userResponseSchema, spaceResponseSchema, templateResponseSchema } from "shared";
import { bearerSecurity, requireAdmin, requireOrganizer } from "../auth";

export const toUserResponse = (user: typeof users.$inferSelect) => ({
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  createdAt: user.createdAt.toISOString(),
});

const app = new Hono();

app.get(
  "/me",
  describeRoute({
    operationId: "Get Current User",
    description: "Get the currently authenticated organizer",
    tags: ["Users"],
    security: bearerSecurity,
    responses: {
      200: {
        description: "The current user",
        content: {
          "application/json": {
            schema: resolver(userResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Organizer role required" },
    },
  }),
  requireOrganizer,
  async (c) => {
    const [user] = await db.select().from(users).where(eq(users.id, c.var.organizer.userId));
    if (!user) {
      return c.body(null, 404);
    }
    return c.json(toUserResponse(user), 200);
  }
);

app.delete(
  "/me",
  describeRoute({
    operationId: "Delete Current User",
    tags: ["Users"],
    description: "Delete the currently authenticated organizer account",
    security: bearerSecurity,
    responses: {
      204: { description: "User deleted successfully" },
      401: { description: "Not authenticated" },
      403: { description: "Organizer role required" },
    },
  }),
  requireOrganizer,
  async (c) => {
    await db.delete(users).where(eq(users.id, c.var.organizer.userId));
    return c.body(null, 204);
  }
);

app.get(
  "/me/spaces",
  describeRoute({
    operationId: "Get Current User Spaces",
    tags: ["Users"],
    description: "Get all spaces organized by the current user",
    security: bearerSecurity,
    responses: {
      200: {
        description: "A list of the user's spaces",
        content: {
          "application/json": {
            schema: resolver(v.array(spaceResponseSchema)),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Organizer role required" },
    },
  }),
  requireOrganizer,
  async (c) => {
    const userSpaces = await db.select().from(spaces).where(eq(spaces.organizerId, c.var.organizer.userId));
    return c.json(userSpaces, 200);
  }
);

app.get(
  "/me/templates",
  describeRoute({
    operationId: "Get Current User Templates",
    tags: ["Users"],
    description: "Get all templates created by the current user",
    security: bearerSecurity,
    responses: {
      200: {
        description: "A list of the user's templates",
        content: {
          "application/json": {
            schema: resolver(v.array(templateResponseSchema)),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Organizer role required" },
    },
  }),
  requireOrganizer,
  async (c) => {
    const userTemplates = await db.select().from(templates).where(eq(templates.creatorId, c.var.organizer.userId));
    return c.json(userTemplates, 200);
  }
);

app.get(
  "/",
  describeRoute({
    operationId: "Get Users",
    tags: ["Users", "Admin"],
    description: "Get all users (admin only)",
    security: bearerSecurity,
    responses: {
      200: {
        description: "A list of users",
        content: {
          "application/json": {
            schema: resolver(v.array(userResponseSchema)),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Admin role required" },
    },
  }),
  requireAdmin,
  async (c) => {
    const allUsers = await db.select().from(users);
    return c.json(allUsers.map(toUserResponse), 200);
  }
);

app.get(
  "/:id",
  describeRoute({
    operationId: "Get User",
    tags: ["Users", "Admin"],
    description: "Get any user by ID (admin only)",
    security: bearerSecurity,
    responses: {
      200: {
        description: "User found",
        content: {
          "application/json": {
            schema: resolver(userResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Admin role required" },
      404: { description: "User not found" },
    },
  }),
  requireAdmin,
  validator("param", idParamSchema),
  async (c) => {
    const [user] = await db.select().from(users).where(eq(users.id, c.req.valid("param").id));
    if (!user) {
      return c.body(null, 404);
    }
    return c.json(toUserResponse(user), 200);
  }
);

export default app;
