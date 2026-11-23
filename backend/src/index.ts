import { Hono } from "hono";
import { openAPIRouteHandler } from "hono-openapi";
import { swaggerUI } from "@hono/swagger-ui";

import usersRoutes from "./routes/users";
import templatesRoutes from "./routes/templates";
import spacesRoutes from "./routes/spaces";
import challengesRoutes from "./routes/challenges";
import challengeResultsRoutes from "./routes/challenge_results";

const routes = new Hono();

routes.route("/users", usersRoutes);
routes.route("/templates", templatesRoutes);
routes.route("/spaces", spacesRoutes);
routes.route("/challenges", challengesRoutes);
routes.route("/challenge-results", challengeResultsRoutes);

routes.get(
  "/openapi",
  openAPIRouteHandler(routes, {
    documentation: {
      info: {
        title: "Fizo API",
        version: "1.0.0",
      },
      servers: [{ url: "http://localhost:3000", description: "Local Server" }],
    },
  })
);

routes.get("/swagger", swaggerUI({ url: "/openapi" }));

export type ApiType = typeof routes;

export default routes;
