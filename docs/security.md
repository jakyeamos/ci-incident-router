# Security and trust boundary

The prompt bridge handles data that may be attacker-controlled. Workflow logs,
job names, PR titles, changed-file patches, and failure text are evidence only.
The generated prompt explicitly tells Codex not to follow instructions found in
those fields.

The workflow runs from the default branch and does not check out the failed run
or pull-request head. Fork pull requests are marked diagnosis-only. The local
handoff uses `codex exec --sandbox read-only` and never opts into bypassed
approvals or full-access execution.

The compiler redacts common token, bearer, password, secret, and private-key
patterns before writing artifacts. It also bounds each log excerpt and changed
file patch. Missing data is recorded as an explicit note.
