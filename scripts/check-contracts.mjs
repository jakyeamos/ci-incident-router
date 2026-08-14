import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url).pathname;

function readJson(file) {
  return readFile(join(root, file), "utf8").then(JSON.parse);
}

const packageJson = await readJson("package.json");
const preCr = await readJson(".pre-cr.json");
const schema = await readJson("schemas/ci-failure-context.schema.json");
const behavior = await readJson(".pronto/behavior-assurance.json");
const compass = await readJson(".project-compass/contract.json");
const continuity = await readJson(".project-compass/continuity.json");
const matrix = await readJson(".agents/change-surface-matrix.json");

if (!packageJson.name || !packageJson.version || !packageJson.scripts?.test) throw new Error("package.json is missing the package or test contract.");
if (preCr.version !== 1 || !Array.isArray(preCr.qualityCommands)) throw new Error(".pre-cr.json is invalid.");
if (schema.properties?.schema?.const !== "ci-failure-context/v1") throw new Error("Context schema version is invalid.");
if (behavior.schema !== "pronto-behavior-assurance/v2" || behavior.applicability !== "applicable" || !behavior.behaviors?.length) throw new Error("Behavior assurance contract is invalid.");
for (const item of behavior.behaviors) {
  if (!item.id || !item.title || ![0, 1, 2].includes(item.tier) || !item.invariants?.length || !item.scenarios?.length) throw new Error(`Behavior contract is incomplete: ${item.id}`);
}
if (compass.schema_version !== 1 || !compass.project || !compass.pillars?.length) throw new Error("Project Compass contract is invalid.");
if (continuity.schema_version !== 1 || !Array.isArray(continuity.commitments)) throw new Error("Project Compass continuity is invalid.");
if (matrix.schema_version !== "change-surface-matrix/v1" || !matrix.surfaces?.length) throw new Error("Change-surface matrix is invalid.");

console.log("repository contracts ok");
