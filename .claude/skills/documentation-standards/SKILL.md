---
name: documentation-standards
description: Expert in technical documentation, JSDoc, README files, API documentation, and code comments following the Diataxis framework. Use when writing technical documentation, creating README files, documenting APIs with JSDoc, writing code comments, organizing documentation by type (tutorials, how-to guides, reference, explanation), or following documentation standards.
category: architecture
framework: [generic]
user-invocable: false
---

# Documentation Standards Skill

Expert knowledge in writing clear, comprehensive technical documentation.

## Core Expertise

- **Diataxis Framework** - Systematic approach to technical documentation quality
- JSDoc comments
- README structure
- API documentation
- Code comments
- Architecture documentation
- Migration guides
- User guides

## Diataxis Framework

**IMPORTANT**: All documentation in this monorepo follows the **[Diataxis framework](https://diataxis.fr/)**, a systematic approach to technical documentation quality.

The framework organizes documentation into 4 distinct types:

| Type              | Purpose                | When to Use                               | Examples                                      |
| ----------------- | ---------------------- | ----------------------------------------- | --------------------------------------------- |
| **Tutorials**     | Learning-oriented      | Teaching by example, step-by-step lessons | "Your First Decision Tree", Getting Started   |
| **How-to Guides** | Task-oriented          | Solving specific problems                 | "How to Deploy to Production", Configuration  |
| **Reference**     | Information-oriented   | Technical descriptions for lookup         | API docs, Module references, Node types       |
| **Explanation**   | Understanding-oriented | Clarifying concepts and design decisions  | Architecture decisions, Design patterns, ADRs |

### Directory Structure

```
docs/
├── tutorials/          # Learning-oriented guides
├── how-to/            # Task-oriented problem-solving
├── reference/         # Technical specifications
└── explanation/       # Conceptual understanding

docs/
├── tutorials/          # App-specific tutorials
├── how-to/            # App-specific task guides
├── reference/         # App-specific API/module docs
└── explanation/       # App-specific architecture/concepts
```

### Key Principles

1. **Don't mix types** - Keep tutorials separate from reference, how-to separate from explanation
2. **Follow conventions** - Each type has specific structure and tone
3. **Use correct location** - Place docs in appropriate folders based on type
4. **Be consistent** - All documentation agents and skills follow Diataxis

### Resources

- [Diataxis Official Site](https://diataxis.fr/)
- [Tutorial vs How-to](https://diataxis.fr/tutorials-how-to/)
- [Reference vs Explanation](https://diataxis.fr/reference-explanation/)

## Documentation Patterns

### JSDoc

````typescript
/**
 * Processes lead data and applies validation rules
 *
 * @param lead - The lead data to process
 * @param rules - Validation rules to apply
 * @returns Processed lead with validation status
 * @throws {ValidationError} If validation fails
 *
 * @example
 * ```typescript
 * const result = await processLead(lead, rules);
 * if (result.isValid) {
 *   // Handle valid lead
 * }
 * ```
 */
async processLead(lead: Lead, rules: ValidationRule[]): Promise<ProcessedLead> {
  // Implementation
}
````

### README Structure

```markdown
# Component/Module Name

Brief description (1-2 sentences)

## Purpose

Why this component exists

## Usage

How to use with code examples

## API

Key methods/interfaces

## Dependencies

External dependencies

## Examples

Real-world usage examples
```

### Code Comments

```typescript
// Good: Explains why
// Use exponential backoff to avoid overwhelming the API
const delay = Math.pow(2, retryCount) * 1000;

// Bad: Explains what (obvious from code)
// Set delay to 2^retryCount * 1000
const delay = Math.pow(2, retryCount) * 1000;
```

## Best Practices

- Explain why, not what
- Keep comments up to date
- Use clear, concise language
- Provide code examples
- Document edge cases
- Include migration guides
- Update CHANGELOG
- Link to related docs

## Activation Keywords

Documentation, docs, README, JSDoc, comments, API docs, guide, documentation standards
