**TYPESCRIPT TYPE AUDIT AND REMEDIATION**

This is a comprehensive type safety audit to eliminate `any` and `unknown` types from the codebase and establish robust type hygiene.

---

## IMMEDIATE ACTION: Invoke TypeScript Expert

@typescript-expert - I need you to conduct a comprehensive type audit and remediation of the codebase with the following objectives:

**PRIMARY MISSION:**
Eliminate ALL instances of `any` and minimize `unknown` types throughout the entire codebase, including tests, by replacing them with precise, meaningful types.

---

## AUDIT SCOPE AND METHODOLOGY

### Phase 1: Discovery and Analysis
1. **Comprehensive Scan**: Search for all instances of:
   - `any` type usage (including implicit any)
   - `unknown` type usage
   - `as any` type assertions
   - Missing return type annotations
   - Missing parameter type annotations
   - `@ts-ignore` and `@ts-expect-error` comments
   - Generic type parameters without constraints (e.g., `<T>` instead of `<T extends BaseType>`)

2. **Pattern Analysis**: Identify common patterns where `any`/`unknown` appear:
   - External library integrations
   - Dynamic data structures
   - Event handlers
   - Test mocks and fixtures
   - API responses
   - Error handling blocks
   - Legacy code sections

3. **Priority Classification**: Categorize findings by:
   - **CRITICAL**: Production code with `any` in public APIs or core business logic
   - **HIGH**: Internal functions and utilities using `any`
   - **MEDIUM**: Test files using `any` for mocks or fixtures
   - **LOW**: Development-only code or build scripts

### Phase 2: Type Resolution Strategy

For each `any` or `unknown` instance, apply this decision tree:

1. **Can we infer the type from usage?**
   - Analyze how the value is used downstream
   - Check for type guards or assertions nearby
   - Look for similar patterns with proper types

2. **Can we derive the type from external sources?**
   - Check library documentation for proper types
   - Look for community DefinitelyTyped packages
   - Examine runtime values in tests for shape

3. **Can we create a precise domain type?**
   - Define interfaces for object shapes
   - Create union types for known variants
   - Use discriminated unions for state modeling
   - Apply branded types for primitive validation

4. **Can we use generic constraints?**
   - Replace `any` with constrained generics
   - Use `extends` clauses to narrow possibilities
   - Apply conditional types for flexibility

5. **Is `unknown` truly necessary?**
   - Document WHY the type is unknown
   - Add runtime validation with type guards
   - Consider using Zod or similar for runtime typing

### Phase 3: Implementation Guidelines

**For Production Code:**
- NEVER use `any` without exhaustive justification
- Prefer specific types over broad ones
- Use utility types (Partial, Pick, Omit) for variations
- Create reusable type definitions in appropriate files
- Add JSDoc comments for complex types

**For Test Code:**
- Create properly typed mock factories
- Use `DeepPartial` for test fixtures when appropriate
- Type test data structures explicitly
- Don't use `any` for convenience - tests deserve type safety too
- Consider using libraries like `@faker-js/faker` with proper types

**For External Libraries:**
- Check for @types packages first
- Create ambient declarations if needed
- Use module augmentation for extending types
- Wrap untyped libraries with typed facades

### Phase 4: Special Attention Areas

**1. Event Handlers:**
- Replace `any` with specific event types from React/DOM
- Use proper handler signatures
- Type custom event payloads

**2. API Responses:**
- Generate types from OpenAPI/Swagger specs if available
- Create response DTOs matching backend contracts
- Use Zod schemas for runtime validation + type inference

**3. Dynamic Objects:**
- Use index signatures with constraints
- Apply mapped types for transformations
- Consider Records with specific key types

**4. Error Handling:**
- Create custom error classes with types
- Type catch block errors appropriately
- Use discriminated unions for error states

**5. Configuration Objects:**
- Define comprehensive config interfaces
- Use const assertions for literal types
- Apply satisfies operator for validation

---

## EXECUTION REQUIREMENTS

### Mandatory Actions:

1. **Generate Initial Report:**
   ```
   Type Audit Report:
   - Total `any` instances: X
   - Total `unknown` instances: Y
   - Files affected: Z
   - Critical violations: [list]
   ```

2. **Create Fix Priority List:**
   - Group by file/module
   - Estimate complexity per fix
   - Note any blocking dependencies

3. **Implement Fixes Systematically:**
   - Start with CRITICAL priority items
   - Update one module at a time
   - Run type checking after each change
   - Ensure no regression in type coverage

4. **Document Complex Types:**
   - Add JSDoc for non-obvious types
   - Explain type modeling decisions
   - Note any remaining `unknown` with justification

5. **Update Type Coverage Metrics:**
   - Before: X% typed, Y `any`, Z `unknown`
   - After: X% typed, Y `any`, Z `unknown`
   - Goal: 100% typed, 0 `any`, minimal `unknown`

### Quality Checks:

After remediation, verify:
- [ ] `pnpm tsc --noEmit` passes with no errors
- [ ] No new `any` types introduced
- [ ] All `unknown` types have validation
- [ ] Tests still pass with proper types
- [ ] No runtime behavior changes
- [ ] Type definitions are reusable and maintainable

### Special Considerations:

**For Monorepo Structure:**
- Check shared types in packages
- Ensure consistent typing across apps
- Update type exports in package.json

**For Next.js/React:**
- Use proper React.FC types sparingly (prefer explicit returns)
- Type page components with Next.js types
- Ensure proper typing for hooks and context

**For Prisma/Database:**
- Leverage Prisma's generated types
- Don't wrap with unnecessary abstractions
- Use Prisma's type utilities effectively

---

## REPORTING TEMPLATE

After completion, provide:

```
## Type Audit Completion Report

### Summary Statistics:
- Files analyzed: X
- Files modified: Y
- `any` eliminated: Z
- `unknown` replaced: W
- `unknown` justified: V
- Type coverage improved: from X% to Y%

### Critical Fixes Applied:
1. [Component/Module]: [Description of type improvement]
2. ...

### Remaining Considerations:
- [Any `unknown` that couldn't be resolved with justification]
- [Any complex types that need team review]
- [Suggestions for type architecture improvements]

### Validation Results:
- TypeScript compilation: ✓ PASSING
- Lint checks: ✓ PASSING
- Test suite: ✓ PASSING
- Build: ✓ SUCCESSFUL
```

---

## TASK TO COMPLETE:

$ARGUMENTS

---

**ENFORCEMENT NOTES:**

- This is NOT a suggestion - it's a mandate to achieve 100% type safety
- Every `any` is a bug waiting to happen
- Tests with `any` are not real tests - they're false confidence
- "It works" is not an excuse for poor typing
- Time invested in proper types pays dividends in prevented bugs

**Remember:** TypeScript's value is directly proportional to how strictly we use it. Half-typed code is barely better than JavaScript. Fully-typed code prevents entire categories of bugs.

@typescript-expert - Execute this audit with the rigor and precision it deserves. Report back with findings and proceed with remediation.
