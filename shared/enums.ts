/** Shared enums live apart from the request/response schemas so that `template.ts`, `scoring.ts`
 * and `schemas.ts` can all depend on them without forming an import cycle. */

/**
 * A const object rather than a TS `enum`, so the type is the plain `"male" | "female"` union. A TS
 * enum is nominal: values read out of the database or off the wire are strings and would not be
 * assignable to it, forcing a cast at every boundary.
 */
export const ParticipantGender = {
  Male: "male",
  Female: "female",
  // Other: "other",
} as const;

export type ParticipantGender = (typeof ParticipantGender)[keyof typeof ParticipantGender];
