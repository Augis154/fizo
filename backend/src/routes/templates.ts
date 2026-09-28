import { Hono } from "hono";

import * as v from "valibot";
import { validator, resolver, describeRoute } from "hono-openapi";

import db, { templates } from "../db";
import { eq } from "drizzle-orm/sql/expressions/conditions";

const uuidSchema = v.pipe(v.string(), v.uuid());

const idParamSchema = v.object({
  id: uuidSchema,
});

const postTemplatesSchema = v.object({
  creatorId: uuidSchema,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(255)),
  type: v.pipe(v.string(), v.minLength(1), v.maxLength(50)),
  isPublic: v.boolean(),
  config: v.object({}),
});

const patchTemplatesSchema = v.object({
  title: v.optional(v.pipe(v.string(), v.minLength(1), v.maxLength(255))),
});

export const templateResponseSchema = v.object({
  id: uuidSchema,
  creatorId: uuidSchema,
  title: v.string(),
  type: v.string(),
  isPublic: v.boolean(),
  config: v.object({}),
  createdAt: v.string(),
});

const app = new Hono();

app.get(
  "/",
  describeRoute({
    operationId: "Get Templates",
    tags: ["Templates"],
    description: "Get all templates",
    responses: {
      200: {
        description: "A list of templates",
        content: {
          "application/json": {
            schema: resolver(v.array(templateResponseSchema)),
          },
        },
      },
    },
  }),
  async (c) => {
    const allTemplates = await db.select().from(templates);
    return c.json(allTemplates, 200);
  }
);

app.post(
  "/",
  describeRoute({
    operationId: "Create Template",
    description: "Create a new template",
    tags: ["Templates"],
    responses: {
      201: {
        description: "Template created successfully",
      },
      500: {
        description: "Failed to create template",
      },
    },
  }),
  validator("json", postTemplatesSchema),
  async (c) => {
    const body = c.req.valid("json");

    try {
      await db.insert(templates).values({
        creatorId: body.creatorId,
        title: body.title,
        type: body.type,
        isPublic: body.isPublic,
        config: body.config,
      });
    } catch (error) {
      return c.json({ error: "Failed to create template", details: error }, 500);
    }

    return c.body(null, 201);
  }
);

app.get(
  "/:id",
  describeRoute({
    operationId: "Get Template",
    tags: ["Templates"],
    description: "Get a template by its ID",
    responses: {
      200: {
        description: "Template found",
        content: {
          "application/json": {
            schema: resolver(templateResponseSchema),
          },
        },
      },
    },
  }),
  validator("param", idParamSchema),
  async (c) => {
    const templateId = c.req.param("id");

    const templateList = await db.select().from(templates).where(eq(templates.id, templateId));
    if (!templateList || templateList.length === 0) {
      return c.body(null, 404);
    }

    return c.json(templateList[0], 200);
  }
);

app.patch(
  "/:id",
  describeRoute({
    operationId: "Update Template",
    tags: ["Templates"],
    description: "Update a template by its ID",
    responses: {
      200: {
        description: "Template updated successfully",
        content: {
          "application/json": {
            schema: resolver(templateResponseSchema),
          },
        },
      },
      404: {
        description: "Template not found",
      },
    },
  }),
  validator("param", idParamSchema),
  validator("json", patchTemplatesSchema),
  async (c) => {
    const templateId = c.req.param("id");
    const updatedData = c.req.valid("json");

    const updatedTemplate = await db.update(templates).set(updatedData).where(eq(templates.id, templateId)).returning();

    if (!updatedTemplate || updatedTemplate.length === 0) {
      return c.body(null, 404);
    }

    return c.json(updatedTemplate[0], 200);
  }
);

app.delete(
  "/:id",
  describeRoute({
    operationId: "Delete Template",
    tags: ["Templates"],
    description: "Delete a template by its ID",
    responses: {
      204: {
        description: "Template deleted successfully",
      },
      404: {
        description: "Template not found",
      },
    },
  }),
  validator("param", idParamSchema),
  async (c) => {
    const templateId = c.req.param("id");

    const deletedTemplate = await db.delete(templates).where(eq(templates.id, templateId)).returning();

    if (!deletedTemplate || deletedTemplate.length === 0) {
      return c.body(null, 404);
    }

    return c.body(null, 204);
  }
);

export default app;
