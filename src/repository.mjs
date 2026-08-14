import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function parseRunId(value) {
  const text = String(value ?? "").trim();
  if (/^\d+$/.test(text)) return text;
  const match = text.match(/\/actions\/runs\/(\d+)/);
  if (match) return match[1];
  throw new Error(`Unable to find a workflow run id in: ${value}`);
}

export function parseGithubRepository(value) {
  const text = String(value ?? "").trim().replace(/\.git$/, "");
  const match = text.match(/(?:github\.com[/:])([^/\s]+)\/([^/\s]+)$/i);
  if (match) return `${match[1]}/${match[2]}`;
  if (/^[^/\s]+\/[^/\s]+$/.test(text)) return text;
  throw new Error(`Unable to resolve a GitHub repository from: ${value}`);
}

export function repositoryFromCheckout(checkout) {
  const root = resolve(checkout);
  if (!existsSync(root)) throw new Error(`Checkout does not exist: ${root}`);
  try {
    const remote = execFileSync("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return parseGithubRepository(remote);
  } catch {
    throw new Error(`Unable to resolve a GitHub origin from checkout: ${root}`);
  }
}

export function tokenFromEnvironment(explicitToken) {
  if (explicitToken) return explicitToken;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  try {
    const token = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (token) return token;
  } catch {
    // The caller receives the actionable error below.
  }
  throw new Error("No GitHub token available. Set GITHUB_TOKEN or GH_TOKEN, or authenticate gh.");
}
