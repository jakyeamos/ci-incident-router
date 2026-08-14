import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join, posix, resolve } from "node:path";
import { renderCodexPrompt } from "./prompt.mjs";

const execFileAsync = promisify(execFile);
const ARTIFACT_SCHEMA = "ci-failure-context/v1";
const ARCHIVE_MAX_BUFFER = 2_000_000;

export async function writeArtifacts(context, outputDir) {
  const directory = resolve(outputDir);
  await mkdir(directory, { recursive: true });
  const jsonPath = join(directory, "codex-ci-prompt.json");
  const markdownPath = join(directory, "codex-ci-prompt.md");
  await writeFile(jsonPath, `${JSON.stringify(context, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderCodexPrompt(context), "utf8");
  return { directory, jsonPath, markdownPath };
}

export async function readContextArtifact(input) {
  const target = resolve(input);
  const targetStat = await stat(target);
  const jsonPath = targetStat.isDirectory() ? join(target, "codex-ci-prompt.json") : target;
  const value = JSON.parse(await readFile(jsonPath, "utf8"));
  if (value?.schema !== ARTIFACT_SCHEMA) throw new Error("Unsupported or invalid CI prompt artifact schema.");
  return value;
}

export async function readPrompt(input) {
  const target = resolve(input);
  const targetStat = await stat(target);
  if (targetStat.isDirectory()) {
    const markdownPath = join(target, "codex-ci-prompt.md");
    return readFile(markdownPath, "utf8");
  }
  if (target.endsWith(".json")) return renderCodexPrompt(await readContextArtifact(target));
  return readFile(target, "utf8");
}

function safeArchiveEntry(entry) {
  const value = String(entry ?? "").trim().replaceAll("\\", "/");
  if (!value || value.startsWith("/") || /^[A-Za-z]:\//.test(value)) {
    throw new Error(`Unsafe artifact archive entry: ${entry}`);
  }
  const normalized = posix.normalize(value);
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`Unsafe artifact archive entry: ${entry}`);
  }
  return normalized;
}

function archiveEntryFor(entries, filename) {
  const matches = entries
    .map(safeArchiveEntry)
    .filter((entry) => entry.split("/").at(-1) === filename);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one ${filename} in the Codex prompt artifact; found ${matches.length}.`);
  }
  return matches[0];
}

async function runUnzip(execFileImpl, unzipCommand, args, options) {
  try {
    return await execFileImpl(unzipCommand, args, options);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error("Downloading prompt artifacts requires an 'unzip' executable on PATH.");
    }
    throw error;
  }
}

export async function unpackPromptArtifact(archive, outputDir, {
  unzipCommand = "unzip",
  execFileImpl = execFileAsync,
} = {}) {
  if (!archive || typeof archive.length !== "number") throw new Error("A GitHub artifact archive is required.");
  const directory = resolve(outputDir);
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "codex-ci-artifact-"));
  const archivePath = join(temporaryDirectory, "artifact.zip");
  await writeFile(archivePath, archive);

  try {
    const listingResult = await runUnzip(execFileImpl, unzipCommand, ["-Z1", archivePath], {
      encoding: "utf8",
      maxBuffer: ARCHIVE_MAX_BUFFER,
    });
    const entries = String(listingResult.stdout ?? "").split(/\r?\n/).filter(Boolean);
    const jsonEntry = archiveEntryFor(entries, "codex-ci-prompt.json");
    const markdownEntry = archiveEntryFor(entries, "codex-ci-prompt.md");
    await mkdir(directory, { recursive: true });

    for (const [entry, filename] of [[jsonEntry, "codex-ci-prompt.json"], [markdownEntry, "codex-ci-prompt.md"]]) {
      const extracted = await runUnzip(execFileImpl, unzipCommand, ["-p", archivePath, entry], {
        encoding: null,
        maxBuffer: ARCHIVE_MAX_BUFFER,
      });
      const value = Buffer.isBuffer(extracted.stdout) ? extracted.stdout : Buffer.from(extracted.stdout ?? "");
      await writeFile(join(directory, filename), value);
    }
    return {
      directory,
      jsonPath: join(directory, "codex-ci-prompt.json"),
      markdownPath: join(directory, "codex-ci-prompt.md"),
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function downloadPromptArtifact({
  client,
  repository,
  runId,
  outputDir,
  unzipCommand,
  execFileImpl,
} = {}) {
  if (
    !client
    || (typeof client.getArtifactsByName !== "function" && typeof client.getRunArtifacts !== "function")
    || typeof client.downloadArtifact !== "function"
  ) {
    throw new Error("A GitHub client with artifact support is required.");
  }
  const expectedName = `codex-ci-prompt-${runId}`;
  const artifacts = typeof client.getArtifactsByName === "function"
    ? await client.getArtifactsByName(repository, expectedName)
    : await client.getRunArtifacts(repository, runId);
  const matches = artifacts.filter((artifact) => (
    artifact?.name === expectedName
    && artifact?.expired !== true
  ));
  if (matches.length === 0) {
    throw new Error(`No unexpired '${expectedName}' artifact was found for workflow run ${runId}.`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple '${expectedName}' artifacts were found for workflow run ${runId}; refusing to guess.`);
  }
  const artifact = matches[0];
  if (artifact.id === undefined || artifact.id === null) throw new Error(`Artifact '${expectedName}' has no id.`);
  const archive = await client.downloadArtifact(repository, artifact.id);
  const paths = await unpackPromptArtifact(archive, outputDir, { unzipCommand, execFileImpl });
  return { ...paths, artifact: { id: artifact.id, name: artifact.name, expired: artifact.expired ?? false } };
}
