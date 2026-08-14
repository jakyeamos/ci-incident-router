export const CONTEXT_SCHEMA = "ci-failure-context/v1";

export const ACTIONABLE_CONCLUSIONS = new Set([
  "failure",
  "cancelled",
  "timed_out",
  "action_required",
]);

export const FAILURE_CONCLUSIONS = new Set([
  "failure",
  "error",
  "cancelled",
  "timed_out",
  "action_required",
]);

export const DEFAULT_MAX_LOG_CHARS = 12_000;
export const DEFAULT_MAX_LOG_LINES = 160;
export const DEFAULT_CONTEXT_LINES = 30;
export const DEFAULT_MAX_PATCH_CHARS = 4_000;
export const DEFAULT_MAX_FILES = 100;
