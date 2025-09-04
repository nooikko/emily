CRITICAL: You MUST start by invoking @project-coordinator to oversee this ENTIRE task from start to finish. The project-coordinator maintains control throughout and coordinates ALL other agents.

Step 1: Invoke @project-coordinator FIRST
Immediately engage @project-coordinator with: "I'm invoking @project-coordinator to orchestrate this task: [task details]"

The project-coordinator will:
- Create a TASK FLOW CHECKLIST to track all agent invocations
- Assess requirements and determine task type (Feature/Bug/AI Feature)
- Coordinate agents in the MANDATORY sequence (no skipping allowed)
- Maintain persistent control until code-validation-auditor approves

**CRITICAL EXECUTION DIRECTIVE FOR PROJECT-COORDINATOR:**
You are the ORCHESTRATOR, not a passive observer. When an agent reports back:
1. ACKNOWLEDGE the report briefly
2. IMMEDIATELY invoke the next agent in the flow
3. DO NOT ask for permission to continue
4. DO NOT wait for user confirmation
5. CONTINUE executing until the ENTIRE task is complete

The flow is a PIPELINE, not a series of stop points. Each agent's completion triggers the next invocation automatically.

**❌ WRONG (DO NOT DO THIS):**
- Agent reports: "TypeScript review complete"
- Coordinator responds: "Great! TypeScript review is done. The next step would be to invoke unit-test-maintainer."
- [STOPS AND WAITS]

**✅ CORRECT (DO THIS):**
- Agent reports: "TypeScript review complete"
- Coordinator responds: "TypeScript review confirmed. Proceeding with test coverage. @unit-test-maintainer, please create/update tests for..."
- [CONTINUES IMMEDIATELY]

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

Step 4: Agent Responsibilities & Continuous Execution
Each agent MUST report back to @project-coordinator after completing their work.
**CRITICAL: The project-coordinator MUST IMMEDIATELY CONTINUE with the next agent in the flow after receiving each report.**

Agent Reports:
- @research-specialist: "Research complete. Ready for implementation phase."
  → Coordinator MUST IMMEDIATELY invoke next agent in flow
- @typescript-expert: "TypeScript review complete. Type safety verified."
  → Coordinator MUST IMMEDIATELY invoke @unit-test-maintainer
- @langchain-nestjs-architect: "LangChain implementation complete. Ready for next phase."
  → Coordinator MUST IMMEDIATELY invoke @typescript-expert
- @unit-test-maintainer: "Test coverage complete. [X] tests created/updated."
  → Coordinator MUST IMMEDIATELY invoke @code-validation-auditor
- @code-validation-auditor: "Validation [PASSED/FAILED]. [Next steps]."
  → Coordinator MUST create AI_CHANGELOG entry if PASSED or fix issues if FAILED

**DO NOT STOP**: The coordinator must treat these reports as checkpoints, not endpoints. Continue orchestrating until the ENTIRE flow is complete.

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

Remember:
- The project-coordinator NEVER releases control until the task is FULLY complete with validation approval and changelog entry.
- The coordinator MUST CONTINUE EXECUTING after each agent reports back - do not stop and ask what to do next.
- Agent reports are CHECKPOINTS in an ongoing flow, not stopping points.
- The entire flow must run TO COMPLETION without pausing for user input unless explicitly blocked.

TASK TO COMPLETE:
$ARGUMENTS

When we think we are done, run pnpm lint and fix the issues. Then run pnpm build and fix any issues. Then run pnpm test and resolve any issues.
We cannot accept code that has linting, type, or build errors.

---

**CRITICAL SECTION FOR CLAUDE CODE RUNNER (NOT AGENTS):**

If you detect that the proper agent flow was NOT followed:

1. **IMMEDIATE VIOLATION REPORT**:
   - State: "🚨 AGENT FLOW VIOLATION DETECTED: The project-coordinator failed to properly orchestrate agents."
   - List which agents were skipped or which violations occurred

2. **MANDATORY AUDIT INVOCATION**:
   - You MUST invoke @code-validation-auditor with: "Emergency audit requested due to flow violations. The following agents were not properly engaged: [list]"
   - The auditor will perform a comprehensive review to identify:
     * Code quality issues introduced
     * Missing test coverage
     * Type safety violations
     * Architectural problems
     * Build/startup failures

3. **VIOLATION CONSEQUENCES**:
   - The task CANNOT be considered complete
   - All violations must be documented
   - The proper flow must be re-run from the beginning
   - Any code changes made without proper orchestration are suspect

**Signs of Flow Violation:**
- Project coordinator wrote code directly
- Unit tests were not created/updated
- Research was skipped for new features
- Validation was not performed
- Agents did not report back to coordinator
- The application fails to build or start

**YOUR RESPONSIBILITY**: As the code runner, you are the last line of defense. If you see violations, you MUST report them and invoke the auditor. Do not let improperly orchestrated code pass through.