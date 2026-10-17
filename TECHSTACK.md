ConsultPrep AI — Stack and Technology Specification
1. Project Context
ConsultPrep AI is a text-first, AI-powered pre-consultation intake platform developed to help patients organize their concerns before meeting with a healthcare professional.
Patients interact with an AI assistant that asks relevant follow-up questions, collects patient-reported information, and generates a structured consultation brief for clinician review.
The patient reviews and corrects the collected information before submitting it. Clinicians can then review, edit, and explicitly finalize the consultation brief.
Core principle: AI documents. Clinicians decide.
The system must not diagnose medical conditions, prescribe medication, recommend treatments, or replace professional medical judgment.
AI integration direction
The application will use the AMD Token Factory API directly for AI inference, subject to verification of the available endpoint, model access, authentication, and usage restrictions.
Developer 1 owns local RAG over curated project-owned guidance and synthetic examples, using a local embedding model. Do not add clinical-reference retrieval or a separate vector database in the initial package.
To preserve the API usage budget, do not send inference requests during development. Complete offline tests and handoff first, then make one synthetic smoke request. Report other live model behavior as unverified.
Evolus Business Agents will not be used in the initial implementation.
Before development, confirm the hackathon's eligibility requirements. If participating in a track that explicitly requires Evolus, a direct AMD API integration may not satisfy that track's requirements.
The initial implementation will prioritize a complete, secure, and testable patient-to-clinician workflow over unnecessary integrations or features.
2. Approved Technology Stack
Use the following stack as the project's default technical direction.
Frontend and Application Framework
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
Lucide icons
Responsibilities:
Patient-facing text chat interface.
Conversation history and intake progress.
Patient review and correction of collected information.
Consultation submission interface.
Clinician dashboard.
Consultation brief review and editing.
Responsive layouts for desktop and mobile.
Server-side API routes for AI inference, validation, and application operations.
Use strict TypeScript settings, reusable components, accessible interface patterns, and clear separation between presentation and business logic.
Keep the patient experience simple, understandable, and focused on completing the intake.
Do not introduce voice interaction into the initial implementation.
Database
PostgreSQL
Supabase as the managed PostgreSQL hosting platform.
Drizzle ORM for schema definition, queries, and migrations, unless an existing repository already has a suitable established database layer.
Database decision: Use PostgreSQL hosted on Supabase. Do not substitute SQLite, MongoDB, MySQL, or another database without explicit approval.
Use PostgreSQL for persistent application data, including:
Intake sessions.
Patient-reported responses.
Structured consultation briefs.
Source references linking brief fields to original responses.
Unknown, unanswered, unclear, and contradictory information.
Consultation case statuses.
Clinician edits and finalization records.
Relevant timestamps and audit events.
Design the schema around data integrity, explicit relationships, and traceability.
Do not store information as an unstructured blob when individual fields must be independently queried, validated, reviewed, or audited.
Use transactions when multiple related database writes must succeed or fail together.
Authentication and Authorization
Use an authentication solution compatible with Next.js and Supabase. Prefer Supabase Auth if it fits the implementation and deployment constraints.
Requirements:
Define distinct patient and clinician access boundaries.
Enforce authorization on the server, not merely by hiding interface elements.
Prevent users from accessing consultation cases they are not authorized to view.
Protect clinician-only actions, including case assignment, editing, and finalization.
Evaluate and implement appropriate Supabase Row Level Security (RLS) policies.
Do not assume that enabling authentication automatically protects every database table.
Never expose the Supabase service-role key or privileged database credentials to browser code.
Use synthetic accounts and patient records during development and demonstrations.
3. UI and Design Direction
Use Tailwind CSS for styling, shadcn/ui for accessible reusable components, and Lucide icons where appropriate.
The interface should be:
Clean, polished, and professional.
Appropriate for a healthcare setting.
Built around clear information hierarchy.
Readable, with comfortable spacing.
Responsive across mobile and desktop.
Focused on patient intake and clinician review.
Implement useful loading, empty, error, success, and retry states.
For the patient interface, prioritize a conversational experience over a long, complicated medical form. Ask relevant questions one at a time when appropriate, explain why information is requested when useful, and allow patients to skip questions or indicate uncertainty.
For the clinician interface, prioritize readability, editable structured information, source traceability, and clear distinctions between AI-generated drafts and clinician-finalized records.
Avoid generic AI landing-page aesthetics, excessive gradients, unnecessary glassmorphism, decorative animations, excessive cards, and redundant interface elements.
4. AI Model and AMD Token Factory Integration
Primary inference provider
Use the AMD Token Factory API directly as the application's AI inference provider.
Before implementation, verify:
The official API documentation.
The exact base URL and request endpoint.
The authentication mechanism.
The supported request and response formats.
The available model identifiers.
Whether the API supports OpenAI-compatible chat completions.
Whether structured JSON output or equivalent constrained generation is supported.
Rate limits, quotas, context limits, and usage restrictions.
Timeout behavior and error responses.
Whether the selected model and inference service satisfy the applicable hackathon requirements.
Do not assume that every model displayed in the model catalog is available through the same endpoint or has identical capabilities.
Model selection
Evaluate candidate models based on:
Instruction-following reliability.
Quality of follow-up questions.
Ability to preserve the patient's intended meaning.
Structured output consistency.
Ability to represent unknown and unanswered fields correctly.
Response latency.
Token usage and rate limits.
Safety behavior for urgent symptoms and requests for diagnosis.
Compatibility with the actual AMD API.
Select the model only after performing a small, repeatable evaluation using synthetic scenarios.
Do not select a model solely because it has the largest parameter count or appears first in the catalog.
Inference implementation
All AI requests must pass through server-side application code.
The browser must never call a privileged AMD endpoint directly or receive its API credentials.
Implement:
Request timeouts.
Bounded retries where appropriate.
Clear handling for rate limits and provider outages.
Validation of model responses.
Structured output parsing.
Handling for malformed or incomplete outputs.
Protection against duplicated submissions.
Safe fallback behavior when inference is unavailable.
Appropriate request and token limits.
Logging that avoids unnecessary sensitive information.
Do not silently switch to an unrelated commercial AI provider if the AMD endpoint fails.
If inference fails, preserve existing patient responses and allow a safe retry or manual completion where appropriate.
Do not assume that OpenAI-compatible request formats guarantee identical behavior across models.
Medical safety requirements
The model must operate as an intake assistant, not a diagnostic or treatment engine.
It must:
Ask relevant, non-leading follow-up questions.
Collect patient-reported information without inventing missing details.
Preserve the distinction between patient statements and AI-generated organization.
Avoid diagnosing, prescribing, or recommending treatments.
Avoid presenting speculation as a medical fact.
Handle requests for diagnosis by explaining that a clinician must assess the concern.
Recognize potential urgent symptoms and interrupt routine intake when appropriate.
Direct users with potentially urgent symptoms toward appropriate urgent or emergency care rather than continuing a routine questionnaire.
Avoid implying that the application replaces emergency services or professional medical evaluation.
Urgency handling must not depend solely on an unconstrained model response. Implement deterministic safety checks for clearly identified high-risk scenarios, with conservative handling when classification is uncertain.
5. Backend Architecture and API Design
Use Next.js server-side API routes or route handlers for application operations.
Responsibilities include:
Authentication and authorization.
AMD API requests.
Conversation and intake state management.
Input and output validation.
Consultation brief generation.
Patient confirmation.
Database persistence.
Submission processing.
Clinician review and finalization.
Error handling and audit events.
Keep provider-specific code behind a dedicated AI service interface. This allows the AMD integration to be tested independently and changed later with explicit approval.
Separate the following concerns:
Conversation orchestration: Determines the next appropriate intake question and maintains intake state.
AI inference: Sends requests to the verified AMD endpoint and receives model responses.
Validation: Checks model output against defined runtime schemas.
Persistence: Stores validated records and relationships in PostgreSQL.
Safety: Handles high-risk scenarios and blocks inappropriate routine continuation.
Authorization: Determines who can view, submit, edit, or finalize a case.
Do not allow the model to directly execute privileged database operations.
Do not treat a model-generated message as evidence that a database write, submission, or other operation succeeded.
The application must independently verify the result of each important operation.
6. Database Access, ORM, and Validation
Use Drizzle ORM with Supabase PostgreSQL unless repository inspection identifies a compelling reason to preserve an existing database layer.
Requirements:
Define explicit database schemas.
Keep migrations version-controlled.
Avoid destructive migrations without approval.
Use parameterized queries or safe ORM methods.
Validate inputs before database writes.
Use transactions for related writes.
Preserve original patient responses independently of generated summaries.
Avoid logging sensitive information unnecessarily.
Avoid introducing competing database access libraries without a clear technical need.
Use Zod for runtime validation of:
API request bodies.
Intake data.
AI-generated consultation briefs.
Source references.
Environment variables.
Consultation status transitions.
Clinician edits.
Database-bound inputs.
Structured AI output.
TypeScript types alone are insufficient for validating untrusted runtime data.
Invalid AI output must not be persisted as a valid consultation brief. Retry or recover safely within bounded limits, and preserve the original patient statements regardless of generation failures.
7. Core Data Model
Plan a relational schema around the following conceptual entities. Refine it after inspecting the existing repository and confirming authentication and ownership requirements.
IntakeSession
Represents an individual intake session.
Possible fields:
ID.
Patient or session owner reference.
Session status.
Created timestamp.
Updated timestamp.
Submitted timestamp, if applicable.
PatientResponse
Stores patient-provided statements and answers.
Possible fields:
ID.
Intake session reference.
Original response text.
Related question or conversation reference.
Sequence number.
Timestamp.
Original patient statements must remain distinguishable from AI-generated interpretations. Preserve the original wording even when the brief uses a normalized representation.
ConsultationBrief
Stores the structured AI-generated draft.
Possible fields:
ID.
Intake session reference.
Structured brief data.
Generation status.
Schema version.
Created timestamp.
Updated timestamp.
A generated draft must never be considered clinician-finalized merely because generation succeeded.
BriefSourceReference
Links individual brief fields to the original patient statements supporting them.
Possible fields:
ID.
Brief reference.
Source response reference.
Field identifier.
Relevant source excerpt, if necessary.
References must accurately represent the source. Do not imply that a statement supports a fact the patient did not actually report.
ConsultationCase
Represents a submitted case for clinician review.
Possible fields:
ID.
Intake session reference.
Brief reference.
Case status.
Assigned clinician reference, if supported.
Submission timestamp.
Finalization timestamp, if applicable.
ClinicianRevision
Records clinician changes when revision history is required.
Possible fields:
ID.
Brief reference.
Clinician reference.
Changed field.
Previous value.
New value.
Timestamp.
Protect revision records with appropriate access controls. Store sensitive revision details only when necessary for the application's audit and clinical review requirements.
Information states
The data model must distinguish at least the following states where applicable:
Reported by the patient.
Explicitly denied by the patient.
Unknown.
Not answered.
Not asked.
Unclear.
Contradictory.
AI-generated interpretation.
Clinician-confirmed or clinician-edited.
Clinician-finalized.
Do not silently convert missing information into a negative answer.
8. Consultation Workflow
Implement the following end-to-end workflow:
The patient starts an intake session.
The assistant collects the main concern in the patient's own words.
The application asks relevant follow-up questions.
Patient responses are validated and saved.
The system identifies unknown, unanswered, unclear, and contradictory information.
The AI generates a structured consultation brief.
The application validates the brief and links supported fields to their source responses.
The patient reviews the brief and can correct inaccurate information.
The patient confirms and submits the intake.
The application verifies successful persistence and creates or updates the consultation case.
An authorized clinician reviews the submitted brief.
The clinician may edit the draft and explicitly finalize it.
The application records the appropriate status changes and finalization timestamp.
The interface must communicate whether a brief is a draft, awaiting patient confirmation, submitted for clinician review, under review, or finalized.
The exact status names may be refined during implementation, but transitions must be explicit and validated on the server.
Do not mark a case as submitted until the required database operations succeed. Do not mark a brief as finalized until an authorized clinician performs that action.
9. Testing
Use:
Vitest for unit tests where appropriate.
React Testing Library for interface behavior.
Playwright for end-to-end tests.
Prioritize tests for:
Intake state management.
AI request and response handling.
Structured output validation.
Unknown and unanswered fields.
Contradictory responses.
Source traceability.
Patient corrections.
Authorization and ownership boundaries.
Consultation submission.
Duplicate submission prevention.
Clinician editing and finalization.
Urgent-symptom handling.
Model endpoint failures.
Rate limits and timeouts.
Malformed AI responses.
Database transaction failures.
Authentication failures.
Use synthetic patient data exclusively in development, testing, and hackathon demonstrations. Do not use real patient records or identifiable health information.
10. Deployment and Repository
Use:
Docker for containerization.
GitHub for source control and the required public repository.
A deployment platform compatible with Next.js, server-side environment variables, and Supabase PostgreSQL.
Verify the hackathon's hosting and repository requirements before selecting the final deployment provider.
The README must document:
Project overview.
Prerequisites.
Installation.
Environment variable configuration.
AMD Token Factory API setup.
Model selection and configuration.
Database setup and migrations.
Authentication configuration.
Local development.
Docker execution.
Testing.
Deployment.
Known limitations.
Synthetic demonstration data.
Never commit API keys, credentials, real .env files containing secrets, or patient information.
Before making the repository public, inspect its history and current contents for exposed credentials or sensitive data.
11. Required Environment Configuration
Create a .env.example file containing placeholders for required settings.
Proposed variables include:
DATABASE_URL=
DIRECT_URL=

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

