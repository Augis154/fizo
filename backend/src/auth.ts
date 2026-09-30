import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { sign, verify } from "hono/jwt";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm/sql/expressions/conditions";

import db, { challenges, participants, refreshTokens, spaces, templates, users } from "./db";

const JWT_SECRET = process.env.JWT_SECRET ?? "";
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in the environment variables.");
}

const JWT_ALGORITHM = "HS256";
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type Organizer = { userId: string; isAdmin: boolean };
export type Participant = { id: string; spaceId: string };

export type Caller = ({ kind: "organizer" } & Organizer) | { kind: "participant"; participant: Participant };

export type OrganizerEnv = { Variables: { organizer: Organizer } };
export type ParticipantEnv = { Variables: { participant: Participant } };
export type MemberEnv = { Variables: { caller: Caller } };

export const bearerSecurity = [{ bearerAuth: [] }];

export const issueTokens = async (caller: Caller) => {
  const exp = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;
  const payload =
    caller.kind === "organizer"
      ? { sub: caller.userId, role: caller.isAdmin ? "admin" : "organizer", exp }
      : { sub: caller.participant.id, role: "participant", spaceId: caller.participant.spaceId, exp };

  const accessToken = await sign(payload, JWT_SECRET, JWT_ALGORITHM);
  const refreshToken = nanoid(48);

  await db.insert(refreshTokens).values({
    token: refreshToken,
    userId: caller.kind === "organizer" ? caller.userId : null,
    participantId: caller.kind === "participant" ? caller.participant.id : null,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });

  return { accessToken, refreshToken };
};

export const issueUserTokens = (user: typeof users.$inferSelect) =>
  issueTokens({ kind: "organizer", userId: user.id, isAdmin: user.role === "admin" });

// Refresh tokens are single-use: each refresh deletes the old one and issues a new pair.
export const rotateRefreshToken = async (token: string) => {
  const invalid = new HTTPException(401, { message: "Invalid or expired refresh token" });

  const [stored] = await db.delete(refreshTokens).where(eq(refreshTokens.token, token)).returning();
  if (!stored || stored.expiresAt < new Date()) {
    throw invalid;
  }

  if (stored.userId) {
    const [user] = await db.select().from(users).where(eq(users.id, stored.userId));
    if (!user) {
      throw invalid;
    }
    return issueUserTokens(user);
  }

  const [participant] = await db
    .select({ id: participants.id, spaceId: participants.spaceId })
    .from(participants)
    .where(eq(participants.id, stored.participantId!));
  if (!participant) {
    throw invalid;
  }
  return issueTokens({ kind: "participant", participant });
};

export const revokeRefreshToken = async (token: string) => {
  await db.delete(refreshTokens).where(eq(refreshTokens.token, token));
};

const authenticate = async (c: Context): Promise<Caller> => {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    throw new HTTPException(401, { message: "Authentication required" });
  }

  let payload;
  try {
    payload = await verify(header.slice("Bearer ".length).trim(), JWT_SECRET, JWT_ALGORITHM);
  } catch {
    throw new HTTPException(401, { message: "Invalid or expired access token" });
  }

  if (typeof payload.sub !== "string") {
    throw new HTTPException(401, { message: "Invalid access token" });
  }
  if (payload.role === "organizer" || payload.role === "admin") {
    return { kind: "organizer", userId: payload.sub, isAdmin: payload.role === "admin" };
  }
  if (payload.role === "participant" && typeof payload.spaceId === "string") {
    return { kind: "participant", participant: { id: payload.sub, spaceId: payload.spaceId } };
  }
  throw new HTTPException(401, { message: "Invalid access token" });
};

export const requireOrganizer = createMiddleware<OrganizerEnv>(async (c, next) => {
  const caller = await authenticate(c);
  if (caller.kind !== "organizer") {
    throw new HTTPException(403, { message: "Organizer role required" });
  }
  c.set("organizer", { userId: caller.userId, isAdmin: caller.isAdmin });
  await next();
});

export const requireAdmin = createMiddleware<OrganizerEnv>(async (c, next) => {
  const caller = await authenticate(c);
  if (caller.kind !== "organizer" || !caller.isAdmin) {
    throw new HTTPException(403, { message: "Admin role required" });
  }
  c.set("organizer", { userId: caller.userId, isAdmin: true });
  await next();
});

export const requireParticipant = createMiddleware<ParticipantEnv>(async (c, next) => {
  const caller = await authenticate(c);
  if (caller.kind !== "participant") {
    throw new HTTPException(403, { message: "Participant role required" });
  }
  c.set("participant", caller.participant);
  await next();
});

export const requireSpaceMember = createMiddleware<MemberEnv>(async (c, next) => {
  c.set("caller", await authenticate(c));
  await next();
});

// Ownership helpers: admins pass every ownership check.

export const loadOwnedSpace = async (spaceId: string, organizer: Organizer) => {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId));
  if (!space) {
    throw new HTTPException(404, { message: "Space not found" });
  }
  if (!organizer.isAdmin && space.organizerId !== organizer.userId) {
    throw new HTTPException(403, { message: "You do not own this space" });
  }
  return space;
};

export const loadVisibleTemplate = async (templateId: string, organizer: Organizer) => {
  const [template] = await db.select().from(templates).where(eq(templates.id, templateId));
  if (!template || (!organizer.isAdmin && !template.isPublic && template.creatorId !== organizer.userId)) {
    throw new HTTPException(404, { message: "Template not found" });
  }
  return template;
};

export const loadOwnedTemplate = async (templateId: string, organizer: Organizer) => {
  const template = await loadVisibleTemplate(templateId, organizer);
  if (!organizer.isAdmin && template.creatorId !== organizer.userId) {
    throw new HTTPException(403, { message: "You do not own this template" });
  }
  return template;
};

export const assertSpaceAccess = async (spaceId: string, caller: Caller) => {
  if (caller.kind === "participant") {
    if (caller.participant.spaceId !== spaceId) {
      throw new HTTPException(403, { message: "You are not a participant of this space" });
    }
    return;
  }
  await loadOwnedSpace(spaceId, caller);
};

export const loadChallengeForCaller = async (challengeId: string, caller: Caller) => {
  const [challenge] = await db.select().from(challenges).where(eq(challenges.id, challengeId));
  if (!challenge) {
    throw new HTTPException(404, { message: "Challenge not found" });
  }
  await assertSpaceAccess(challenge.spaceId, caller);
  return challenge;
};
