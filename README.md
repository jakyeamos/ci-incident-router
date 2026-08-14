# CI failure → Codex prompt bridge

This repository turns a failed GitHub Actions run into bounded, deterministic
context that can be handed to Codex:

```text
failed workflow run → CiFailureContext → codex-ci-prompt.md → user-controlled Codex session
```

The bridge does not send email, call another model, modify source code, commit,
merge, push, or check out the failed run's commit. Logs and patches are treated
as untrusted evidence. Fork pull requests are diagnosis-only.

## Compatibility target

The collection boundary follows the existing `gh-fix-ci` workflow: identify
failed GitHub Actions checks, retrieve bounded job-log evidence, and include
pull-request metadata and changed-file context. Non-GitHub Actions checks stay
report-only and are outside this v1 provider edge.

## Local usage

The CLI uses a GitHub token from `GITHUB_TOKEN`, `GH_TOKEN`, or `gh auth token`.

```bash
pnpm test
node ./bin/codex-ci.mjs prompt \
  --repo owner/repository \
  --run https://github.com/owner/repository/actions/runs/123456789 \
  --output-dir ./codex-ci-prompt

node ./bin/codex-ci.mjs download \
  --repo owner/repository \
  --run https://github.com/owner/repository/actions/runs/123456789 \
  --output-dir ./codex-ci-prompt

node ./bin/codex-ci.mjs consume --input ./codex-ci-prompt
node ./bin/codex-ci.mjs handoff \
  --prompt ./codex-ci-prompt/codex-ci-prompt.md \
  --repo /path/to/checkout
```

`handoff` prints the prompt and the safe read-only Codex command by default.
Pass `--start` only when you explicitly want this process to start
`codex exec` with a read-only sandbox.

`download` finds the exact `codex-ci-prompt-<run-id>` artifact, downloads its
archive, and extracts only the JSON and Markdown prompt files. It requires the
system `unzip` command.

## GitHub Actions

The reusable action is in [`action.yml`](action.yml). A default-branch workflow
template is in [`.github/workflow-templates/codex-ci-prompt.yml`](.github/workflow-templates/codex-ci-prompt.yml).
Copy that template into a consumer repository, replace the action reference with
the published or pinned bridge reference, and list the workflow names that
should produce prompts.

The prompt workflow listens to `workflow_run`, reads run metadata, failed jobs,
logs, pull-request metadata, and changed-file metadata through the GitHub API,
then uploads `codex-ci-prompt.json` and `codex-ci-prompt.md` as one artifact.
It does not use `actions/checkout`.

## Scope

The v1 boundary is intentionally narrow:

- supported conclusions: `failure`, `cancelled`, `timed_out`, and
  `action_required`;
- same-repository pull requests receive normal diagnosis context;
- fork pull requests receive diagnosis-only context and are never executed;
- successful and skipped runs do not produce prompts;
- no database, daemon, comments, check annotations, or automatic Codex wake-up.

See [`docs/security.md`](docs/security.md) for the trust boundary and
[`docs/installation.md`](docs/installation.md) for the workflow integration.
