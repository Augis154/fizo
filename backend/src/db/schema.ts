import { pgEnum, snakeCase } from "drizzle-orm/pg-core";
import { uuid, varchar, text, boolean, timestamp, jsonb, integer, numeric } from "drizzle-orm/pg-core";

const table = snakeCase.table;

export const gender = pgEnum("gender", ["male", "female"]);

export const users = table("user", {
  id: uuid().defaultRandom().primaryKey(),
  email: varchar({ length: 255 }).notNull().unique(),
  passwordHash: text().notNull(),
  name: varchar({ length: 255 }).notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const templates = table("template", {
  id: uuid().defaultRandom().primaryKey(),
  creatorId: uuid().references(() => users.id, { onDelete: "set null" }),
  title: varchar({ length: 255 }).notNull(),
  type: varchar({ length: 50 }).notNull(),
  isPublic: boolean().default(true).notNull(),
  config: jsonb().notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const spaces = table("space", {
  id: uuid().defaultRandom().primaryKey(),
  organizerId: uuid()
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  shortId: varchar({ length: 32 }).notNull().unique(),
  title: varchar({ length: 255 }).notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const challenges = table("challenge", {
  id: uuid().defaultRandom().primaryKey(),
  spaceId: uuid()
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  templateId: uuid()
    .notNull()
    .references(() => templates.id),
  title: varchar({ length: 255 }).notNull(),
  startDate: timestamp({ withTimezone: true }).notNull(),
  endDate: timestamp({ withTimezone: true }).notNull(),
  status: varchar({ length: 20 }).default("active").notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const participants = table("participant", {
  id: uuid().defaultRandom().primaryKey(),
  spaceId: uuid()
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  name: varchar({ length: 255 }).notNull(),
  age: integer(),
  gender: gender(),
  accessToken: varchar({ length: 64 }).notNull(),
  createdAt: timestamp().defaultNow().notNull(),
});

export const challenge_results = table("challenge_result", {
  id: uuid().defaultRandom().primaryKey(),
  challengeId: uuid()
    .notNull()
    .references(() => challenges.id, { onDelete: "cascade" }),
  participantId: uuid()
    .notNull()
    .references(() => participants.id, { onDelete: "cascade" }),
  rawMetrics: jsonb().notNull(),
  totalScore: numeric({ precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .$onUpdateFn(() => new Date())
    .notNull(),
});
