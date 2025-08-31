# AI_RESEARCH

This directory contains research findings documented by the **research-specialist** agent.

## Purpose

The AI_RESEARCH folder serves as a knowledge base for:
- Official documentation findings
- API specifications and best practices
- Technical research on frameworks and libraries
- Version-specific information
- Identified gotchas and edge cases

## Process

1. **research-specialist** checks here first before new research
2. Conducts web searches for current information
3. Cross-references with existing research
4. Documents all findings with proper citations
5. Notes contradictions or updates to previous research

## File Format

Files follow the naming convention: `YYYY-MM-DD-topic-name.md`

Each research document contains:
- Date and requesting agent/user
- Summary of findings
- References to prior research
- Detailed current findings with sources
- Key takeaways for implementation
- All consulted sources with versions

## Usage by Other Agents

- **All agents** should check relevant research before implementation
- **project-coordinator** reviews when planning new tasks
- **code-validation-auditor** verifies implementations match researched specs
- **langchain-nestjs-architect** references AI/LLM best practices
- **typescript-expert** checks for documented type patterns
- **unit-test-maintainer** looks for testing strategies

## Handling Outdated Information

When research contradicts previous findings:
- New file created noting what it updates/contradicts
- Both old and new information documented
- Changes explained (version updates, deprecations, etc.)
- Requesting agent alerted about contradictions

## Important

This is not static documentation - it evolves as we learn. Always cross-reference with current sources.
