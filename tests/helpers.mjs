import { readFile } from "node:fs/promises";
import { join } from "node:path";

const fixtureRoot = new URL("./fixtures/", import.meta.url).pathname;

export async function fixtureJson(name) {
  return JSON.parse(await readFile(join(fixtureRoot, name), "utf8"));
}

export async function fixtureText(name) {
  return readFile(join(fixtureRoot, name), "utf8");
}

export async function makeFixtureClient({ runOverride = {}, logResult = { status: "ok" } } = {}) {
  const run = {...await fixtureJson("workflow-run.json"), ...runOverride};
  const jobs = await fixtureJson("jobs.json");
  const pullRequest = await fixtureJson("pull-request.json");
  const files = await fixtureJson("pull-files.json");
  const logText = await fixtureText("job.log");
  return {
    async getWorkflowRun() { return run; },
    async getJobs() { return jobs.jobs; },
    async getJobLogs() { return logResult.status === "ok" ? { status: "ok", text: logText } : logResult; },
    async getPullRequest() { return pullRequest; },
    async getPullRequestFiles() { return files; },
  };
}
