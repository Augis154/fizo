export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";

// Drizzle wraps driver errors in DrizzleQueryError; Bun's PostgresError carries the SQLSTATE in `errno`.
export const getPgErrorCode = (error: unknown): string | undefined => {
  let current: unknown = error;
  while (current instanceof Error) {
    const errno = (current as { errno?: unknown }).errno;
    if (typeof errno === "string") {
      return errno;
    }
    current = current.cause;
  }
  return undefined;
};
