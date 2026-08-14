# CI prompt bridge context

## Canonical surfaces

- `src/github.mjs` owns GitHub REST collection and response normalization.
- `src/context.mjs` owns the versioned `CiFailureContext` shape and stable IDs.
- `src/prompt.mjs` owns deterministic Markdown prompt rendering.
- `bin/codex-ci.mjs` owns the local CLI and explicit read-only handoff.
- `action.yml` and `.github/workflow-templates/` own GitHub Actions integration.
- `schemas/ci-failure-context.schema.json` is the machine-readable output
  contract.

## Verification

Run the commands in `AGENTS.md`. Live GitHub verification requires a valid
`gh` or `GITHUB_TOKEN` credential and a real workflow run; local fixtures do not
prove provider behavior.