SUPABASE_SERVICE_ROLE_KEY=

AMD_API_BASE_URL=
AMD_API_KEY=
AMD_MODEL=
AMD_API_TIMEOUT_MS=

APP_URL=
These are proposed conventions, not claims about the exact variable names or endpoint structure required by AMD Token Factory.
Adjust them after verifying the actual AMD API documentation.
Requirements:
Keep AMD API credentials server-side.
Never put secrets in variables prefixed with NEXT_PUBLIC_.
Include only Supabase variables needed by the selected authentication and database configuration.
Use a service-role key only when privileged server-side operations are genuinely necessary.
Do not expose privileged database credentials to browser code.
Validate required environment variables at application startup.
Never commit real credential values to GitHub.
12. High-Level Architecture
The intended request flow is:
Patient browser
→ Next.js application
→ Server-side application API
→ Authentication and authorization checks
→ Intake state and safety validation
→ AMD Token Factory API
→ Model response validation
→ Structured consultation brief and source references
→ Patient review and confirmation
→ Verified server-side submission
→ Supabase PostgreSQL
→ Clinician review interface
→ Authorized clinician edits and explicit finalization
The exact orchestration design may change after verifying the AMD API's capabilities.
The application must retain control over authorization, safety checks, validation, database writes, and case status transitions.
A model-generated response must never be treated as proof that an operation succeeded.
13. Core Engineering Principles
Use TypeScript consistently.
Validate all untrusted external inputs.
Keep privileged credentials server-side.
Use Supabase-hosted PostgreSQL as the persistent database.
Preserve original patient responses.
Keep AI-generated content distinct from clinician-confirmed content.
Validate model outputs before persistence.
Never invent missing patient information.
Enforce server-side authorization and applicable database RLS policies.
Handle model and database failures explicitly.
Use synthetic patient records for all demonstrations.
Avoid unnecessary services, libraries, and infrastructure.
Do not claim that an integration is complete until it has been tested.
Do not make destructive database changes without approval.
Do not implement diagnostic or treatment recommendations.
Do not introduce voice interaction into the initial implementation.
14. Implementation Sequence
Follow this sequence:
Phase 1 — Repository and requirements discovery
Inspect the existing repository, identify confirmed requirements, check hackathon rules, and list unresolved assumptions.
Phase 2 — AMD API verification
Verify the endpoint, authentication, supported models, request format, quotas, and model availability. Perform a minimal inference test using synthetic content.
Phase 3 — Application foundation
Establish the Next.js project structure, TypeScript conventions, styling system, linting, and development workflow.
Phase 4 — Database and authentication
Configure Supabase PostgreSQL, select the connection strategy, define authentication and authorization requirements, create the initial schema, and establish migrations.
Phase 5 — Intake contract and safety design
Define the intake data contract, consultation brief schema, information states, source-reference structure, and safety behavior using TypeScript and Zod.
Phase 6 — AI service integration
Implement the server-side AMD client, request handling, output validation, timeouts, error handling, and model evaluation tests.
Phase 7 — Patient intake experience
Implement the conversational interface, intake state management, follow-up questions, progress, and persistence of original patient responses.
Phase 8 — Brief generation and patient review
Generate validated consultation briefs, preserve source traceability, allow corrections, and implement patient confirmation.
Phase 9 — Submission and case management
Implement reliable submission handling, duplicate prevention, database transactions where appropriate, and explicit status transitions.
Phase 10 — Clinician dashboard
Implement authorized case review, editing, revision history where required, and explicit finalization.
Phase 11 — Security, safety, and testing
Complete authorization checks, RLS policies, urgent-symptom handling, failure scenarios, and automated testing.
Phase 12 — Deployment and demonstration
Containerize the application, configure deployment, document setup, verify the public repository, and prepare the synthetic-data demonstration.
15. Instructions to the AI Coding Assistant
Act as a senior full-stack engineer and system architect.
Before writing code:
Inspect the existing repository if one exists.
Identify confirmed requirements and unresolved assumptions.
Verify the AMD Token Factory API documentation and actual endpoint configuration.
Confirm model availability and complete a minimal inference test.
Propose a clear directory structure and implementation plan.
Confirm the Supabase connection and migration strategy.
Identify authentication, authorization, data-integrity, and medical safety concerns.
Verify hackathon eligibility requirements before treating the chosen architecture as compliant.
Do not generate the entire application in one uncontrolled step.
Build incrementally, test each stage, and keep the application runnable.
Do not substitute technologies without approval. Do not invent API capabilities. Do not hardcode secrets. Do not use real patient data. Do not implement diagnostic or treatment recommendations.
Prioritize a complete, testable patient-to-clinician workflow over unnecessary features.
Immediate objective: Establish the project foundation using Next.js, TypeScript, Supabase PostgreSQL, and the verified AMD Token Factory API. Begin implementation only after the infrastructure assumptions and initial architecture have been checked.
Keep the implementation simple, secure, demonstrable, and maintainable.


