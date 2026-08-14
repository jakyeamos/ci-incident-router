#!/usr/bin/env node

import { parseOptions } from "../src/args.mjs";
import { writeArtifacts } from "../src/artifacts.mjs";
import { collectCiFailureContext } from "../src/context.mjs";
import { createGithubClient } from "../src/github.mjs";
import { parseRunId } from "../src/repository.mjs";

export async function emitWorkflowPrompt({ runId, repository, token, outputDir = "codex-ci-prompt", fetchImpl } = {}) {
  const client = createGithubClient({ token, fetchImpl });
  const context = await collectCiFailureContext({
    client,
    repository,
    runId: parseRunId(runId),
  });
  return writeArtifacts(context, outputDir);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: emit-workflow-prompt.mjs --run-id <id> --repository <owner/name> --output-dir <dir>");
    return;
  }
  const artifacts = await emitWorkflowPrompt({
    runId: options.run_id ?? process.env.GITHUB_RUN_ID,
    repository: options.repository ?? process.env.GITHUB_REPOSITORY,
    token: options.token ?? process.env.CODEX_CI_TOKEN ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
    outputDir: options.output_dir ?? "codex-ci-prompt",
  });
  console.log(`Wrote ${artifacts.jsonPath}`);
  console.log(`Wrote ${artifacts.markdownPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(`emit-workflow-prompt: ${error.message}`);
    process.exitCode = 1;
  });
}
