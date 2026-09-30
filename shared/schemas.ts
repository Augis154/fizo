import * as v from "valibot";

export const uuidSchema = v.pipe(v.string(), v.uuid());
export const idParamSchema = v.object({ id: uuidSchema });
export const jsonObjectSchema = v.record(v.string(), v.unknown());

export enum ParticipantGender {
  Male = "male",
  Female = "female",
  // Other = "other",
}

// Users
export const registerUserSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
});

export const loginUserSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  password: v.pipe(v.string(), v.minLength(8)),
});

export const userResponseSchema = v.object({
  id: uuidSchema,
  email: v.string(),
  name: v.string(),
  role: v.picklist(["organizer", "admin"]),
  createdAt: v.string(),
});

// Auth
export const tokenPairSchema = v.object({
  accessToken: v.string(),
  refreshToken: v.string(),
});

export const refreshTokenSchema = v.object({
  refreshToken: v.pipe(v.string(), v.minLength(1)),
});

export const authResponseSchema = v.object({
  user: userResponseSchema,
  ...tokenPairSchema.entries,
});

// Spaces
export const spaceShortIdParamSchema = v.object({
  shortId: v.pipe(v.string(), v.minLength(1)),
});

export const createSpaceSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
});

export const updateSpaceSchema = v.partial(createSpaceSchema);

// Participants
export const joinSpaceSchema = v.object({
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  age: v.optional(v.number()),
  gender: v.optional(v.enum(ParticipantGender)),
});

export const participantResponseSchema = v.object({
  id: uuidSchema,
  spaceId: uuidSchema,
  name: v.string(),
  age: v.nullable(v.number()),
  gender: v.nullable(v.enum(ParticipantGender)),
  createdAt: v.string(),
});

export const joinSpaceResponseSchema = v.object({
  participant: participantResponseSchema,
  ...tokenPairSchema.entries,
});

export const publicSpaceResponseSchema = v.object({
  shortId: v.string(),
  title: v.string(),
});

export const spaceResponseSchema = v.object({
  id: uuidSchema,
  organizerId: uuidSchema,
  shortId: v.string(),
  title: v.string(),
  createdAt: v.string(),
});

// Templates
export const createTemplateSchema = v.object({
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  type: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
  isPublic: v.boolean(),
  config: jsonObjectSchema,
});

export const updateTemplateSchema = v.partial(createTemplateSchema);

export const templateResponseSchema = v.object({
  id: uuidSchema,
  creatorId: v.nullable(uuidSchema),
  title: v.string(),
  type: v.string(),
  isPublic: v.boolean(),
  config: jsonObjectSchema,
  createdAt: v.string(),
});

// Challenges
export const createChallengeSchema = v.object({
  templateId: uuidSchema,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  startDate: v.pipe(v.string(), v.toDate()),
  endDate: v.pipe(v.string(), v.toDate()),
  status: v.string(),
});

export const updateChallengeSchema = v.partial(createChallengeSchema);

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

// Challenge Results
export const createChallengeResultSchema = v.object({
  rawMetrics: jsonObjectSchema,
});

export const updateChallengeResultSchema = v.partial(createChallengeResultSchema);

export const challengeResultResponseSchema = v.object({
  id: uuidSchema,
  challengeId: uuidSchema,
  participantId: uuidSchema,
  rawMetrics: jsonObjectSchema,
  createdAt: v.string(),
  updatedAt: v.string(),
});
