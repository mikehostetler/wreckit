import type { Prd, WorkflowState } from "../schemas";
import { getAllowedNextStates } from "./states";
import type { ParsedIdea } from "./ideas";

export interface ValidationContext {
  hasResearchMd: boolean;
  hasPlanMd: boolean;
  prd: Prd | null;
  hasPr: boolean;
  prMerged: boolean;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function allStoriesDone(prd: Prd | null): boolean {
  if (!prd || prd.user_stories.length === 0) {
    return false;
  }
  return prd.user_stories.every((story) => story.status === "done");
}

export function hasPendingStories(prd: Prd | null): boolean {
  if (!prd) {
    return false;
  }
  return prd.user_stories.some((story) => story.status === "pending");
}

export function canEnterResearched(
  ctx: Pick<ValidationContext, "hasResearchMd">
): ValidationResult {
  if (!ctx.hasResearchMd) {
    return { valid: false, reason: "research.md does not exist" };
  }
  return { valid: true };
}

export function canEnterPlanned(
  ctx: Pick<ValidationContext, "hasPlanMd" | "prd">
): ValidationResult {
  if (!ctx.hasPlanMd) {
    return { valid: false, reason: "plan.md does not exist" };
  }
  if (!ctx.prd) {
    return { valid: false, reason: "prd.json is not valid" };
  }
  return { valid: true };
}

export function canEnterImplementing(
  ctx: Pick<ValidationContext, "prd">
): ValidationResult {
  if (!hasPendingStories(ctx.prd)) {
    return {
      valid: false,
      reason: "prd.json has no stories with status pending",
    };
  }
  return { valid: true };
}

export function canEnterInPr(
  ctx: Pick<ValidationContext, "prd" | "hasPr">
): ValidationResult {
  if (!allStoriesDone(ctx.prd)) {
    return { valid: false, reason: "not all stories are done" };
  }
  if (!ctx.hasPr) {
    return { valid: false, reason: "PR not created" };
  }
  return { valid: true };
}

export function canEnterDone(
  ctx: Pick<ValidationContext, "prMerged">
): ValidationResult {
  if (!ctx.prMerged) {
    return { valid: false, reason: "PR not merged" };
  }
  return { valid: true };
}

export function validateTransition(
  current: WorkflowState,
  target: WorkflowState,
  ctx: ValidationContext
): ValidationResult {
  const allowed = getAllowedNextStates(current);
  if (!allowed.includes(target)) {
    return {
      valid: false,
      reason: `cannot transition from ${current} to ${target}`,
    };
  }

  switch (target) {
    case "researched":
      return canEnterResearched(ctx);
    case "planned":
      return canEnterPlanned(ctx);
    case "implementing":
      return canEnterImplementing(ctx);
    case "in_pr":
      return canEnterInPr(ctx);
    case "done":
      return canEnterDone(ctx);
    default:
      return { valid: false, reason: `unknown target state: ${target}` };
  }
}

/**
 * Payload size limits for idea ingestion as specified in 001-ideas-ingestion.md
 * These limits prevent denial-of-service and cost blowups
 */
export const PAYLOAD_LIMITS = {
  MAX_IDEAS: 50,
  MAX_TITLE_LENGTH: 120,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_SUCCESS_CRITERIA_ITEMS: 20,
  MAX_TOTAL_PAYLOAD_SIZE_BYTES: 100 * 1024, // 100 KB
} as const;

/**
 * Validation error details for payload size violations
 */
export interface PayloadValidationErrorDetails {
  valid: boolean;
  errors: string[];
}

/**
 * Calculate the approximate byte size of a JSON object
 */
function calculateJsonSize(obj: unknown): number {
  return JSON.stringify(obj).length;
}

/**
 * Validate a single ParsedIdea against size limits
 */
function validateSingleIdea(idea: ParsedIdea, index: number): string[] {
  const errors: string[] = [];

  // Check title length
  if (idea.title && idea.title.length > PAYLOAD_LIMITS.MAX_TITLE_LENGTH) {
    errors.push(
      `Idea #${index + 1}: Title exceeds ${PAYLOAD_LIMITS.MAX_TITLE_LENGTH} characters ` +
        `(${idea.title.length} characters)`
    );
  }

  // Check description length
  if (idea.description && idea.description.length > PAYLOAD_LIMITS.MAX_DESCRIPTION_LENGTH) {
    errors.push(
      `Idea #${index + 1}: Description exceeds ${PAYLOAD_LIMITS.MAX_DESCRIPTION_LENGTH} characters ` +
        `(${idea.description.length} characters)`
    );
  }

  // Check success criteria count
  if (idea.successCriteria && idea.successCriteria.length > PAYLOAD_LIMITS.MAX_SUCCESS_CRITERIA_ITEMS) {
    errors.push(
      `Idea #${index + 1}: Success criteria exceeds ${PAYLOAD_LIMITS.MAX_SUCCESS_CRITERIA_ITEMS} items ` +
        `(${idea.successCriteria.length} items)`
    );
  }

  return errors;
}

/**
 * Validate an array of parsed ideas against payload size limits.
 * Returns an object with valid flag and array of error messages.
 *
 * Per the 001-ideas-ingestion.md spec:
 * - Maximum ideas per ingestion: 50
 * - Title length: 120 characters
 * - Description length: 2000 characters
 * - Success criteria items: 20
 * - Total payload size: 100 KB
 *
 * @param ideas - Array of parsed ideas to validate
 * @returns Validation result with errors array
 */
export function validatePayloadLimits(ideas: ParsedIdea[]): PayloadValidationErrorDetails {
  const errors: string[] = [];

  // Check total idea count
  if (ideas.length > PAYLOAD_LIMITS.MAX_IDEAS) {
    errors.push(
      `Too many ideas: maximum ${PAYLOAD_LIMITS.MAX_IDEAS} ideas per ingestion, got ${ideas.length}`
    );
  }

  // Validate each individual idea
  for (let i = 0; i < ideas.length; i++) {
    const ideaErrors = validateSingleIdea(ideas[i], i);
    errors.push(...ideaErrors);
  }

  // Check total payload size
  const totalSize = calculateJsonSize(ideas);
  if (totalSize > PAYLOAD_LIMITS.MAX_TOTAL_PAYLOAD_SIZE_BYTES) {
    const sizeKb = (totalSize / 1024).toFixed(2);
    const maxKb = (PAYLOAD_LIMITS.MAX_TOTAL_PAYLOAD_SIZE_BYTES / 1024).toFixed(0);
    errors.push(
      `Total payload size exceeds ${maxKb} KB ` +
        `(${sizeKb} KB / ${totalSize} bytes)`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate payload limits and throw a PayloadValidationError if invalid.
 * This is a convenience function for use in command handlers.
 *
 * @param ideas - Array of parsed ideas to validate
 * @throws PayloadValidationError if validation fails
 */
export function assertPayloadLimits(ideas: ParsedIdea[]): void {
  const result = validatePayloadLimits(ideas);
  if (!result.valid) {
    const message = "Payload validation failed:\n" + result.errors.map((e) => `  - ${e}`).join("\n");
    throw new (require("../errors").PayloadValidationError)(message);
  }
}
