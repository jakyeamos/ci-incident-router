const ANSI_ESCAPE = /\u001b\[[0-?]*[ -/]*[@-~]/g;

const SECRET_PATTERNS = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]"],
  [/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g, "[REDACTED TOKEN]"],
  [/\bxox[baprs]-[A-Za-z0-9-]{12,}\b/g, "[REDACTED TOKEN]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED ACCESS KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [REDACTED TOKEN]"],
  [/(\b(?:token|password|passwd|secret|api[_-]?key|private[_-]?key)\s*[:=]\s*)(?!\[REDACTED)([^\s,;]+)/gi, "$1[REDACTED]"],
];

export function redactSecrets(value) {
  let text = String(value ?? "").replace(ANSI_ESCAPE, "");
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

export function boundText(value, { maxChars, maxLines } = {}) {
  const redacted = redactSecrets(value);
  const inputLines = redacted.split(/\r?\n/);
  let lines = inputLines;
  let truncated = false;

  if (Number.isInteger(maxLines) && maxLines > 0 && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    truncated = true;
  }

  let text = lines.join("\n");
  if (Number.isInteger(maxChars) && maxChars > 0 && text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }

  return {
    text,
    lineCount: inputLines.length,
    truncated,
  };
}

export function extractFailureSnippet(value, {
  maxChars,
  maxLines,
  contextLines = 30,
} = {}) {
  const text = redactSecrets(value);
  const lines = text.split(/\r?\n/);
  const marker = /\b(error|fail(?:ed|ure)?|traceback|exception|assert(?:ion)?|panic|fatal|timeout|segmentation fault)\b/i;
  const markerIndex = lines.findIndex((line) => marker.test(line));
  const start = markerIndex < 0 ? Math.max(0, lines.length - contextLines) : Math.max(0, markerIndex - contextLines);
  const end = markerIndex < 0 ? lines.length : Math.min(lines.length, markerIndex + contextLines + 1);
  return boundText(lines.slice(start, end).join("\n"), { maxChars, maxLines });
}

export function boundPatch(value, maxChars = 4_000) {
  return boundText(value ?? "", { maxChars, maxLines: 200 });
}
