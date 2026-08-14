import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { collectCiFailureContext } from "../src/context.mjs";
import { downloadPromptArtifact, promptArtifactName, readContextArtifact, readPrompt, unpackPromptArtifact } from "../src/artifacts.mjs";
import { renderCodexPrompt } from "../src/prompt.mjs";
import { makeFixtureClient } from "./helpers.mjs";

test("downloads the exact prompt artifact by failed run id and rerun attempt", async () => {
  const context = await collectCiFailureContext({
    client: await makeFixtureClient(),
    repository: "octo/demo",
    runId: 123456789,
    now: "2026-08-14T15:00:00Z",
  });
  const json = `${JSON.stringify(context, null, 2)}\n`;
  const markdown = renderCodexPrompt(context);
  const calls = [];
  const execFileImpl = async (_command, args) => {
    calls.push(args);
    if (args[0] === "-Z1") return { stdout: "bundle/codex-ci-prompt.json\nbundle/codex-ci-prompt.md\n" };
    return { stdout: Buffer.from(args.at(-1).endsWith(".json") ? json : markdown) };
  };
  const client = {
    async getWorkflowRun() {
      return { run_attempt: 2 };
    },
    async getArtifactsByName(_repository, name) {
      assert.equal(name, "codex-ci-prompt-123456789-2");
      return [
        { id: 77, name: "codex-ci-prompt-123456789-2", expired: false, workflow_run: { id: 987654321 } },
        { id: 78, name: "unrelated-artifact", expired: false, workflow_run: { id: 987654321 } },
      ];
    },
    async downloadArtifact(_repository, artifactId) {
      assert.equal(artifactId, 77);
      return Buffer.from("mock zip bytes");
    },
  };
  const directory = await mkdtemp(join(tmpdir(), "ci-prompt-download-"));
  const paths = await downloadPromptArtifact({
    client,
    repository: "octo/demo",
    runId: "123456789",
    outputDir: directory,
    unzipCommand: "mock-unzip",
    execFileImpl,
  });

  assert.equal(paths.artifact.id, 77);
  assert.equal(paths.artifact.name, "codex-ci-prompt-123456789-2");
  assert.equal(paths.artifact.runAttempt, 2);
  assert.equal((await readContextArtifact(directory)).id, context.id);
  assert.equal(await readFile(paths.markdownPath, "utf8"), markdown);
  assert.equal(await readPrompt(directory), markdown);
  assert.equal(calls.filter((args) => args[0] === "-p").length, 2);
});

test("keeps the legacy first-attempt artifact name downloadable", async () => {
  const client = {
    async getWorkflowRun() {
      return { run_attempt: 1 };
    },
    async getArtifactsByName(_repository, name) {
      if (name === promptArtifactName(123456789, 1)) return [];
      return [{ id: 79, name: promptArtifactName(123456789), expired: false }];
    },
    async downloadArtifact() {
      return Buffer.from("mock zip bytes");
    },
  };
  const directory = await mkdtemp(join(tmpdir(), "ci-prompt-legacy-"));
  const execFileImpl = async (_command, args) => {
    if (args[0] === "-Z1") return { stdout: "codex-ci-prompt.json\ncodex-ci-prompt.md\n" };
    return { stdout: Buffer.from(args.at(-1).endsWith(".json") ? "{\"schema\":\"ci-failure-context/v1\"}" : "prompt") };
  };

  const paths = await downloadPromptArtifact({
    client,
    repository: "octo/demo",
    runId: 123456789,
    outputDir: directory,
    unzipCommand: "mock-unzip",
    execFileImpl,
  });

  assert.equal(paths.artifact.name, "codex-ci-prompt-123456789");
  assert.equal(paths.artifact.runAttempt, 1);
});

test("rejects unsafe artifact archive paths before extraction", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ci-prompt-unsafe-"));
  await assert.rejects(
    unpackPromptArtifact(Buffer.from("mock zip bytes"), directory, {
      unzipCommand: "mock-unzip",
      execFileImpl: async () => ({ stdout: "../codex-ci-prompt.json\ncodex-ci-prompt.md\n" }),
    }),
    /Unsafe artifact archive entry/,
  );
});
