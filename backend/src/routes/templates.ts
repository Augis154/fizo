import { Hono } from "hono";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { challenges, templates } from "../db";
import { eq, or } from "drizzle-orm/sql/expressions/conditions";
import { count } from "drizzle-orm/sql/functions/aggregate";
import { idParamSchema, createTemplateSchema, updateTemplateSchema, templateResponseSchema } from "shared";
import { bearerSecurity, loadOwnedTemplate, loadVisibleTemplate, requireOrganizer } from "../auth";

const app = new Hono();

app.get(
  "/",
  describeRoute({
    operationId: "Get Templates",
    tags: ["Templates"],
    description: "Get all public templates plus the caller's own private templates. Admins see all templates.",
    security: bearerSecurity,
    responses: {
      200: {
        description: "A list of templates",
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
    const { userId, isAdmin } = c.var.organizer;
    const visibleTemplates = await db
      .select()
      .from(templates)
      .where(isAdmin ? undefined : or(eq(templates.isPublic, true), eq(templates.creatorId, userId)));
    return c.json(visibleTemplates, 200);
  }
);

app.post(
  "/",
  describeRoute({
    operationId: "Create Template",
    description: "Create a new template owned by the caller",
    tags: ["Templates"],
    security: bearerSecurity,
    responses: {
      201: {
        description: "Template created successfully",
        content: {
          "application/json": {
            schema: resolver(templateResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "Organizer role required" },
    },
  }),
  requireOrganizer,
  validator("json", createTemplateSchema),
  async (c) => {
    const body = c.req.valid("json");

    const [created] = await db
      .insert(templates)
      .values({ ...body, creatorId: c.var.organizer.userId })
      .returning();

    return c.json(created, 201);
  }
);

app.get(
  "/:id",
  describeRoute({
    operationId: "Get Template",
    tags: ["Templates"],
    description: "Get a template by its ID. Private templates are only visible to their creator.",
    security: bearerSecurity,
    responses: {
      200: {
        description: "Template found",
        content: {
          "application/json": {
            schema: resolver(templateResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      404: { description: "Template not found" },
    },
  }),
  requireOrganizer,
  validator("param", idParamSchema),
  async (c) => {
    const template = await loadVisibleTemplate(c.req.valid("param").id, c.var.organizer);
    return c.json(template, 200);
  }
);

app.patch(
  "/:id",
  describeRoute({
    operationId: "Update Template",
    tags: ["Templates"],
    description: "Update a template owned by the caller",
    security: bearerSecurity,
    responses: {
      200: {
        description: "Template updated successfully",
        content: {
          "application/json": {
            schema: resolver(templateResponseSchema),
          },
        },
      },
      401: { description: "Not authenticated" },
      403: { description: "You do not own this template" },
      404: { description: "Template not found" },
    },
  }),
  requireOrganizer,
  validator("param", idParamSchema),
  validator("json", updateTemplateSchema),
  async (c) => {
    const template = await loadOwnedTemplate(c.req.valid("param").id, c.var.organizer);
    const updatedData = c.req.valid("json");
    if (Object.keys(updatedData).length === 0) {
      return c.json(template, 200);
    }

    const [updated] = await db.update(templates).set(updatedData).where(eq(templates.id, template.id)).returning();
    return c.json(updated, 200);
  }
);

app.delete(
  "/:id",
  describeRoute({
    operationId: "Delete Template",
    tags: ["Templates"],
    description: "Delete a template owned by the caller",
    security: bearerSecurity,
    responses: {
      204: { description: "Template deleted successfully" },
      401: { description: "Not authenticated" },
      403: { description: "You do not own this template" },
      404: { description: "Template not found" },
      409: { description: "Template is used by one or more challenges" },
    },
  }),
  requireOrganizer,
  validator("param", idParamSchema),
  async (c) => {
    const template = await loadOwnedTemplate(c.req.valid("param").id, c.var.organizer);

    const [usage] = await db.select({ count: count() }).from(challenges).where(eq(challenges.templateId, template.id));
    if (usage.count > 0) {
      return c.json({ error: `Template is used by ${usage.count} challenge(s) and cannot be deleted` }, 409);
    }

    await db.delete(templates).where(eq(templates.id, template.id));
    return c.body(null, 204);
  }
);

export default app;
