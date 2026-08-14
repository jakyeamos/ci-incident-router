# Installation and workflow integration

## Consumer repository

1. Keep the prompt workflow on the consumer repository's default branch.
2. Copy `.github/workflow-templates/codex-ci-prompt.yml` into
   `.github/workflows/codex-ci-prompt.yml`.
3. Replace `OWNER/ci-incident-router@main` with a pinned tag or commit of this
   repository after it is published.
4. Replace the example workflow name in `on.workflow_run.workflows` with the
   exact CI workflow names to observe.
5. Review the permissions and run one controlled failure before broad rollout.

The caller workflow only needs metadata and Actions read access plus the
permission required by `actions/upload-artifact`. It does not need contents
write, pull-request write, or deployment permissions.

## Local handoff

Download the artifact from the prompt workflow run, or let the CLI retrieve the
exact repository artifact named for the failed run and its rerun attempt, then
run:

```bash
codex-ci download \
  --repo owner/repository \
  --run https://github.com/owner/repository/actions/runs/123456789 \
  --output-dir ./codex-ci-prompt
```

The `download` command requires `unzip` on `PATH` and only extracts the two
known prompt files from the artifact archive. If you downloaded the artifact
manually, skip that command and point `consume` at the extracted directory:

```bash
codex-ci consume --input ./codex-ci-prompt
codex-ci handoff \
  --prompt ./codex-ci-prompt/codex-ci-prompt.md \
  --repo /absolute/path/to/checkout
```

Use `--start` only after reviewing the generated prompt. The started Codex
process is constrained to a read-only sandbox by the bridge.

## Provider boundary

This repository contains the implementation and workflow template only. It has
not been published to GitHub or installed into a consumer repository by local
implementation work alone.
