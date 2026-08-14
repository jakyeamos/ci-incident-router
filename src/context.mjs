import { createHash } from "node:crypto";
import {
  ACTIONABLE_CONCLUSIONS,
  CONTEXT_SCHEMA,
  DEFAULT_CONTEXT_LINES,
  DEFAULT_MAX_FILES,
  DEFAULT_MAX_LOG_CHARS,
  DEFAULT_MAX_LOG_LINES,
  DEFAULT_MAX_PATCH_CHARS,
  FAILURE_CONCLUSIONS,
} from "./constants.mjs";
import { boundPatch, extractFailureSnippet } from "./redaction.mjs";

export class NonActionableRunError extends Error {
  constructor(conclusion) {
    super(`Workflow run conclusion '${conclusion || "unknown"}' does not require a Codex prompt.`);
    this.name = "NonActionableRunError";
    this.conclusion = conclusion || null;
  }
}

export function normalizeConclusion(value) {
  return String(value ?? "").trim().toLowerCase() || null;
}

export function isActionableConclusion(value) {
  return ACTIONABLE_CONCLUSIONS.has(normalizeConclusion(value));
}

export function isFailureJob(job) {
  const conclusion = normalizeConclusion(job?.conclusion);
  const status = normalizeConclusion(job?.status);
  return FAILURE_CONCLUSIONS.has(conclusion) || FAILURE_CONCLUSIONS.has(status);
}

export function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function runUrl(repository, run) {
  return run?.html_url || run?.url || `https://github.com/${repository}/actions/runs/${run?.id}`;
}

function normalizePullRequest(repository, pull) {
  const headRepository = pull?.head?.repo?.full_name ?? null;
  return {
    number: pull?.number ?? null,
    title: pull?.title ?? null,
    url: pull?.html_url ?? pull?.url ?? null,
    baseBranch: pull?.base?.ref ?? null,
    headBranch: pull?.head?.ref ?? null,
    headSha: pull?.head?.sha ?? null,
    headRepository,
    sameRepository: headRepository ? headRepository === repository : null,
    fork: headRepository ? headRepository !== repository : null,
  };
}

function normalizeStep(step) {
  return {
    name: step?.name ?? "unknown step",
    status: normalizeConclusion(step?.status),
    conclusion: normalizeConclusion(step?.conclusion),
    startedAt: step?.started_at ?? null,
    completedAt: step?.completed_at ?? null,
  };
}

function normalizeJob(job, logResult, options) {
  let log;
  if (logResult?.status === "ok") {
    const excerpt = extractFailureSnippet(logResult.text, {
      maxChars: options.maxLogChars,
      maxLines: options.maxLogLines,
      contextLines: options.contextLines,
    });
    log = {
      status: "ok",
      excerpt: excerpt.text,
      lineCount: excerpt.lineCount,
      truncated: excerpt.truncated,
      note: null,
    };
  } else {
    log = {
      status: logResult?.status ?? "unavailable",
      excerpt: null,
      lineCount: null,
      truncated: false,
      note: logResult?.note ?? "Logs were not available.",
    };
  }

  return {
    id: job?.id ?? null,
    name: job?.name ?? "unknown job",
    url: job?.html_url ?? null,
    status: normalizeConclusion(job?.status),
    conclusion: normalizeConclusion(job?.conclusion),
    startedAt: job?.started_at ?? null,
    completedAt: job?.completed_at ?? null,
    failedSteps: Array.isArray(job?.steps)
      ? job.steps.filter((step) => FAILURE_CONCLUSIONS.has(normalizeConclusion(step?.conclusion))).map(normalizeStep)
      : [],
    log,
  };
}

function normalizeFile(file, options) {
  const patch = boundPatch(file?.patch ?? "", options.maxPatchChars);
  return {
    filename: file?.filename ?? "unknown file",
    status: file?.status ?? null,
    additions: Number.isFinite(file?.additions) ? file.additions : null,
    deletions: Number.isFinite(file?.deletions) ? file.deletions : null,
    changes: Number.isFinite(file?.changes) ? file.changes : null,
    patch: patch.text || null,
    patchTruncated: patch.truncated,
  };
}

function source(name, url, retrievedAt) {
  return { name, url: url ?? null, retrievedAt };
}

