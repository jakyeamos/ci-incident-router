# Product brief

## Identity

CI failure → Codex prompt bridge is a local-first, provider-neutral utility
that turns failed GitHub Actions runs into bounded prompts for Codex.

## Audience

Developers who already use Codex for CI-fix diagnosis and want the failure
context packaged consistently without email or a persistent notification
service.

## Core loop

1. GitHub Actions completes with an actionable failure conclusion.
2. The bridge reads run, job, log, pull-request, and changed-file evidence.
3. The bridge redacts and bounds untrusted text.
4. The bridge emits JSON and Markdown artifacts.
5. A user explicitly consumes the artifact in a normal read-only Codex session.

## MVP finish line

A real failed run can produce one downloadable prompt artifact, and the local
CLI can consume it and hand it to Codex without making code changes.

## Explicit exclusions

- email or mailbox polling;
- model-generated summaries inside GitHub Actions;
- automatic code edits, commits, merges, or pushes;
- background daemons, databases, PR comments, and check annotations;
- executing code from a failed or fork pull request.
