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

const routes = new Hono();

routes.onError((err, c) => {
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

routes.route("/auth", authRoutes);
routes.route("/users", usersRoutes);
routes.route("/templates", templatesRoutes);
routes.route("/spaces", spacesRoutes);
routes.route("/challenges", challengesRoutes);
routes.route("/challenge-results", challengeResultsRoutes);
routes.route("/participants", participantsRoutes);

routes.get(
  "/openapi",
  openAPIRouteHandler(routes, {
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

routes.get("/swagger", swaggerUI({ url: "/openapi" }));

export type ApiType = typeof routes;

export default routes;
