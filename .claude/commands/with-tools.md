CRITICAL: You MUST start by invoking @project-coordinator to oversee this ENTIRE task from start to finish. The project-coordinator maintains control throughout and coordinates ALL other agents.

Step 1: Invoke @project-coordinator FIRST
Immediately engage @project-coordinator with: "I'm invoking @project-coordinator to orchestrate this task: [task details]"

The project-coordinator will:
- Create a TASK FLOW CHECKLIST to track all agent invocations
- Assess requirements and determine task type (Feature/Bug/AI Feature)
- Coordinate agents in the MANDATORY sequence (no skipping allowed)
- Maintain persistent control until code-validation-auditor approves

Step 2: Mandatory Flow Patterns
The project-coordinator MUST follow these flows WITHOUT EXCEPTION:

**Feature Implementation Flow:**
@research-specialist → implementation agents → @typescript-expert → @unit-test-maintainer → @code-validation-auditor → AI_CHANGELOG

**Bug Fix Flow:**
implementation fix → @unit-test-maintainer → @code-validation-auditor → AI_CHANGELOG

**AI Feature Flow:**
@research-specialist → @langchain-nestjs-architect → @typescript-expert → @unit-test-maintainer → @code-validation-auditor → AI_CHANGELOG

⚠️ FLOW VIOLATIONS = IMMEDIATE STOP
- NEVER skip @research-specialist for new features
- NEVER skip @unit-test-maintainer after ANY implementation
- NEVER mark complete without @code-validation-auditor approval

Step 3: Sequential Thinking MCP Usage
Each agent should utilize the Sequential Thinking MCP (reduces bugs by ~58%) when:
1. Breaking down complex problems into steps
2. Analyzing code relationships and dependencies
3. Planning implementations with room for revision
4. Asking critical questions:
   - What parts of this code relate to the task?
   - What will break if I change this?
   - What do existing tests tell us?
   - Do I need to revise my approach?

Step 4: Agent Responsibilities & Reporting
Each agent MUST report back to @project-coordinator after completing their work:

- @research-specialist: "Research complete. Ready for implementation phase."
- @typescript-expert: "TypeScript review complete. Type safety verified."
- @langchain-nestjs-architect: "LangChain implementation complete. Ready for next phase."
- @unit-test-maintainer: "Test coverage complete. [X] tests created/updated."
- @code-validation-auditor: "Validation [PASSED/FAILED]. [Next steps]."

Step 5: Checkpoint Gates
The project-coordinator enforces these gates:
1. After implementation → "Have I engaged unit-test-maintainer?" If NO → STOP
2. Before completion → "Has code-validation-auditor approved?" If NO → CANNOT COMPLETE
3. For new features → "Did research-specialist provide findings?" If NO → GO BACK

Step 6: File Management Philosophy
ALL agents MUST follow these principles:
- UPDATE existing files - never create replacement files
- DELETE obsolete files when functionality is replaced
- Place tests in __tests__ folders alongside code
- Create individual AI_CHANGELOG entries in the folder

Remember: The project-coordinator NEVER releases control until the task is FULLY complete with validation approval and changelog entry.

TASK TO COMPLETE:
$ARGUMENTS

When we think we are done, run pnpm lint and fix the issues. Then run pnpm build and fix any issues. Then run pnpm test and resolve any issues.
We cannot accept code that has linting, type, or build errors.