IMPORTANT: You MUST start by invoking the project-coordinator agent to oversee this task. The project-coordinator is responsible for orchestrating all other agents and ensuring work stays on track.

Step 1: Invoke project-coordinator
Immediately engage the project-coordinator agent with the following task details. The project-coordinator will:
- Assess the requirements
- Determine which specialized agents are needed
- Coordinate their work in the proper sequence
- Ensure quality and scope control throughout

Step 2: Sequential Thinking MCP
The project-coordinator should ensure agents utilize the Sequential Thinking MCP (which reduces bug rates by ~58%) for:
1. Interpreting code functionality - determining what the code actually does
2. Asking important questions about the code:
   - What parts of this code are related to the issue at hand?
   - If I change the related code, are there any areas that will reference this code that will break?
   - Are there any tests for this code that can provide insights into why it exists?

Step 3: Agent Coordination
The project-coordinator will manage the following specialized agents as needed:
- research-specialist: For gathering factual information from official sources
- typescript-expert: For TypeScript type system optimization and best practices
- langchain-nestjs-architect: For AI/LLM features and LangChain integrations
- unit-test-maintainer: For test coverage and MSW mocking
- code-validation-auditor: For final quality validation

The project-coordinator ensures agents work together effectively and maintains focus on the specific task without scope creep.

TASK TO COMPLETE:
$ARGUMENTS`