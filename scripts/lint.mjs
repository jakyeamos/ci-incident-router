import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const sourceRoots = ["bin", "src", "scripts", "tests"];

async function filesUnder(directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else if (entry.name.endsWith(".mjs")) files.push(path);
  }
  return files;
}

for (const directory of sourceRoots) {
  for (const file of await filesUnder(directory)) execFileSync(process.execPath, ["--check", join(root, file)], { stdio: "inherit" });
}

const workflow = await readFile(join(root, ".github/workflow-templates/codex-ci-prompt.yml"), "utf8");
for (const forbidden of ["pull_request_target", "dangerously-bypass-approvals-and-sandbox", "actions/checkout"]) {
  if (workflow.includes(forbidden)) throw new Error(`Unsafe workflow token found: ${forbidden}`);
}
if (!workflow.includes("workflow_run:") || !workflow.includes("actions: write")) throw new Error("Prompt workflow trigger or artifact permission is missing.");

console.log(`lint ok (${sourceRoots.join(", ")}; workflow safety checks)`);
