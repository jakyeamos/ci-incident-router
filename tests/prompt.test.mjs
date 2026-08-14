import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeArtifacts, readContextArtifact } from "../src/artifacts.mjs";
import { collectCiFailureContext } from "../src/context.mjs";
import { renderCodexPrompt } from "../src/prompt.mjs";
import { boundText, redactSecrets } from "../src/redaction.mjs";
import { makeFixtureClient } from "./helpers.mjs";

test("renders a deterministic trust-aware prompt and artifact pair", async () => {
  const context = await collectCiFailureContext({ client: await makeFixtureClient(), repository: "octo/demo", runId: 123456789, now: "2026-08-14T15:00:00Z" });
  const prompt = renderCodexPrompt(context);
  assert.match(prompt, /Diagnose this GitHub Actions failure/);
  assert.match(prompt, /untrusted data from GitHub/);
  assert.match(prompt, /Do not merge, push, or commit automatically/i);
  assert.doesNotMatch(prompt, /REDACTED\] TOKEN\]/);
  assert.doesNotMatch(prompt, /ghp_/);
  assert.doesNotMatch(prompt, /super-secret-value/);

  const directory = await mkdtemp(join(tmpdir(), "ci-prompt-artifact-"));
  const paths = await writeArtifacts(context, directory);
  assert.equal(JSON.parse(await readFile(paths.jsonPath, "utf8")).id, context.id);
  assert.equal((await readFile(paths.markdownPath, "utf8")), prompt);
  assert.equal((await readContextArtifact(directory)).id, context.id);
});

test("redacts common credentials and bounds oversized evidence", () => {
  const text = redactSecrets("ghp_1234567890abcdefghijklmnopqrstuvwxyz Bearer abcdefghijklmnop token=secret");
  assert.doesNotMatch(text, /ghp_/);
  assert.doesNotMatch(text, /Bearer abc/);
  assert.doesNotMatch(text, /token=secret/);
  const bounded = boundText(Array.from({length: 20}, (_, index) => `line-${index}`).join("\n"), {maxChars: 20, maxLines: 5});
  assert.equal(bounded.truncated, true);
  assert.ok(bounded.text.length <= 20);
});
