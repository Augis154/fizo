import { sql } from "drizzle-orm";

import { participants } from "./db";

/**
 * Within a space a participant is identified by name alone — they join through a link rather than
 * registering, and rejoin by typing the same name again. Matching therefore ignores case, and the
 * same comparison backs both the rejoin lookup and the "name already taken" check, so that
 * "Jonas" and "jonas" can never become two participants that rejoin ambiguously.
 */
export const nameMatches = (name: string) => sql`lower(${participants.name}) = lower(${name})`;
