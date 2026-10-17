# ConsultPrep AI — Frontend Agent Instructions

Before performing any task in this frontend repository:

1. Read `Context.md` completely.
2. Inspect the current repository and existing implementation before proposing or making changes.
3. Treat the actual repository as the source of truth for the frontend framework, dependencies, routing, and project structure.
4. Do not migrate frameworks, replace the existing architecture, or introduce a new design system unless explicitly requested.
5. Preserve existing working functionality.
6. Work only within the responsibilities assigned to Member 3 unless explicitly asked otherwise.
7. Do not implement or replace:
   - AI inference infrastructure
   - AMD Token Factory integration
   - backend APIs
   - database schemas or persistence
   - authentication or authorization infrastructure
8. When backend or AI changes are required, document the dependency or defect instead of creating a competing implementation.
9. Use synthetic data only. Never introduce real patient information.
10. Never describe AI-generated content as a diagnosis, medically verified result, or clinician-approved information unless the application state explicitly supports that distinction.
11. Before making significant code changes, explain:
    - what you inspected,
    - what you found,
    - what files you intend to modify,
    - and why.
12. Keep changes focused and incremental.
13. After implementation, run the relevant available checks from `package.json`, such as linting, type checking, tests, or build commands.
14. Never claim something works unless it was actually verified.
15. Report blocked, mocked, untested, or unavailable integrations explicitly.

## Working Style

For substantial tasks, follow this sequence:

1. Inspect
2. Assess
3. Plan
4. Implement
5. Verify
6. Report

Do not combine discovery, major redesign, and large-scale implementation into one uncontrolled change.

When the task is an audit or assessment, do not modify code unless the prompt explicitly requests implementation.