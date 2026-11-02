---
name: commit
description: Intelligently analyzes git changes and creates logical atomic commits following Semantic Versioning and Conventional Commits standards. Use when committing changes, writing commit messages, creating git commits, staging changes, or organizing commits.
category: workflow
framework: [generic]
disable-model-invocation: true
---

# Commit Manager

<role>Intelligent commit creator following Semantic Versioning 2.0.0 and Conventional Commits</role>

Analyze all file changes and create atomic commits with meaningful messages following Semantic Versioning 2.0.0 and
Conventional Commits standards.

## Workflow

<workflow>

### 1. Learn Commit Patterns

Use GitLab MCP to learn project conventions:

```bash
# Use mcp__gitlab-proxy__list_commits to see recent commit style
# Review 5-10 recent commits to understand patterns
```

### 2. Analyze Current Changes

```bash
git status
git diff
git diff --cached
```

**Identify affected apps from file paths:**

<!-- @generated: app-scope-mapping -->
**Application Scope Mapping**

Chkobba is a pnpm-workspaces monorepo. Map each changed path to exactly one scope:

- `packages/rules/` -> scope `rules` (`@chkobba/rules`: pure 2v2 Chkobba rules engine, scoring, bots)
- `apps/server/` -> scope `server` (`@chkobba/server`: Nakama TypeScript runtime module — `InitModule`, RPCs, authoritative match handlers, matchmaker hook, bot backfill)
- `apps/mobile/` -> scope `mobile` (`@chkobba/mobile`: Expo / React Native client, expo-router screens)
- `docker-compose.yml`, `pnpm-workspace.yaml`, root `package.json`, `pnpm-lock.yaml`, root `tsconfig*.json`, lint/format configs, Nakama config files -> scope `infra`
- `docs/`, `README.md`, `CHANGELOG.md`-only changes -> scope `docs`
- `.claude/` -> scope `claude`
- `context/` -> commit silently with scope `context` (never mention in CHANGELOG)

A change to `packages/rules/` that forces matching updates in `apps/server/` or `apps/mobile/` is split into one commit per scope, `rules` first.
<!-- @end: app-scope-mapping -->

### 3. Group Changes Logically

**By type:**

- `feat:` New features → **MINOR bump** (0.1.0 → 0.2.0)
- `fix:` Bug fixes → **PATCH bump** (0.2.0 → 0.2.1)
- `feat!:` Breaking changes → **MINOR bump in 0.x** (0.2.1 → 0.3.0)
- `refactor:` Code improvements (no bump)
- `docs:` Documentation (no bump)
- `style:` Formatting (no bump)
- `test:` Tests (no bump)
- `chore:` Maintenance (no bump)
- `perf:` Performance → **PATCH bump**

**Scope is MANDATORY in monorepo:**

<!-- @generated: app-scope-mapping -->
**Monorepo Scope Examples**

Valid scopes: `rules`, `server`, `mobile`, `infra`, `docs`, `claude`, `context`.

- `feat(rules):`, `fix(rules):`, `test(rules):`, `refactor(rules):`
- `feat(server):`, `fix(server):`, `perf(server):`, `chore(server):`
- `feat(mobile):`, `fix(mobile):`, `style(mobile):`, `test(mobile):`
- `chore(infra):`, `fix(infra):`
- `docs(docs):` (or `docs(<app-scope>):` when the doc lives inside an app or package)
<!-- @end: app-scope-mapping -->

### 4. Update CHANGELOG.md

Before committing:

- Add entry under `[Unreleased]` section
- **NEVER include `context/` or `.claude` folder** - internal tracking only
- Use format: `### Added/Changed/Fixed/BREAKING CHANGES`
- Link issues/MRs when applicable
- Stage with `git add CHANGELOG.md`

### 5. Create Atomic Commits

```bash
# Stage specific files only - NEVER use -A or .
git add src/specific/file.ts

# Commit with semantic message
git commit -m "feat(api): add field selection to projects endpoint"
```

**Commit Order:**

<!-- @generated: app-scope-mapping -->
**Commit Order**

Order commits by the workspace dependency graph (`rules` is consumed by both apps; apps never depend on each other):

1. `infra` changes the others rely on (workspace config, `docker-compose.yml`, shared tsconfig, new root dev dependencies)
2. `rules` (`packages/rules/`) — rules engine, scoring, bots, shared types
3. `server` (`apps/server/`) — Nakama runtime consuming the updated rules
4. `mobile` (`apps/mobile/`) — Expo client consuming the updated rules and server RPC/opcode contracts
5. `docs`
6. `claude` / `context`

Before each app commit, the touched workspace must pass `pnpm --filter <package> test` (`@chkobba/rules`, `@chkobba/server`, `@chkobba/mobile`).
<!-- @end: app-scope-mapping -->

</workflow>

## Rules

<constraints>

- **Scope MANDATORY**: Always include app/package name
- **Subject < 50 chars**: Including scope
- **Imperative mood**: "add" not "added"
- **Focus on why**: Not just what changed
- **Atomic commits**: One logical change per commit
- **NO Claude watermarks**: Keep messages clean
- **Commit `context/` silently**: Never mention in messages or CHANGELOG
- **Never mix apps**: Unless truly interdependent
- **NEVER ADD Generated with Claude Code or Co-Authored-By: Claude Opus 4.5 or anything similar**

## Scope Names

<!-- @generated: app-scope-mapping -->
**Scope Name Registry**

| Path | Scope | Package | Example files |
| --- | --- | --- | --- |
| `packages/rules/` | `rules` | `@chkobba/rules` | `packages/rules/src/scoring.ts`, `packages/rules/src/bots/` |
| `apps/server/` | `server` | `@chkobba/server` | `apps/server/src/main.ts`, `apps/server/src/match/` |
| `apps/mobile/` | `mobile` | `@chkobba/mobile` | `apps/mobile/src/app/` (expo-router routes), `apps/mobile/src/components/` |
| `docker-compose.yml`, `pnpm-workspace.yaml`, root `package.json` / `pnpm-lock.yaml`, root `tsconfig*.json`, lint configs | `infra` | (root) | `docker-compose.yml` |
| `docs/`, root `README.md` | `docs` | (root) | `docs/rules-variant.md` |
| `.claude/` | `claude` | (root) | `.claude/skills/commit/SKILL.md` |
| `context/` | `context` | (root) | `context/plans/*.md` (commit silently) |
<!-- @end: app-scope-mapping -->

## Examples

<!-- @generated: app-scope-mapping -->
**Commit Message Examples**

Single-scope:

```bash
git commit -m "feat(rules): score chkobba sweeps per team"
git commit -m "fix(server): hand seat back to player on reconnect"
git commit -m "feat(mobile): add guest sign-in screen"
git commit -m "chore(infra): pin nakama image in compose"
```

Multi-scope feature (separate commits, dependency order):

```bash
git commit -m "feat(rules): add bot difficulty strategies"
git commit -m "feat(server): backfill empty seats with bots"
git commit -m "feat(mobile): show bot badge on backfilled seats"
```

Breaking change (match message contract between server and mobile):

```bash
git commit -m "feat(server)!: split play opcode into play and capture" \
  -m "BREAKING CHANGE: clients must send OP_CAPTURE separately; older mobile builds can no longer play online."
```
<!-- @end: app-scope-mapping -->

</constraints>

## Process

1. Run `git status` and `git diff` to see changes
2. Use GitLab MCP to review recent commit patterns
3. Group changes by app and type
4. Update CHANGELOG.md (exclude context/)
5. Stage files with specific paths
6. Create atomic commits
7. Proceed autonomously - no confirmation needed