export async function collectCiFailureContext({
  client,
  repository,
  runId,
  now = new Date().toISOString(),
  maxLogChars = DEFAULT_MAX_LOG_CHARS,
  maxLogLines = DEFAULT_MAX_LOG_LINES,
  contextLines = DEFAULT_CONTEXT_LINES,
  maxPatchChars = DEFAULT_MAX_PATCH_CHARS,
} = {}) {
  if (!client || typeof client.getWorkflowRun !== "function") throw new Error("A GitHub client is required.");
  if (!repository || !/^[^/\s]+\/[^/\s]+$/.test(repository)) throw new Error(`Invalid GitHub repository: ${repository}`);
  if (runId === undefined || runId === null || runId === "") throw new Error("A workflow run id is required.");

  const run = await client.getWorkflowRun(repository, runId);
  const conclusion = normalizeConclusion(run?.conclusion);
  if (!isActionableConclusion(conclusion)) throw new NonActionableRunError(conclusion);

  const jobs = await client.getJobs(repository, run.id ?? runId);
  const failedJobs = jobs.filter(isFailureJob);
  const options = { maxLogChars, maxLogLines, contextLines, maxPatchChars };
  const failures = [];
  const missingData = [];

  for (const job of failedJobs) {
    let logResult;
    try {
      logResult = await client.getJobLogs(repository, job.id);
    } catch (error) {
      logResult = { status: "unavailable", note: error.message };
    }
    if (logResult?.status !== "ok") missingData.push(`Logs unavailable for job ${job.name ?? job.id}.`);
    failures.push(normalizeJob(job, logResult, options));
  }

  if (failures.length === 0) missingData.push("The run was actionable, but no failed jobs were returned by the API.");

  const pullNumbers = Array.isArray(run?.pull_requests)
    ? run.pull_requests.map((pull) => pull?.number).filter((number) => number !== undefined && number !== null)
    : [];
  const pullRequests = [];
  for (const number of pullNumbers.slice(0, 10)) {
    try {
      const pull = await client.getPullRequest(repository, number);
      if (pull) pullRequests.push(normalizePullRequest(repository, pull));
    } catch (error) {
      missingData.push(`Pull-request metadata unavailable for #${number}: ${error.message}`);
    }
  }
  if (pullNumbers.length === 0) missingData.push("The workflow run is not associated with a pull request.");
  if (pullNumbers.length > pullRequests.length) missingData.push("Some associated pull-request metadata was unavailable.");

  let changedFiles = [];
  const primaryPull = pullRequests[0];
  if (primaryPull?.number) {
    try {
      const files = await client.getPullRequestFiles(repository, primaryPull.number);
      changedFiles = files.slice(0, DEFAULT_MAX_FILES).map((file) => normalizeFile(file, options));
    } catch (error) {
      missingData.push(`Changed files unavailable for PR #${primaryPull.number}: ${error.message}`);
    }
  }

  const runSummary = {
    id: Number(run?.id ?? runId),
    name: run?.name ?? null,
    workflowName: run?.workflow_name ?? run?.name ?? null,
    url: runUrl(repository, run),
    event: run?.event ?? null,
    status: normalizeConclusion(run?.status),
    conclusion,
    headBranch: run?.head_branch ?? null,
    headSha: run?.head_sha ?? null,
    baseBranch: primaryPull?.baseBranch ?? null,
    createdAt: run?.created_at ?? null,
    updatedAt: run?.updated_at ?? null,
  };

  const fingerprint = {
    repository,
    run: runSummary,
    pullRequests,
    failures,
    changedFiles,
    missingData,
  };
  const id = `cif_${sha256(stableStringify(fingerprint)).slice(0, 20)}`;
  const forkDiagnosisOnly = pullRequests.some((pull) => pull.fork === true);
  const provenance = [
    source("workflow-run", runSummary.url, now),
    source("workflow-jobs", `${runSummary.url}/jobs`, now),
    ...failures.filter((failure) => failure.url).map((failure) => source("job-log", `${failure.url}/logs`, now)),
    ...(primaryPull?.url ? [source("pull-request", primaryPull.url, now), source("changed-files", `${primaryPull.url}/files`, now)] : []),
  ];

  return {
    schema: CONTEXT_SCHEMA,
    id,
    generatedAt: now,
    repository: {
      fullName: repository,
      defaultBranch: run?.repository?.default_branch ?? null,
      url: run?.repository?.html_url ?? `https://github.com/${repository}`,
    },
    run: runSummary,
    pullRequests,
    failures,
    changedFiles,
    provenance,
    missingData: [...new Set(missingData)],
    safety: {
      untrustedEvidence: true,
      forkDiagnosisOnly,
      codeExecution: "not-performed",
    },
  };
}
