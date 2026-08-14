import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { runCli } from "../bin/codex-ci.mjs";
import { collectCiFailureContext } from "../src/context.mjs";
import { writeArtifacts } from "../src/artifacts.mjs";
import { makeFixtureClient } from "./helpers.mjs";

const root = new URL("../", import.meta.url).pathname;
const cli = join(root, "bin/codex-ci.mjs");

test("consume reads an artifact directory and prints the prompt", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ci-prompt-cli-"));
  const context = await collectCiFailureContext({ client: await makeFixtureClient(), repository: "octo/demo", runId: 123456789, now: "2026-08-14T15:00:00Z" });
  await writeArtifacts(context, directory);
  const result = spawnSync(process.execPath, [cli, "consume", "--input", directory], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Diagnose this GitHub Actions failure/);
});

test("prompt command builds artifacts against mocked GitHub responses", async () => {
  const client = await makeFixtureClient();
  const directory = await mkdtemp(join(tmpdir(), "ci-prompt-cli-api-"));
  await runCli({
    argv: [
      "prompt",
      "--repo",
      "octo/demo",
      "--run",
      "https://github.com/octo/demo/actions/runs/123456789",
      "--output-dir",
      directory,
    ],
    clientFactory: () => client,
  });
  assert.match(await readFile(join(directory, "codex-ci-prompt.md"), "utf8"), /Diagnose this GitHub Actions failure/);
});

test("handoff defaults to preview and advertises read-only Codex", async () => {
  const directory = await mkdtemp(join(tmpdir(), "ci-prompt-handoff-"));
  const prompt = join(directory, "prompt.md");
  await writeFile(prompt, "# test prompt\n", "utf8");
  const result = spawnSync(process.execPath, [cli, "handoff", "--prompt", prompt, "--repo", root], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--sandbox read-only/);
  assert.match(result.stdout, /# test prompt/);
});
