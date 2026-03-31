# AGENTS.md

This file defines how agents should work in this repository. It focuses on project and task principles, not codebase inventory.

## Primary References

- For TypeScript design philosophy, interface shape, type usage, and abstraction rules, read `RULE.md` first and treat it as the primary programming reference.
- For design, layout, and visual language decisions, read `DESIGN.md` first and treat it as the primary design reference.

## 1. Think Before Coding

Do not guess through ambiguity.

- State assumptions explicitly before implementation when requirements, boundaries, or contracts are unclear.
- Surface competing interpretations instead of silently picking one.
- Prefer the structurally simpler design when it improves ownership clarity, change safety, and local reasoning.
- Stop and name the ambiguity before broad code motion if the task affects shared contracts, dependency direction, rendering behavior, or cross-team ownership.

## 2. Structural Simplicity

Optimize for maintainability, not cleverness or low line count.

- Add no feature or abstraction beyond the task.
- Introduce abstractions only when they provide present-day value: clearer boundaries, repeated logic removal, contract stability, ownership isolation, testability, or cleaner dependency flow.
- Do not merge distinct responsibilities just to reduce file count.
- Make invariants explicit, but avoid ceremony that does not improve current change safety.

## 3. Dependency-Linear Design

Keep dependencies explicit, narrow, and one-way.

- Prefer acyclic dependency flow and obvious ownership boundaries.
- Keep public surfaces small and hide internal implementation details.
- Put shared contracts, types, schemas, and validators in the lowest stable place that can be depended on safely.
- Prefer composition over inheritance.
- When parallel work is expected, define contracts and ownership before implementation spreads.

## 4. Promptable Boundaries and Minimal Context

Shape modules so a human or agent can work safely without scanning unrelated parts of the repository.

- Keep the number of files needed for one task as low as practical.
- Make each module's purpose, non-goals, dependencies, and verification path easy to discover.
- Avoid hidden side effects, broad implicit shared state, and convenience imports that cross boundaries.
- Favor explicit, machine-readable contracts where practical.

## 5. Surgical Changes

Touch only what the task requires.

- Do not bundle unrelated cleanup, formatting, or opportunistic refactors into the same diff.
- Match local style unless the task requires exposing or protecting a clearer boundary.
- Refactor only when it is the smallest safe way to isolate the change, preserve dependency direction, or reduce hidden coupling.
- Remove imports, symbols, and helpers made unused by your change, but do not delete unrelated dead code unless asked.

## 6. Contracts, Errors, and Diagnostics

Be explicit at boundaries and make failures actionable.

- Type public interfaces and validate external or unstable inputs.
- Do not hide failures behind silent fallbacks or broad success-shaped defaults.
- Respect the repository's existing error-handling conventions instead of inventing a parallel style.
- Make diagnostics specific enough to identify the failing module, command, composition, or stage when possible.

## 7. Goal-Driven and Verifiable Execution

No task is done until the outcome is verified.

- Turn requests into concrete checks before or during implementation.
- Match verification depth to change risk.
- Bug fixes should include regression coverage when practical.
- Treat architecture and boundary rules as enforceable constraints, not as advisory prose.
