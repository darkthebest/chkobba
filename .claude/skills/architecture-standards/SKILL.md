---
name: architecture-standards
description: Expert in software architecture patterns, design principles, system design, scalability, and module boundaries. Use when discussing architecture decisions, designing system architecture, applying SOLID principles, establishing module boundaries, evaluating scalability patterns, or implementing resilience patterns.
category: architecture
framework: [generic]
user-invocable: false
---

# Architecture Standards Skill

Expert knowledge in software architecture patterns and design principles.

## Core Expertise

- Monorepo architecture
- Microservices patterns
- Domain-driven design
- Layered architecture
- Module boundaries
- Dependency management
- Scalability patterns
- System design

## Architecture Patterns

### Layered Architecture

```
Presentation Layer (UI)
    ↓
Application Layer (Services)
    ↓
Domain Layer (Business Logic)
    ↓
Infrastructure Layer (Data Access)
```

### Module Boundaries

<!-- @generated: app-scope-mapping -->
**Application Module Structure**

Chkobba is a pnpm-workspaces TypeScript monorepo with three workspaces:

```
packages/rules/        # @chkobba/rules  (scope: rules)
  src/                 # Pure 2v2 Chkobba engine: cards, deck, deal, capture, scoring,
                       # team totals, game state transitions, bot strategies, shared game types
apps/server/           # @chkobba/server (scope: server)
  src/                 # Nakama TS runtime module: main.ts (InitModule), RPCs,
                       # authoritative match handlers, matchmaker hook, bot backfill,
                       # reconnection/seat handback, opcodes, storage/wallet access
  build/index.js       # Single bundled, ES5-compatible file loaded by Nakama (goja VM)
apps/mobile/           # @chkobba/mobile (scope: mobile)
  src/                 # Expo / React Native client: expo-router routes, screens,
                       # components, Nakama client (@heroiclabs/nakama-js) session/socket,
                       # social login, ads/consent, IAP
docker-compose.yml     # Nakama + PostgreSQL for local dev (scope: infra)
```

**Dependency direction (enforced):**

```
apps/server ──┐
              ├──> packages/rules   (rules depends on nothing in the repo)
apps/mobile ──┘
```

- `packages/rules` is pure: no imports from `nakama-runtime`, `@heroiclabs/nakama-js`, `react`, `react-native`, `expo*`, Node built-ins, timers, or I/O. It is deterministic — randomness (shuffling, bot choices) comes from an injected RNG/seed, never `Math.random()` directly — so the server, client, and tests replay identical games.
- `apps/server` and `apps/mobile` depend on `@chkobba/rules` via `workspace:*`. Apps never import from each other; anything both need (game types, opcode enums, message payload types) lives in `packages/rules`.
- The server is authoritative: it holds the deck and every hand and validates every move with `@chkobba/rules`. The client runs the same engine only for move previews/legality hints and offline play, and only receives its own hand.
- `packages/rules` code must stay goja/ES5-safe because it is bundled into `apps/server/build/index.js`: no Node APIs, no runtime dependencies that need polyfills unavailable in goja, no top-level side effects. The server bundle is a single file (Rollup + Babel to ES5, `nakama-runtime` marked external) and `InitModule` must survive tree-shaking.
- Nakama owns accounts, auth (device/guest, Google, Apple, Facebook), friends, groups, chat, matchmaking, wallet, storage, and PostgreSQL. App code does not talk to PostgreSQL directly; server code uses the `nk` runtime API, client code uses `@heroiclabs/nakama-js`.
- Server/client contract = match opcodes + RPC payload types defined once in `packages/rules` and versioned; changing them is a breaking change for shipped mobile builds.

**Per-workspace commands:** `pnpm --filter @chkobba/rules test` (Vitest), `pnpm --filter @chkobba/server test` (Vitest), `pnpm --filter @chkobba/mobile test` (jest-expo + RNTL); `pnpm --filter <package> build` / `lint` likewise. Root `pnpm build`, `pnpm test`, `pnpm lint` run across all workspaces.
<!-- @end: app-scope-mapping -->

### Dependency Rules

- Core depends on nothing
- Shared depends on core only
- Features depend on core + shared
- No circular dependencies

## Design Principles

### SOLID

- **Single Responsibility**: One reason to change
- **Open/Closed**: Open for extension, closed for modification
- **Liskov Substitution**: Subtypes must be substitutable
- **Interface Segregation**: Many specific interfaces
- **Dependency Inversion**: Depend on abstractions

### DRY (Don't Repeat Yourself)

- Extract common code to shared utilities
- Use inheritance/composition appropriately
- Create reusable components

### KISS (Keep It Simple, Stupid)

- Simplest solution that works
- Avoid over-engineering
- Clear, readable code

### YAGNI (You Aren't Gonna Need It)

- Don't add functionality until needed
- Build for current requirements
- Refactor when needed

## System Design

### Scalability Patterns

- Horizontal scaling (add instances)
- Vertical scaling (bigger instances)
- Load balancing
- Caching strategies
- Database sharding
- Async processing

### Resilience Patterns

- Circuit breakers
- Retry with exponential backoff
- Timeouts
- Graceful degradation
- Health checks

### Data Patterns

- Repository pattern
- Unit of work
- CQRS (Command Query Responsibility Segregation)
- Event sourcing
- Database per service

## Best Practices

- Design for failure
- Keep modules loosely coupled
- Use dependency injection
- Implement proper logging
- Monitor system health
- Document architecture decisions
- Regular architecture reviews
- Refactor proactively

## Architecture Decision Records (ADR)

```markdown
# ADR: Use Nx Monorepo

## Status

Accepted

## Context

Need to manage multiple related applications

## Decision

Use Nx monorepo for code sharing and coordinated development

## Consequences

- Better code reuse
- Easier refactoring
- Single CI/CD pipeline
- More complex initial setup
```

## Activation Keywords

Architecture, design patterns, system design, scalability, module boundaries, SOLID, monorepo, microservices, domain-driven design
