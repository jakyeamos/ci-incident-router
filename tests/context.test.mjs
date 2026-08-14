import assert from "node:assert/strict";
import test from "node:test";
import { collectCiFailureContext, NonActionableRunError } from "../src/context.mjs";
import { makeFixtureClient } from "./helpers.mjs";

test("normalizes an actionable run, filters successful matrix jobs, and redacts evidence", async () => {
  const client = await makeFixtureClient();
  const first = await collectCiFailureContext({ client, repository: "octo/demo", runId: 123456789, now: "2026-08-14T15:00:00Z" });
  const second = await collectCiFailureContext({ client, repository: "octo/demo", runId: 123456789, now: "2026-08-14T16:00:00Z" });

  assert.equal(first.schema, "ci-failure-context/v1");
  assert.equal(first.failures.length, 1);
  assert.equal(first.failures[0].name, "unit-tests (node-20)");
  assert.match(first.failures[0].log.excerpt, /expected true/);
  assert.doesNotMatch(first.failures[0].log.excerpt, /super-secret-value/);
  assert.doesNotMatch(first.changedFiles[0].patch, /ghp_/);
  assert.equal(first.safety.forkDiagnosisOnly, false);
  assert.equal(first.id, second.id);
  assert.ok(first.provenance.some((item) => item.name === "job-log"));
});

test("keeps rerun context ids distinguishable without persistent state", async () => {
  const first = await collectCiFailureContext({
    client: await makeFixtureClient(),
    repository: "octo/demo",
    runId: 123456789,
  });
  const rerun = await collectCiFailureContext({
    client: await makeFixtureClient({runOverride: {id: 123456790}}),
    repository: "octo/demo",
    runId: 123456790,
  });
  assert.notEqual(first.id, rerun.id);
});

test("accepts cancelled runs and preserves the absence of a pull request", async () => {
  const client = await makeFixtureClient({ runOverride: { conclusion: "cancelled", pull_requests: [] } });
  const context = await collectCiFailureContext({ client, repository: "octo/demo", runId: 123456790 });
  assert.equal(context.run.conclusion, "cancelled");
  assert.equal(context.pullRequests.length, 0);
  assert.ok(context.missingData.some((note) => note.includes("not associated")));
});

test("does not create context for successful or skipped runs", async () => {
  for (const conclusion of ["success", "skipped", null]) {
    const client = await makeFixtureClient({ runOverride: { conclusion } });
    await assert.rejects(
      collectCiFailureContext({ client, repository: "octo/demo", runId: 123456791 }),
      (error) => error instanceof NonActionableRunError,
    );
  }
});

test("records missing logs rather than inventing evidence", async () => {
  const client = await makeFixtureClient({ logResult: { status: "unavailable", note: "log not ready" } });
  const context = await collectCiFailureContext({ client, repository: "octo/demo", runId: 123456792 });
  assert.equal(context.failures[0].log.status, "unavailable");
  assert.equal(context.failures[0].log.excerpt, null);
  assert.ok(context.missingData.some((note) => note.includes("Logs unavailable")));
});

test("records unavailable pull-request metadata rather than fabricating it", async () => {
  const client = await makeFixtureClient();
  client.getPullRequest = async () => {
    throw new Error("permission denied");
  };
  const context = await collectCiFailureContext({client, repository: "octo/demo", runId: 123456794});
  assert.equal(context.pullRequests.length, 0);
  assert.ok(context.missingData.some((note) => note.includes("permission denied")));
});

test("marks fork pull requests diagnosis-only", async () => {
  const client = await makeFixtureClient();
  client.getPullRequest = async () => {
    const pull = await (await import("./helpers.mjs")).fixtureJson("pull-request.json");
    return {...pull, head: {...pull.head, repo: {full_name: "contributor/demo"}}};
  };
  const context = await collectCiFailureContext({ client, repository: "octo/demo", runId: 123456793 });
  assert.equal(context.safety.forkDiagnosisOnly, true);
  assert.equal(context.pullRequests[0].fork, true);
});
