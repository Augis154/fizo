import { navigate } from "./router.svelte";

/**
 * Every route in the app, in one place. Navigation goes through `href`/`goto` and the `<Link>`
 * component, passing a route from `ROUTES` rather than a literal path — so a renamed or moved route
 * is a type error at each call site instead of a link that silently 404s, and "go to definition"
 * from a call site lands here.
 *
 * Components are wired to these routes in `App.svelte` rather than here, so that pages can import
 * this module without a circular import.
 */

/**
 * Brands a route so it can only come from `ROUTES`. The symbol is never exported, so no code
 * outside this module can produce a value of type `Route` — an ad-hoc `{ path: "/somewhere" }`
 * cannot be passed to `goto`, `href` or `<Link>` to sidestep the config.
 *
 * It exists only in the type system; `defineRoute` asserts it rather than setting it at runtime.
 */
declare const routeBrand: unique symbol;

export type Route<P extends string = string> = {
  readonly path: P;
  readonly requiresSession?: boolean;
  readonly [routeBrand]: true;
};

const defineRoute = <const P extends string>(path: P, options: { requiresSession?: boolean } = {}): Route<P> =>
  ({ path, ...options }) as Route<P>;

export const ROUTES = {
  home: defineRoute("/"),
  join: defineRoute("/join/:shortId"),
  space: defineRoute("/space", { requiresSession: true }),
  challenge: defineRoute("/challenge/:id", { requiresSession: true }),
  leaderboard: defineRoute("/challenge/:id/board", { requiresSession: true }),
  myResults: defineRoute("/me", { requiresSession: true }),
};

export type RouteName = keyof typeof ROUTES;

/** Pulls `"id"` out of `"/challenge/:id/board"`, so params are checked at compile time. */
type PathParams<P extends string> = P extends `${string}:${infer Tail}`
  ? Tail extends `${infer Param}/${infer Rest}`
    ? Param | PathParams<Rest>
    : Tail
  : never;

export type ParamsOf<R extends Route> = PathParams<R["path"]>;

/** A route with no `:params` takes no second argument; one with params requires them all. */
type HrefArgs<R extends Route> = [ParamsOf<R>] extends [never] ? [] : [params: Record<ParamsOf<R>, string>];

/**
 * Fills a path's `:params`. Takes the path rather than a route so that `<Link>`, which holds its
 * params in a prop, can reuse it; prefer `href`, `goto` or `<Link>` at call sites.
 */
export const buildPath = (path: string, params: Record<string, string> = {}): string =>
  path
    .split("/")
    .map((segment) => {
      if (!segment.startsWith(":")) return segment;
      const key = segment.slice(1);
      const value = params[key];
      if (value === undefined) {
        throw new Error(`Missing "${key}" param for path "${path}"`);
      }
      return encodeURIComponent(value);
    })
    .join("/");

/** The URL for a route, with its params checked at compile time: `href(ROUTES.challenge, { id })`. */
export const href = <R extends Route>(route: R, ...args: HrefArgs<R>): string =>
  buildPath(route.path, args[0] as Record<string, string> | undefined);

/** Navigates to a route. The client-side equivalent of following its link. */
export const goto = <R extends Route>(route: R, ...args: HrefArgs<R>) => {
  navigate(href(route, ...args));
};

/** The route table in match order, used by the router outlet. */
export const routeEntries = Object.entries(ROUTES) as [RouteName, Route][];
