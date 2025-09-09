# Work on Next TaskMaster Item

## COMMAND: Progress through TaskMaster tasks systematically

### WORKFLOW SEQUENCE:

1. **CHECK CURRENT STATE**
   - Run `task-master next` to identify the next available work item
   - Ensure clean git state: `git status` should show no uncommitted changes
   - If git is dirty, either commit, stash, or discard changes before proceeding
   - If subtasks exist for current task, work on the next pending/in-progress subtask
   - If all subtasks are done, evaluate if parent task meets TASK COMPLETION CRITERIA (see below)
   - If parent task is validated as done, move to the next task

2. **PRE-IMPLEMENTATION CHECK**
   - **CRITICAL**: Before implementing ANY functionality, search for existing implementations
   - Use codebase search to check if similar functionality already exists
   - Look for existing utilities, helpers, or components that could be reused
   - Check if the feature might already be partially implemented elsewhere
   - If duplication is found, refactor/extend existing code instead of creating new
   - Document any existing code that was discovered and reused

3. **RESEARCH CURRENT STANDARDS**
   - **MANDATORY**: Before implementation, use the research tool (research agent) to gather current information
   - Research areas to cover:
     - **Best Practices**: Current industry standards for the technology/pattern being implemented
     - **Library Versions**: Latest stable versions and any breaking changes since knowledge cutoff
     - **Integration Patterns**: How similar features are integrated in modern applications
     - **Security Considerations**: Current security best practices for the feature
     - **Performance Patterns**: Modern optimization techniques relevant to the task
   - Use research tool with context from:
     - Current task/subtask details (`--id` flag with task IDs)
     - Related project files (`--files` flag with relevant paths)
     - Project structure (`--tree` flag when architectural context needed)
   - Document research findings via `update-subtask` before starting implementation
   - If research reveals the approach needs adjustment, update the task details accordingly
   - **CRITICAL**: This step ensures implementations use current standards, not outdated patterns

4. **SUBTASK WORKFLOW**
   - Set subtask to `in-progress` when starting work
   - Verify no duplicate functionality exists (see PRE-IMPLEMENTATION CHECK)
   - Implement the subtask requirements fully
   - Write tests that cover the implementation
   - Run tests to ensure they pass
   - Mark subtask as `done` when implementation and basic tests are complete
   - Update parent task progress via `update-subtask` with findings

5. **TASK COMPLETION CRITERIA** (Stricter than subtasks)

   **A task can ONLY be marked `done` when ALL of the following are validated:**
   - ✅ All subtasks (if any) are marked as `done`
   - ✅ Full implementation matches task requirements
   - ✅ All tests are PASSING (`pnpm test` shows no failures)
   - ✅ Tests are RELEVANT (actually test the implemented functionality)
   - ✅ Tests are THOROUGH (comprehensive coverage of the feature)
   - ✅ Tests cover EDGE CASES (boundary conditions, empty inputs, nulls, extremes)
   - ✅ Tests cover MAIN CASES (primary use cases and happy paths)
   - ✅ Tests cover NEGATIVE CASES (error handling, invalid inputs, failures)
   - ✅ Code BUILDS successfully (`pnpm build` completes without errors)
   - ✅ Linting FULLY PASSES (`pnpm lint` runs with ZERO errors/warnings)
     - First run `pnpm lint:fix` to auto-fix what can be fixed
     - Then run `pnpm lint` to verify NO remaining issues
     - **CRITICAL**: Code cannot be committed if `pnpm lint` shows ANY issues

   **IMPORTANT**: Task-level `done` status requires VALIDATION that we're comfortable not revisiting this work. This is a higher bar than subtask completion.

6. **GIT COMMIT AFTER TASK COMPLETION**
   - **MANDATORY**: Once a task meets ALL completion criteria above, commit the changes
   - **PRE-COMMIT VALIDATION**: Before staging files, verify linting passes
     - Run `pnpm lint` one final time
     - If ANY issues are reported, fix them before proceeding
     - Only proceed to commit when `pnpm lint` shows ZERO issues
   - Stage all changes: `git add .`
   - Create a descriptive commit message that references the task ID and summarizes what was accomplished
   - Commit format: `feat(task-{id}): {brief description of what the task accomplished}`
   - Example: `feat(task-15): Implement user authentication with JWT tokens`
   - Include details about major components added, tests written, and any significant decisions
   - **ONE COMMIT PER TASK**: Each completed task should have its own commit (not per subtask)
   - This ensures clean git history and easy rollback if needed

7. **STATUS DEFINITIONS**
   - `pending`: Not started, may be waiting for dependencies
   - `in-progress`: Active work underway, partial implementation
   - `review`: Complete implementation awaiting peer review
   - `done` (subtask): Implementation complete with basic tests
   - `done` (task): FULLY VALIDATED per criteria above - production-ready
   - `deferred`: Postponed for later iteration
   - `cancelled`: No longer needed, requirements changed

8. **PROGRESSION RULES**
   - Start each task with a clean git state (no uncommitted changes)
   - Always check for existing functionality before implementing new code
   - Work on subtasks sequentially within a task
   - Don't move to next task until current task meets ALL completion criteria
   - If tests fail or are inadequate, stay on current task and improve them
      - THIS MEANS IF THE TESTS YOU WROTE FOR THIS CODE ARE FAILING, YOU CANNOT MOVE FORWARD UNTIL THEY ARE FIXED
      - This excludes tests that were already failing when you started the task
   - If `pnpm lint` reports ANY issues, stay on current task and fix them
      - THIS MEANS IF LINTING FAILS, YOU CANNOT COMMIT OR MOVE FORWARD UNTIL ALL ISSUES ARE RESOLVED
      - Run `pnpm lint:fix` first, then manually fix any remaining issues
   - Log all significant findings and issues via `update-subtask`
   - Commit changes ONLY after entire task is validated as done (not after subtasks)
   - When in doubt about completion criteria, err on the side of thoroughness

9. **CONTINUOUS WORKFLOW LOOP**
   - After completing and committing a task, AUTOMATICALLY continue to the next task
   - The workflow should be:
     1. Complete current task (including all validation and git commit)
     2. Run `task-master next` to get the next available task
     3. If a task is available, immediately begin the workflow from step 1 (CHECK CURRENT STATE)
     4. Continue this loop until `task-master next` shows no more available tasks
   - **NO MANUAL INTERVENTION**: Once started, keep progressing through all tasks
   - **STOP CONDITIONS**:
     - No more pending tasks with satisfied dependencies
     - Critical error that requires user intervention
     - Explicit user request to stop
   - **BETWEEN TASKS**: After each commit, briefly summarize what was completed before moving to the next task

### EXECUTION:
Start by running `task-master next` and follow the workflow above. After completing and committing each task, AUTOMATICALLY continue to the next available task without stopping. The goal is to work through ALL available tasks in a continuous session. Only stop when there are no more tasks available or a critical issue requires user intervention. Task validation is critical - a `done` task should not need revisiting. Remember: NO task can be committed if `pnpm lint` shows ANY issues - all linting must pass cleanly before proceeding.