import { Hono } from "hono";

import { validator, resolver, describeRoute } from "hono-openapi";

import db, { users } from "../db";
import { eq } from "drizzle-orm/sql/expressions/conditions";
import { registerUserSchema, loginUserSchema, authResponseSchema, refreshTokenSchema, tokenPairSchema } from "shared";
import { issueUserTokens, revokeRefreshToken, rotateRefreshToken } from "../auth";
import { getPgErrorCode, PG_UNIQUE_VIOLATION } from "../db/errors";
import { toUserResponse } from "./users";

const app = new Hono();

app.post(
  "/register",
  describeRoute({
    operationId: "Register",
    description: "Register a new organizer account and log in",
    tags: ["Auth"],
    responses: {
      201: {
        description: "Registered and logged in",
        content: {
          "application/json": {
            schema: resolver(authResponseSchema),
          },
        },
      },
      409: {
        description: "Email is already registered",
      },
    },
  }),
  validator("json", registerUserSchema),
  async (c) => {
    const body = c.req.valid("json");

    const passwordHash = await Bun.password.hash(body.password);

    let user;
    try {
      [user] = await db.insert(users).values({ email: body.email, name: body.name, passwordHash }).returning();
    } catch (error) {
      if (getPgErrorCode(error) === PG_UNIQUE_VIOLATION) {
        return c.json({ error: "Email is already registered" }, 409);
      }
      throw error;
    }

    const tokens = await issueUserTokens(user);

    return c.json({ user: toUserResponse(user), ...tokens }, 201);
  }
);

app.post(
  "/login",
  describeRoute({
    operationId: "Login",
    description: "Log in as an organizer and receive an access/refresh token pair",
    tags: ["Auth"],
    responses: {
      200: {
        description: "Logged in successfully",
        content: {
          "application/json": {
            schema: resolver(authResponseSchema),
          },
        },
      },
      401: {
        description: "Invalid email or password",
      },
    },
  }),
  validator("json", loginUserSchema),
  async (c) => {
    const body = c.req.valid("json");

    const [user] = await db.select().from(users).where(eq(users.email, body.email));
    const isPasswordValid = user ? await Bun.password.verify(body.password, user.passwordHash) : false;
    if (!user || !isPasswordValid) {
      return c.json({ error: "Invalid email or password" }, 401);
    }

    const tokens = await issueUserTokens(user);

    return c.json({ user: toUserResponse(user), ...tokens }, 200);
  }
);

app.post(
  "/refresh",
  describeRoute({
    operationId: "Refresh Tokens",
    description: "Exchange a refresh token for a new access/refresh token pair. The old refresh token is invalidated.",
    tags: ["Auth"],
    responses: {
      200: {
        description: "New token pair",
        content: {
          "application/json": {
            schema: resolver(tokenPairSchema),
          },
        },
      },
      401: {
        description: "Invalid or expired refresh token",
      },
    },
  }),
  validator("json", refreshTokenSchema),
  async (c) => {
    const { refreshToken } = c.req.valid("json");
    return c.json(await rotateRefreshToken(refreshToken), 200);
  }
);

app.post(
  "/logout",
  describeRoute({
    operationId: "Logout",
    description: "Invalidate a refresh token. Works for both organizers and participants.",
    tags: ["Auth"],
    responses: {
      204: { description: "Logged out" },
    },
  }),
  validator("json", refreshTokenSchema),
  async (c) => {
    const { refreshToken } = c.req.valid("json");
    await revokeRefreshToken(refreshToken);
    return c.body(null, 204);
  }
);

export default app;
