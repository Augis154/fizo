/**
 * A minimal History API router. This is a plain Vite SPA rather than SvelteKit, and Cloudflare
 * serves `index.html` for unknown paths (`not_found_handling: "single-page-application"`), so real
 * paths work in production and join links stay shareable.
 */

const read = () => ({ path: window.location.pathname, search: window.location.search });

const current = $state(read());

const sync = () => Object.assign(current, read());

window.addEventListener("popstate", sync);

export const location = {
  get path() {
    return current.path;
  },
  get query() {
    return new URLSearchParams(current.search);
  },
};

export const navigate = (path: string, { replace = false } = {}) => {
  if (path === current.path + current.search) return;
  history[replace ? "replaceState" : "pushState"]({}, "", path);
  sync();
  window.scrollTo(0, 0);
};

/**
 * Matches a path against a `/challenge/:id` style pattern, returning the captured params or `null`.
 * Patterns and paths are compared segment by segment, so there is no wildcard support.
 */
export const matchRoute = (pattern: string, path: string): Record<string, string> | null => {
  const patternParts = pattern.split("/").filter(Boolean);
  const pathParts = path.split("/").filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (const [index, part] of patternParts.entries()) {
    const value = pathParts[index];
    if (part.startsWith(":")) {
      params[part.slice(1)] = decodeURIComponent(value);
    } else if (part !== value) {
      return null;
    }
  }
  return params;
};
