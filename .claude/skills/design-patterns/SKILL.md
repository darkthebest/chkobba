---
name: design-patterns
description: Expert in Gang of Four design patterns (Factory, Strategy, Adapter, Decorator, Observer, Template Method) with framework-specific TypeScript examples. Use when implementing creational/structural/behavioral patterns, refactoring switch statements into polymorphism, decoupling components via events, wrapping third-party APIs, adding cross-cutting concerns, or defining algorithm skeletons with hooks. Router skill — load per-pattern reference for deep-dive.
category: design-pattern
framework: [generic]
---

# Design Patterns

Router skill for six classic GoF design patterns. Each pattern has a dedicated reference under `references/{pattern}/README.md` with use cases, best practices, common mistakes, and a framework-specific code example.

## When to Use This Skill

Activate when:

- User mentions a specific pattern by name ("factory pattern", "observer pattern", etc.).
- A code smell suggests a pattern fits (large switch on type, duplicated algorithm skeleton, scattered event emitters, third-party API leaks into domain code, cross-cutting concerns inlined into business logic).
- Refactoring conditional creation/dispatch into polymorphism.

Skip when:

- Only 1–2 variants exist — keep the conditional.
- Premature abstraction with no second concrete case in sight.
- The framework already supplies the mechanism idiomatically (e.g., Angular DI already covers most "factory" needs).

## Pattern Decision Tree

```
What problem?
├─ Create objects based on a runtime type/key       → factory       (references/factory/)
├─ Swap interchangeable algorithms at runtime       → strategy      (references/strategy/)
├─ Make a foreign interface look like ours          → adapter       (references/adapter/)
├─ Add behavior (logging/caching/auth) around code  → decorator     (references/decorator/)
├─ One-to-many notify on state change               → observer      (references/observer/)
└─ Fixed algorithm skeleton, variable steps         → template-method (references/template-method/)
```

Disambiguation cheats:

- **Strategy vs Factory** — factory *creates* the object; strategy *uses* a varying object. Often paired (factory returns a strategy).
- **Strategy vs Template Method** — strategy varies the whole algorithm via composition; template method varies *steps* via inheritance.
- **Adapter vs Decorator** — adapter *changes* the interface; decorator *keeps* the same interface and adds behavior.
- **Observer vs Strategy** — observer is one-to-many notification; strategy is one client picking one algorithm.

## Pattern Index

| Pattern         | Category   | Reference                                      | When                                                  |
|-----------------|------------|------------------------------------------------|-------------------------------------------------------|
| Factory         | Creational | [factory](references/factory/README.md)         | 3+ object types instantiated by runtime key           |
| Strategy        | Behavioral | [strategy](references/strategy/README.md)       | Interchangeable algorithms selected at runtime         |
| Adapter         | Structural | [adapter](references/adapter/README.md)         | Third-party / legacy interface mismatch               |
| Decorator       | Structural | [decorator](references/decorator/README.md)     | Cross-cutting concerns; same-interface wrapping       |
| Observer        | Behavioral | [observer](references/observer/README.md)       | Event-driven decoupling, pub/sub                      |
| Template Method | Behavioral | [template-method](references/template-method/README.md) | Invariant workflow with overridable steps |

## Framework-Specific Examples

Each `references/{pattern}/` directory ships four framework variants:

- `example-nestjs.ts` — DI-based, decorator-rich
- `example-angular.ts` — services + providers + RxJS where relevant
- `example-express.ts` — middleware / plain handlers
- `example-vanilla.ts` — framework-free TypeScript (fallback)

During project init, the matching example for the detected framework is injected into the reference file's `<!-- @example: framework -->` block. The other three remain on disk for cross-reference.

## Recommended Workflow

1. **Spot the symptom.** Use the decision tree above. If torn between two patterns, read both references — disambiguation rules are at the top of each.
2. **Open the reference.** `references/{pattern}/README.md` gives the canonical structure, use cases, best practices, and common mistakes for that pattern.
3. **Adapt the example.** The framework-specific `example-{framework}.ts` shows idiomatic code for your stack. Copy structure, not literal strings.
4. **Check `When NOT to use`.** Every reference has one. Walk away if the project doesn't justify the abstraction yet.
5. **Verify with the `Common Mistakes` checklist** in the reference before committing.

## Common Pitfalls (Cross-Pattern)

- **Premature pattern application.** Two concrete variants is usually too few. Wait for the third.
- **God factories / god strategies.** One factory creating unrelated families = Single Responsibility violation. Split.
- **Static / `new` inside DI-managed code.** Lose testability and lifecycle control. Inject everything.
- **Leaking adaptee or framework types** through your domain interface. Pattern boundaries exist to *contain* foreign concepts.
- **Confusing TypeScript `@decorators` with the Decorator Pattern.** Language feature vs. object-composition pattern — see `references/decorator/README.md`.

## External References

- [Refactoring Guru — Design Patterns Index](https://refactoring.guru/design-patterns)
- [TypeScript Examples — refactoring.guru](https://refactoring.guru/design-patterns/typescript)
- [SOLID Principles](https://refactoring.guru/design-patterns/principles)