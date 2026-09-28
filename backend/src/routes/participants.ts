import { Hono } from "hono";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { spaces, users } from "../db";
import { and, eq } from "drizzle-orm/sql/expressions/conditions";
import { spaceResponseSchema } from "./spaces";

const uuidSchema = v.pipe(v.string(), v.uuid());

const idParamSchema = v.object({
  id: uuidSchema,
});

const registerSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
});

const loginSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
});

const userResponseSchema = v.object({
  id: uuidSchema,
  email: v.string(),
  name: v.string(),
  createdAt: v.string(),
});

const app = new Hono();

app.post(
  "/register",
  describeRoute({
    operationId: "Register User",
    description: "Register a new user",
    tags: ["Users"],
    responses: {
      201: {
        description: "User created successfully",
      },
      500: {
        description: "Failed to register user",
      },
    },
  }),
  validator("json", registerSchema),
  async (c) => {
    const body = c.req.valid("json");

    const passwordHash = body.password;

    try {
      await db.insert(users).values({
        email: body.email,
        name: body.name,
        passwordHash: passwordHash,
      });
    } catch (error) {
      return c.json({ error: "Failed to create user", details: error }, 500);
    }

    return c.body(null, 201);
  }
);

app.post(
  "/login",
  describeRoute({
    operationId: "Login as User",
    description: "Login as an existing user",
    tags: ["Users"],
    responses: {
      200: {
        description: "User logged in successfully",
        content: {
          "application/json": {
            schema: resolver(userResponseSchema),
          },
        },
      },
      401: {
        description: "Invalid email or password",
      },
    },
  }),
  validator("json", loginSchema),
  async (c) => {
    const body = c.req.valid("json");

    const userList = await db.select().from(users).where(eq(users.email, body.email));
    if (!userList || userList.length === 0) {
      return c.json({ error: "Invalid email" }, 401);
    }

    const user = userList[0];

    const passwordHash = await Bun.password.hash(body.password);
    const isPasswordValid = await Bun.password.verify(user.passwordHash, passwordHash);
    if (!isPasswordValid) {
      return c.json({ error: "Invalid password" }, 401);
    }

    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    };

    return c.json(userResponse, 200);
  }
);

app.delete(
  "/:id",
  describeRoute({
    operationId: "Delete User",
    tags: ["Users"],
    description: "Delete a user by its ID",
    responses: {
      204: {
        description: "User deleted successfully",
      },
      404: {
        description: "User not found",
      },
    },
  }),
  validator("param", idParamSchema),
  async (c) => {
    const userId = c.req.param("id");

    const deletedUser = await db.delete(users).where(eq(users.id, userId)).returning();

    if (!deletedUser || deletedUser.length === 0) {
      return c.body(null, 404);
    }

    return c.body(null, 204);
  }
);

app.get(
  "/:id/spaces",
  describeRoute({
    operationId: "Get User Spaces",
    tags: ["Users"],
    description: "Get all spaces for a user",
    responses: {
      200: {
        description: "A list of spaces for the user",
        content: {
          "application/json": {
            schema: resolver(v.array(spaceResponseSchema)),
          },
        },
      },
    },
  }),
  async (c) => {
    const userId = c.req.param("id");

    const userList = await db.select().from(users).where(eq(users.id, userId));
    if (!userList || userList.length === 0) {
      return c.body(null, 404);
    }

    const userSpaces = await db.select().from(spaces).where(eq(spaces.organizerId, userId));

    return c.json(userSpaces, 200);
  }
);

export default app;
