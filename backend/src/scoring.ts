import { HTTPException } from "hono/http-exception";
import { eq } from "drizzle-orm/sql/expressions/conditions";

import { parseRawMetricsFor, safeParseTemplateConfig, scoreResult, type RawMetrics, type TemplateConfig } from "shared";

import db, { challenges, participants, templates } from "./db";

/**
 * Scoring on the write path. The browser computes the same numbers with the same `shared` code for
 * its live preview, but only what is stored here counts.
 */

type Challenge = typeof challenges.$inferSelect;

/**
 * Reads the config of the template a challenge uses. Configs predating the current schema are
 * rejected loudly rather than scored as zero.
 */
export const loadChallengeConfig = async (challenge: Challenge): Promise<TemplateConfig> => {
  const [template] = await db
    .select({ config: templates.config })
    .from(templates)
    .where(eq(templates.id, challenge.templateId));
  if (!template) {
    throw new HTTPException(404, { message: "Challenge template not found" });
  }

  const parsed = safeParseTemplateConfig(template.config);
  if (!parsed.success) {
    throw new HTTPException(500, { message: "This challenge's template has an invalid configuration" });
  }
  return parsed.output;
};

/**
 * Validates a submission against the challenge's template and scores it. The returned object is
 * spread straight into an insert or update of `challenge_result`.
 */
export const scoreSubmission = async (challenge: Challenge, participantId: string, rawMetrics: RawMetrics) => {
  const config = await loadChallengeConfig(challenge);

  const [participant] = await db
    .select({ age: participants.age, gender: participants.gender })
    .from(participants)
    .where(eq(participants.id, participantId));
  if (!participant) {
    throw new HTTPException(404, { message: "Participant not found" });
  }

  let metrics: RawMetrics;
  try {
    metrics = parseRawMetricsFor(config, rawMetrics);
  } catch (error) {
    throw new HTTPException(400, { message: error instanceof Error ? error.message : "Invalid result" });
  }

  const scores = scoreResult(config, metrics, participant);

  return { rawMetrics: metrics, scores, totalScore: scores.total.toFixed(2) };
};
