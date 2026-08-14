import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createGithubClient } from "../src/github.mjs";
import { parseGithubRepository, parseRunId } from "../src/repository.mjs";

test("GitHub client preserves query parameters and sends token auth", async () => {
  const calls = [];
  const client = createGithubClient({
    token: "test-token",
    fetchImpl: async (url, init) => {
      calls.push({url, init});
      return new Response(JSON.stringify({jobs: []}), {status: 200, headers: {"content-type": "application/json"}});
    },
  });
  await client.getJobs("octo/demo", 123);
  assert.match(calls[0].url, /actions\/runs\/123\/jobs\?per_page=100$/);
  assert.equal(calls[0].init.headers.authorization, "Bearer test-token");
});

test("GitHub client lists run artifacts and downloads the selected archive", async () => {
  const calls = [];
  const responses = [
    new Response(JSON.stringify({artifacts: [{id: 77, name: "codex-ci-prompt-123", expired: false}]}), {status: 200, headers: {"content-type": "application/json"}}),
    new Response(new Uint8Array([80, 75, 3, 4]), {status: 200, headers: {"content-type": "application/zip"}}),
  ];
  const client = createGithubClient({
    token: "test-token",
    fetchImpl: async (url, init) => {
      calls.push({url, init});
      return responses.shift();
    },
  });
  const artifacts = await client.getRunArtifacts("octo/demo", 123);
  const archive = await client.downloadArtifact("octo/demo", artifacts[0].id);
  assert.equal(artifacts[0].name, "codex-ci-prompt-123");
  assert.deepEqual([...archive], [80, 75, 3, 4]);
  assert.match(calls[0].url, /actions\/runs\/123\/artifacts\?per_page=100$/);
  assert.match(calls[1].url, /actions\/artifacts\/77\/zip$/);
  assert.equal(calls[1].init.headers.authorization, "Bearer test-token");
});

test("GitHub client searches repository artifacts by exact name", async () => {
  const calls = [];
  const client = createGithubClient({
    token: "test-token",
    fetchImpl: async (url, init) => {
      calls.push({url, init});
      return new Response(JSON.stringify({artifacts: [{id: 88, name: "codex-ci-prompt-123", expired: false}]}), {status: 200, headers: {"content-type": "application/json"}});
    },
  });

  const artifacts = await client.getArtifactsByName("octo/demo", "codex-ci-prompt-123");

  assert.equal(artifacts[0].id, 88);
  assert.match(calls[0].url, /actions\/artifacts\?name=codex-ci-prompt-123&per_page=100$/);
  assert.equal(calls[0].init.headers.authorization, "Bearer test-token");
});

test("repository and run URL parsing handles GitHub URL forms", () => {
  assert.equal(parseGithubRepository("git@github.com:octo/demo.git"), "octo/demo");
  assert.equal(parseGithubRepository("https://github.com/octo/demo.git"), "octo/demo");
  assert.equal(parseRunId("https://github.com/octo/demo/actions/runs/123"), "123");
});

test("workflow template has the required provider and safety boundaries", async () => {
  const workflow = await readFile(new URL("../.github/workflow-templates/codex-ci-prompt.yml", import.meta.url), "utf8");
  const action = await readFile(new URL("../action.yml", import.meta.url), "utf8");
  const emitter = await readFile(new URL("../scripts/emit-workflow-prompt.mjs", import.meta.url), "utf8");
  assert.match(workflow, /workflow_run:/);
  assert.match(workflow, /actions: write/);
  assert.match(workflow, /pull-requests: read/);
  assert.doesNotMatch(workflow, /actions\/checkout/);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /dangerously-bypass/);
  assert.match(action, /CODEX_CI_TOKEN/);
  assert.match(emitter, /process\.env\.CODEX_CI_TOKEN/);
});
