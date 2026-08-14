import { access, readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;
const requiredFiles = [
  "action.yml",
  "schemas/ci-failure-context.schema.json",
  "bin/codex-ci.mjs",
  "scripts/emit-workflow-prompt.mjs",
  ".github/workflow-templates/codex-ci-prompt.yml",
];

for (const file of requiredFiles) await access(join(root, file));
const action = await readFile(join(root, "action.yml"), "utf8");
if (!action.includes("using: composite") || !action.includes("emit-workflow-prompt.mjs")) throw new Error("Composite action contract is incomplete.");
JSON.parse(await readFile(join(root, "schemas/ci-failure-context.schema.json"), "utf8"));
console.log(`build ok (${requiredFiles.length} required files)`);
