#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseOptions } from "../src/args.mjs";
import { downloadPromptArtifact, writeArtifacts, readContextArtifact, readPrompt } from "../src/artifacts.mjs";
import { collectCiFailureContext } from "../src/context.mjs";
import { createGithubClient } from "../src/github.mjs";
import { renderCodexPrompt } from "../src/prompt.mjs";
import { parseRunId, repositoryFromCheckout, tokenFromEnvironment } from "../src/repository.mjs";

const HELP = `Usage:
  codex-ci prompt --run <run-id-or-url> [--repo <owner/name>] [--repo-path <checkout>] [--output-dir <dir>]
  codex-ci download --run <run-id-or-url> [--repo <owner/name>] [--repo-path <checkout>] [--output-dir <dir>]
  codex-ci consume --input <artifact-file-or-dir> [--output <prompt.md>]
  codex-ci handoff --prompt <prompt-file-or-dir> --repo <checkout> [--start]

Commands:
  prompt    Fetch a workflow run and write codex-ci-prompt.json and .md.
  download  Download and safely extract the prompt artifact for a workflow run.
  consume   Read a JSON artifact and render the deterministic Markdown prompt.
  handoff   Print a prompt and the safe Codex command, or start it with --start.

Environment:
  GITHUB_TOKEN or GH_TOKEN supplies the GitHub API token. Without either, the
  CLI tries gh auth token.
`;

function requireOption(options, name, positionalIndex = 0) {
  const value = options[name] ?? options.positionals[positionalIndex];
  if (!value) throw new Error(`Missing --${name}.\n\n${HELP}`);
  return value;
}

function resolvePromptRepository(options) {
  if (options.repo && /^[^/\s]+\/[^/\s]+$/.test(options.repo)) return options.repo;
  return repositoryFromCheckout(options.repo_path ?? options.repo ?? ".");
}

function githubClient(options) {
  return createGithubClient({
    token: tokenFromEnvironment(options.token),
    apiBase: options.api_base ?? process.env.CODEX_CI_API_BASE,
  });
}

async function promptCommand(options, { clientFactory = githubClient } = {}) {
  const repository = resolvePromptRepository(options);
  const runId = parseRunId(requireOption(options, "run", 0));
  const client = clientFactory(options);
  const context = await collectCiFailureContext({
    client,
    repository,
    runId,
    maxLogChars: options.max_log_chars ? Number(options.max_log_chars) : undefined,
    maxLogLines: options.max_log_lines ? Number(options.max_log_lines) : undefined,
  });
  const artifacts = await writeArtifacts(context, options.output_dir ?? "codex-ci-prompt");
  console.log(`Wrote ${artifacts.jsonPath}`);
  console.log(`Wrote ${artifacts.markdownPath}`);
}

async function downloadCommand(options, { clientFactory = githubClient } = {}) {
  const repository = resolvePromptRepository(options);
  const runId = parseRunId(requireOption(options, "run", 0));
  const artifacts = await downloadPromptArtifact({
    client: clientFactory(options),
    repository,
    runId,
    outputDir: options.output_dir ?? "codex-ci-prompt",
  });
  console.log(`Downloaded artifact ${artifacts.artifact.name} (${artifacts.artifact.id})`);
  console.log(`Wrote ${artifacts.jsonPath}`);
  console.log(`Wrote ${artifacts.markdownPath}`);
}

async function consumeCommand(options) {
  const input = requireOption(options, "input", 0);
  const context = await readContextArtifact(input);
  const prompt = renderCodexPrompt(context);
  if (options.output) {
    await writeFile(resolve(options.output), prompt, "utf8");
    console.log(`Wrote ${resolve(options.output)}`);
    return;
  }
  process.stdout.write(prompt);
}

async function handoffCommand(options) {
  const promptPath = requireOption(options, "prompt", 0);
  const checkout = resolve(requireOption(options, "repo", 0));
  const prompt = await readPrompt(promptPath);

  if (!options.start) {
    process.stdout.write(prompt);
    process.stdout.write(`\n---\nRead-only handoff command:\ncodex exec --sandbox read-only --cd ${JSON.stringify(checkout)} -\n`);
    return;
  }

  const codex = options.codex ?? "codex";
  const result = spawnSync(codex, ["exec", "--sandbox", "read-only", "--cd", checkout, "-"], {
    input: prompt,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.error) throw new Error(`Unable to start Codex: ${result.error.message}`);
  process.exitCode = result.status ?? 1;
}

export async function runCli({ argv = process.argv.slice(2), clientFactory = githubClient } = {}) {
  if (argv[0] === "--help" || argv[0] === "-h") {
    process.stdout.write(HELP);
    return;
  }
  const [command, ...argumentsList] = argv;
  const options = parseOptions(argumentsList);
  if (!command || options.help || command === "help") {
    process.stdout.write(HELP);
    return;
  }
  if (command === "prompt") return promptCommand(options, { clientFactory });
  if (command === "download") return downloadCommand(options, { clientFactory });
  if (command === "consume") return consumeCommand(options);
  if (command === "handoff") return handoffCommand(options);
  throw new Error(`Unknown command: ${command}.\n\n${HELP}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(`codex-ci: ${error.message}`);
    process.exitCode = 1;
  });
}
