import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { openAPIRouteHandler } from "hono-openapi";
import { swaggerUI } from "@hono/swagger-ui";

import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import templatesRoutes from "./routes/templates";
import spacesRoutes from "./routes/spaces";
import challengesRoutes from "./routes/challenges";
import challengeResultsRoutes from "./routes/challenge_results";
import participantsRoutes from "./routes/participants";
import { getPgErrorCode, PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION } from "./db/errors";

const app = new Hono();

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }

  const pgErrorCode = getPgErrorCode(err);
  if (pgErrorCode === PG_UNIQUE_VIOLATION) {
    return c.json({ error: "Resource already exists" }, 409);
  }
  if (pgErrorCode === PG_FOREIGN_KEY_VIOLATION) {
    return c.json({ error: "Resource is referenced by other records" }, 409);
  }

  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

const routes = app
  .route("/auth", authRoutes)
  .route("/users", usersRoutes)
  .route("/templates", templatesRoutes)
  .route("/spaces", spacesRoutes)
  .route("/challenges", challengesRoutes)
  .route("/challenge-results", challengeResultsRoutes)
  .route("/participants", participantsRoutes);

app.get(
  "/openapi",
  openAPIRouteHandler(app, {
    documentation: {
      info: {
        title: "Fizo API",
        version: "1.0.0",
      },
      servers: [{ url: "http://localhost:3000", description: "Local Server" }],
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
  })
);

app.get("/swagger", swaggerUI({ url: "/openapi" }));

export type ApiType = typeof routes;

export default app;
