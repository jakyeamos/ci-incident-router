import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const modules = [
  "src/args.mjs",
  "src/artifacts.mjs",
  "src/constants.mjs",
  "src/context.mjs",
  "src/github.mjs",
  "src/prompt.mjs",
  "src/redaction.mjs",
  "src/repository.mjs",
  "bin/codex-ci.mjs",
  "scripts/emit-workflow-prompt.mjs",
];

for (const module of modules) execFileSync(process.execPath, ["--check", join(root, module)], { stdio: "inherit" });
const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
if (packageJson.type !== "module" || packageJson.bin?.["codex-ci"] !== "./bin/codex-ci.mjs") throw new Error("CLI package contract is invalid.");
console.log("typecheck ok (runtime syntax and package contract)");
