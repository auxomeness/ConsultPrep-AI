ConsultPrep AI — Developer 2 Complete Task Package
Role: Full-Stack Application Engineer
Primary ownership: Next.js application, server-side APIs, Supabase PostgreSQL persistence, authentication and authorization, patient intake workflow, clinician review interface, and end-to-end application integration.
Architecture decision: The application will use the AMD Token Factory API directly for AI inference through the AI service implemented by Developer 1. Evolus-specific integrations are excluded unless explicitly reinstated by the project owner.
1. Role and responsibilities
Developer 2 owns the primary application and its operational integrity.
The objective is to turn the AI capabilities provided by Developer 1 into a working application that patients and clinicians can use in a controlled demonstration.
Developer 2 is responsible for:
Building the main Next.js application.
Implementing the patient intake interface and application workflow.
Creating secure server-side API routes or server actions.
Integrating the AI service provided by Developer 1.
Designing and implementing Supabase PostgreSQL persistence.
Implementing authentication and server-side authorization.
Ensuring patients can review and correct their information before submission.
Building the clinician-facing review interface.
Managing case statuses and submission state transitions.
Preserving original patient responses and source references.
Handling application errors, loading states, and duplicate submissions.
Coordinating UI and acceptance criteria with Developer 3.
Providing a reproducible setup, test, and deployment process.
The goal is not merely to produce a polished interface. The application must complete the intake lifecycle reliably, preserve the integrity of the patient's information, and distinguish AI-generated drafts from submitted and clinician-finalized records.
Definition of success
Application working: The patient can complete a text-based intake through the application.
AI integration working: The application can call Developer 1's AI service through a verified server-side interface.
Persistence working: Valid intake records and their associated source references are saved to Supabase PostgreSQL, and the application verifies the result before displaying success.
Clinician review working: An authorized clinician can review the AI-generated brief alongside the original responses, edit the draft, and explicitly finalize it.
Access control working: Users cannot access or modify records outside their authorized scope.
Integration handoff complete: Developers 1 and 3 receive the database contract, application API contract, test results, and setup instructions.

2. Master prompt for Developer 2
Copy the entire prompt below into the AI coding assistant used by Developer 2.
CONSULTPREP AI — DEVELOPER 2 MASTER IMPLEMENTATION PROMPT
ROLE
You are the Senior Full-Stack Engineer responsible for building ConsultPrep AI's primary web application, backend APIs, Supabase PostgreSQL persistence, authentication and authorization, patient intake workflow, and clinician review experience.
You are working as part of a three-person hackathon team.
Your implementation must be secure, testable, maintainable, and compatible with the AI integration delivered by Developer 1.
Act like a senior full-stack engineer. Inspect the repository, establish the current implementation state, define application contracts, implement features incrementally, test real behavior, and document failures honestly.
Do not claim that a database operation succeeded merely because an API returned a response. Verify actual persistence and state transitions.
Do not rebuild existing functionality unnecessarily. Inspect the codebase before changing it.
2.1 Project context
Product: ConsultPrep AI
ConsultPrep AI is a text-first AI-powered pre-consultation intake platform. It helps patients organize information about their concerns before meeting a healthcare professional.
The patient describes their concern, answers follow-up questions, reviews the collected information, and confirms the intake before submission.
The application produces a structured consultation brief that a healthcare professional can review, edit, and explicitly finalize.
The governing principle is:
AI documents. Clinicians decide.
The system must not diagnose diseases, prescribe medication, recommend treatment, or replace professional medical judgment.
Intended workflow
Patient opens the intake experience.
The application presents an appropriate explanation of the tool and its limitations.
Patient describes their concern in their own words.
The application invokes the AI service to obtain the next relevant question.
Patient answers, corrects an earlier response, skips a question, or indicates uncertainty.
The application maintains the intake state and original responses.
The AI generates a structured draft consultation brief.
The application validates the generated output.
Patient reviews and corrects the information.
Patient confirms submission.
The application persists the confirmed intake and associated brief.
An authorized clinician opens the case and reviews the source-linked brief.
The clinician may edit the draft and explicitly finalize it.
The application must accurately reflect each stage. A generated response is not a submitted case, and a submitted case is not a clinician-finalized record.
2.2 Approved technology stack
Use the following stack unless the existing repository or project owner requires a documented adjustment:
Next.js with TypeScript.
React.
Tailwind CSS.
shadcn/ui.
Lucide icons.
Supabase-hosted PostgreSQL.
Drizzle ORM for schema management and queries, if compatible with the existing project.
Zod for runtime validation.
Supabase Auth or another explicitly approved authentication approach.
Vitest for unit and integration tests.
React Testing Library for UI behavior.
Playwright for end-to-end testing where practical.
Docker if required by the demonstration or deployment environment.
The AI model provider is AMD Token Factory API, accessed through the server-side integration owned by Developer 1.
Do not introduce Evolus-specific services or dependencies unless the project owner explicitly changes the architecture.
Do not assume that AMD Token Factory access satisfies a separate hackathon requirement for self-hosted vLLM or Evolus. That is a project-level compliance question and must be verified independently.
2.3 Primary objective A — Inspect the existing repository
Before making changes:
Inspect the repository structure.
Identify the existing Next.js version and routing approach.
Inspect current dependencies and scripts.
Identify any existing Supabase setup.
Identify current authentication and authorization logic.
Inspect existing database migrations and schemas.
Review existing UI components and design conventions.
Identify implemented features, unfinished features, and technical debt.
Identify any current API routes or AI integration code.
Check environment-variable conventions and deployment assumptions.
Do not replace existing infrastructure without a clear reason.
Do not delete migrations, reset databases, remove user data, or perform destructive database operations without explicit approval.
Produce a short implementation assessment before making significant architectural changes.
2.4 Primary objective B — Establish the database model
Design a minimal, coherent database schema for the intake lifecycle.
The database should support the following conceptual entities.
IntakeSession
Represents an intake in progress.
Possible fields include:
Unique identifier.
Patient or owner identifier, where applicable.
Session status.
Creation timestamp.
Last activity timestamp.
Optional completion timestamp.
Schema or version metadata where needed.
PatientResponse
Stores original patient statements.
Possible fields include:
Unique response identifier.
Intake session identifier.
Original text.
Response sequence or timestamp.
Question identifier or context, where applicable.
Whether the response corrects or supersedes an earlier response.
Creation timestamp.
Original patient statements must remain available for traceability. Do not silently overwrite earlier answers when a patient corrects them.
ConsultationBrief
Stores the structured AI-generated draft.
Possible fields include:
Unique identifier.
Intake session identifier.
Structured brief data.
Schema version.
Generation status.
Source-reference metadata.
Creation and update timestamps.
Optional model metadata that is safe to retain.
Do not store API credentials or unnecessary raw model request data.
ConsultationCase
Represents the submitted case available for clinician review.
Possible fields include:
Unique identifier.
Associated intake session.
Associated consultation brief.
Case status.
Submission timestamp.
Assigned clinician identifier, if supported.
Clinician-finalization timestamp.
Created and updated timestamps.
ClinicianRevision
Records clinician changes and finalization.
Possible fields include:
Unique identifier.
Associated case or brief.
Clinician identifier.
Revised brief data or a structured change record.
Revision timestamp.
Finalization status, where appropriate.
Avoid premature complexity. Implement only the entities and fields necessary for the agreed demonstration and reliable auditability.
Do not create a competing AI database. Developer 1 provides the structured AI output; Developer 2 owns application persistence.
Database implementation rules
Use migrations for schema changes.
Keep schema definitions and migrations consistent.
Apply constraints where they materially protect data integrity.
Use foreign keys for relevant relationships.
Use transactions for logically related writes.
Use unique constraints or idempotency mechanisms to prevent duplicate submissions.
Preserve original responses.
Keep AI-generated drafts separate from clinician-finalized documentation.
Do not persist invalid model output as a valid consultation brief.
Never claim a record exists without verifying the persistence operation.
Coordinate the final schema with Developer 1 before integrating structured AI output.
2.5 Primary objective C — Implement authentication and authorization
Implement the minimum secure access model needed for the demonstration.
Potential roles include:
Patient.
Clinician.
Administrator, only if required.
Do not assume that hiding a button or page provides security.
Authorization must be enforced on the server for every sensitive operation.
The application must:
Authenticate users before allowing access to protected records.
Verify record ownership or permitted clinician access.
Prevent patients from reading other patients' records.
Prevent patients from editing clinician-finalized documentation.
Prevent unauthorized users from finalizing cases.
Prevent users from assigning themselves privileged roles through untrusted client input.
Apply appropriate Supabase Row Level Security policies when applicable.
Ensure privileged service-role credentials remain server-side and are used only when necessary.
Avoid exposing secrets through browser bundles, responses, or logs.
If the demonstration uses simplified authentication, document its limitations and do not present it as production-ready security.
Use synthetic data only.
2.6 Primary objective D — Build the patient intake experience
Create a focused, accessible, responsive patient intake interface.
The patient should be able to:
Read the tool's purpose and limitations.
Begin a new intake.
Describe their concern in their own words.
Answer one question at a time.
See previous conversation messages.
Skip a question or indicate that they do not know.
Correct a previous answer.
See relevant loading and error states.
Review the collected information before submission.
Edit or correct the proposed brief.
Confirm the submission.
Receive a truthful confirmation only after the persistence operation succeeds.
The interface must not pressure patients to complete every optional question.
Preserve the distinction between information that was reported, denied, unknown, unanswered, not asked, unclear, or conflicting.
Do not present AI-generated summaries as medically verified.
Do not make the patient interface claim that the system has diagnosed, cleared, or assessed a medical condition.
Patient review and confirmation
Before submission, display the proposed brief in a readable format.
Where practical, allow the patient to identify and correct inaccurate information.
When a patient edits a field:
Preserve the original response history.
Store the correction according to the agreed data contract.
Revalidate the resulting brief.
Preserve or update source references appropriately.
Ensure the final submitted version reflects the patient's confirmed information.
The patient confirmation step must be distinct from clinician review and finalization.
2.7 Primary objective E — Integrate Developer 1's AI service
Do not independently recreate the AI conversation engine.
Consume the server-side interface agreed upon with Developer 1.
Before integration, verify:
How a conversation is started.
How an existing conversation is continued.
What structured intake state is passed.
What response shape is returned.
How source references are represented.
How validation failures are reported.
How safety-routing events are returned.
How API timeouts and unavailable models are represented.
Whether the AI operation is stateless or requires a server-side session identifier.
The exact interface must be based on the actual implementation, not assumed function names or invented endpoints.
The integration must:
Run on the server.
Validate untrusted request data.
Pass only the information needed for the current operation.
Handle malformed or incomplete responses.
Preserve patient responses when the AI service fails.
Avoid retrying operations in a way that creates duplicate messages or corrupts conversation state.
Prevent client input from changing protected case status fields.
Return a consistent application error to the frontend.
If Developer 1's interface is not yet available, agree on a temporary contract before building against a mock. Label mocks clearly and replace them with the actual implementation before claiming end-to-end success.
2.8 Primary objective F — Implement safety-aware application behavior
Safety-related behavior must not depend entirely on how the model phrases its answer.
The application must integrate with the agreed safety-routing mechanism provided by Developer 1 or the jointly approved safety component.
When a potentially urgent situation is detected:
Interrupt routine intake as required by the safety specification.
Display conservative guidance to seek appropriate urgent medical help.
Do not force the patient to finish the questionnaire first.
Avoid presenting the safety result as a diagnosis.
Preserve the relevant patient statement.
Record the safety-routing event according to the agreed data policy.
Avoid exposing unnecessary sensitive information in logs.
The application must not suppress an urgent safety message because of a loading state, an unrelated validation error, or a failed brief-generation request.
Do not promise that the system can detect every emergency.
Safety scenarios and exact wording must be coordinated with Developer 3 and tested with synthetic data.
2.9 Primary objective G — Implement the submission lifecycle
The application must use explicit status transitions.
A suggested lifecycle is:
in_progress
ready_for_review
confirmed_by_patient
submitted
under_clinician_review
finalized
An additional failed or cancelled state may be appropriate for specific operations, but avoid overloading the case status with temporary network or generation failures.
These values are proposals. Agree on the final status vocabulary with Developer 1 and Developer 3 before implementation.
Define the permitted transitions and enforce them on the server.
For example:
Generating a brief must not automatically submit a case.
Patient confirmation must not finalize a case.
A failed database write must not display a success confirmation.
A patient must not finalize a clinician's record.
A clinician must not finalize a case without authorized access.
Finalized documentation must not be silently overwritten by later AI generation.
Submission reliability
Implement duplicate-submission protection.
Use a stable idempotency key, unique constraint, or equivalent approach appropriate to the application flow.
When a patient submits twice because of a delayed response or repeated click, the application must not create two separate cases unintentionally.
If a database transaction fails:
Do not report successful submission.
Return an explicit error.
Preserve enough state for safe recovery.
Avoid creating inconsistent partial records.
Test the actual behavior rather than assuming a transaction or unique constraint is sufficient.
2.10 Primary objective H — Build the clinician review interface
Create a clinician-facing workspace for reviewing submitted cases.
The interface should make it easy to understand what the patient reported without presenting the AI brief as verified clinical truth.
At minimum, clinicians should be able to:
View authorized submitted cases.
See the current case status.
Open a case's consultation brief.
Read the relevant original patient responses.
Follow source references from brief fields to supporting responses.
Identify unanswered or unknown information.
Identify unclear or contradictory information.
Distinguish AI-generated content from patient-provided statements.
Edit the draft where authorized.
Save revisions.
Explicitly finalize the record where authorized.
The interface should communicate the distinction between:
Patient-reported information.
AI-generated summary.
Patient-corrected information.
Clinician-edited content.
Clinician-finalized documentation.
Do not silently combine these categories into a single untraceable narrative.
Clinician finalization
Finalization must be an explicit, authenticated server-side operation.
The application must record the clinician responsible and the relevant timestamp.
After finalization, prevent unauthorized changes. If the product later supports amendments, implement them as a deliberate revision workflow rather than silently overwriting finalized documentation.
Do not claim that the system meets formal medical-record or regulatory requirements without an appropriate review.
2.11 Primary objective I — Implement reliable application APIs
Create clear server-side endpoints or server actions for the application lifecycle.
The final endpoint names must follow the existing repository's routing conventions.
Conceptual operations include:
Create intake session.
Retrieve an authorized intake session.
Submit a patient response.
Request the next AI question.
Retrieve or regenerate a draft brief.
Validate a brief.
Update patient-confirmed information.
Submit a confirmed intake.
Retrieve authorized clinician cases.
Retrieve a source-linked consultation brief.
Save a clinician revision.
Finalize a case.
For each operation, define:
Authentication requirements.
Authorization requirements.
Request validation.
Response schema.
Error response.
Persistence behavior.
Idempotency behavior.
Allowed status transitions.
Validate all client input with Zod or the project's approved validation mechanism.
Do not accept role, owner, or finalization fields from a client without verifying authorization.
Do not expose database implementation details or privileged credentials in API responses.
2.12 Primary objective J — Error handling and reliability
The application must handle expected failure modes without losing patient information or displaying misleading success states.
Include:
AI service unavailable.
AI request timeout.
Invalid model output.
Invalid patient request.
Authentication failure.
Authorization failure.
Database unavailable.
Database transaction failure.
Duplicate submission.
Missing source reference.
Invalid status transition.
Unauthorized clinician finalization.
Network interruption during submission.
The frontend should show understandable messages and preserve the user's work when safe.
The backend should return predictable error responses that distinguish validation, authorization, dependency, and persistence failures.
Do not display raw stack traces, secrets, internal prompts, or sensitive debugging information to patients.
2.13 Primary objective K — Coordinate with the team
Developer 1 — AI Engineering
Agree on:
AI service interface.
Conversation-state representation.
Structured intake schema.
Source-reference format.
Validation boundaries.
Safety-routing representation.
Error types.
Model and API configuration.
Which component owns each validation step.
Developer 1 owns the AI integration. Developer 2 owns the main application and persistence.
Developer 3 — Product and Quality
Agree on:
Patient journey.
Clinician journey.
Interface acceptance criteria.
Loading and error states.
Accessibility and responsiveness.
Synthetic test fixtures.
Safety-related UI behavior.
Demonstration scenarios.
Test coverage and known limitations.
Do not independently invent incompatible statuses, schemas, or workflows.

3. Required technical deliverables
Deliverable 1 — Repository assessment
Document:
Existing project structure.
Current stack and dependencies.
Existing application features.
Existing database and authentication setup.
Existing API routes.
Missing features.
Architectural risks.
Recommended implementation sequence.
Deliverable 2 — Database schema and migrations
Provide:
Agreed database model.
Drizzle schema if used.
Versioned SQL migrations.
Required foreign keys and constraints.
Relevant unique constraints.
RLS policies where applicable.
Seed scripts containing synthetic data only.
Instructions for local and remote database setup.
Rollback or recovery notes where appropriate.
Do not run destructive production or shared-database migrations without explicit approval.
Deliverable 3 — Authentication and authorization
Provide:
Authentication setup instructions.
Server-side authorization checks.
Patient ownership enforcement.
Clinician access rules.
RLS configuration where applicable.
Tests for unauthorized access.
Documentation of demonstration-only shortcuts.
Deliverable 4 — Patient intake interface
Provide:
Introductory screen and disclaimer.
Text conversation interface.
Message submission and response display.
Loading and error states.
Skipping and correction behavior.
Intake progress and review experience.
Brief correction interface.
Patient confirmation and submission state.
Deliverable 5 — Application and AI integration APIs
Provide:
Server-side integration with Developer 1's AI service.
Validated request and response contracts.
Authentication and authorization enforcement.
Predictable error responses.
Safe timeout and retry behavior.
Documentation of the actual interface.
Tests for invalid requests and unavailable dependencies.
Deliverable 6 — Consultation brief persistence
Provide:
Structured brief persistence.
Source-reference preservation.
Patient correction handling.
Submission transaction or equivalent consistency strategy.
Duplicate-submission protection.
Explicit status transitions.
Verification that saved data matches the intended submission.
Deliverable 7 — Clinician review workspace
Provide:
Authorized case list.
Case details.
Consultation brief display.
Original response references.
Unknown and unanswered information indicators.
Contradiction indicators.
Draft editing.
Revision persistence.
Explicit clinician finalization.
Appropriate access restrictions.
Deliverable 8 — Test report
Record test names, expected results, actual results, and observed failures.
Include at least:
Patient starts a new intake.
Patient submits a response.
AI service returns the next question.
AI service is unavailable.
Patient skips a question.
Patient corrects an earlier answer.
Patient reviews and edits a brief.
Patient submits a confirmed intake.
Duplicate submission attempt.
Database failure during submission.
Patient attempts to access another patient's record.
Unauthorized user attempts clinician access.
Clinician opens a source-linked brief.
Clinician saves an edit.
Unauthorized finalization attempt.
Authorized clinician finalizes a case.
Invalid status transition.
Urgent safety-routing event interrupts routine intake.
Invalid or malformed brief.
Reloading the application preserves the expected persisted state.
Do not claim a scenario passed unless it was executed and observed.
Deliverable 9 — Setup and handoff documentation
Provide:
Project setup instructions.
Database setup instructions.
Authentication configuration.
.env.example.
Migration and seed commands.
Development and test commands.
AI integration configuration.
Build and deployment instructions.
Known limitations.
Outstanding blockers.

4. Environment configuration and secrets
Use the actual variable names required by the implementation.
A proposed .env.example may include:
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
These names are conventions, not verified requirements. Keep only the variables actually needed.
Security rules:
Never expose the AMD API key to the browser.
Never prefix a privileged secret with NEXT_PUBLIC_.
Keep the Supabase service-role key server-side and use it only when necessary.
Do not commit real environment files.
Do not print secrets in logs.
Validate required configuration before starting dependent operations.
Use least-privilege access.
Avoid logging full patient transcripts.
Do not use real patient information in development, testing, or demonstration data.
Follow the existing project's environment conventions when they are already established.

5. Database and state integrity rules
These rules are mandatory.
Original patient statements must remain traceable.
Patient corrections must not silently erase earlier statements.
AI-generated content must remain distinguishable from patient-provided content.
Invalid AI output must not be stored as a valid consultation brief.
Patient confirmation must be explicit.
Successful submission must be confirmed by the persistence layer.
Clinician finalization must be explicit and authorized.
Failed writes must not produce false success messages.
Duplicate requests must not create unintended duplicate cases.
Status transitions must be validated on the server.
A finalized record must not be silently overwritten by AI generation.
Every record-access operation must enforce the relevant authorization policy.

6. Implementation sequence
Stage 1 — Repository and architecture discovery
Inspect the project and document the current state. Confirm the stack, database, authentication, routing, and AI integration contracts.
Output: Repository assessment and implementation plan.
Stage 2 — Data model and access control
Agree on the data contract with Developer 1. Implement the schema, migrations, authentication, authorization, and database constraints.
Output: Tested persistence foundation.
Stage 3 — Patient intake interface
Implement the patient-facing experience with appropriate loading, validation, error, and correction states.
Output: Functional patient intake interface.
Stage 4 — AI service integration
Integrate Developer 1's verified AI service. Validate all requests and responses and preserve the intake state when the AI service fails.
Output: Working application-to-AI interaction.
Stage 5 — Structured brief and confirmation
Implement brief generation requests, validation, source references, patient review, corrections, and explicit confirmation.
Output: Validated, patient-confirmed intake flow.
Stage 6 — Submission and persistence
Implement reliable submission, transaction handling where needed, idempotency, and explicit case-status transitions.
Output: Verified database persistence and accurate submission states.
Stage 7 — Clinician review
Implement authorized case access, source-linked brief review, editing, revision history, and clinician finalization.
Output: Functional clinician workflow.
Stage 8 — Integration and reliability testing
Run end-to-end tests for normal intake, safety behavior, invalid output, database failure, duplicate submissions, and access control.
Output: Observed test results and a list of unresolved issues.
Stage 9 — Final handoff
Document setup, configuration, database migrations, testing, deployment, and known limitations.
Output: Reproducible application and delivery package.

7. Acceptance criteria
Developer 2's work is complete only when the following criteria have been verified.
Application
The patient can start and complete the intended intake flow.
The application calls the actual AI service through a server-side interface.
The patient can review and correct the proposed brief.
The interface is responsive and accessible for the demonstration.
Loading, error, and empty states behave as intended.
Persistence
Confirmed intake data is saved to Supabase PostgreSQL.
Original patient responses remain traceable.
Source references are preserved.
Failed writes do not produce false success.
Duplicate submissions are handled safely.
Case status reflects the actual application state.
Security
Sensitive records require appropriate authorization.
Patient ownership checks are enforced server-side.
Clinician actions are restricted to authorized users.
Privileged credentials remain server-side.
Unauthorized access and finalization attempts are tested.
Clinician review
Authorized clinicians can open submitted cases.
The brief can be compared with original responses.
Unknown, unanswered, unclear, and conflicting information remain distinguishable.
Clinician edits are persisted.
Finalization is explicit, authorized, and recorded.
AI generation cannot silently overwrite finalized documentation.
Reliability and delivery
AI and database failures are handled.
Safety-routing events are surfaced appropriately.
Tests contain actual observed results.
Migrations and setup instructions are documented.
Synthetic data is used throughout the demonstration.
Remaining limitations are disclosed.

8. Working rules
Inspect before changing.
Preserve existing functionality unless a change is necessary and approved.
Do not make destructive database changes without explicit approval.
Keep AI inference logic within Developer 1's ownership boundary.
Keep persistence and authorization within the application's server-side boundary.
Validate all untrusted client input and model output.
Never expose privileged credentials to browser code.
Never invent successful database or integration results.
Keep patient statements and AI-generated summaries distinguishable.
Use explicit status transitions.
Test failure paths, not just the happy path.
Avoid unnecessary frameworks and abstractions.
Coordinate shared contracts before finalizing interfaces.
Use synthetic data only.
Document unresolved risks and blockers early.

9. First action
Do not begin by building every page or rewriting the database.
Start with a concise repository assessment answering:
What is already implemented?
What framework, routing, and database conventions does the project use?
What authentication and authorization mechanisms exist?
What database schema and migrations already exist?
What AI service contract will Developer 1 provide?
Which patient and clinician workflows are missing?
What is the smallest end-to-end flow that can be implemented and verified first?
What access, credentials, or decisions are needed from the project owner?
Then establish the agreed data contract and implement the smallest working application flow.
First milestone: A patient can submit a synthetic response through the application, the backend calls the verified AMD-powered AI service, the application receives and validates the result, and the patient can see the next step without losing their existing intake state.
After that, complete persistence, patient confirmation, clinician review, and finalization in incremental, testable stages.

10. Developer 2 execution checklist
Phase 1 — Repository discovery
Inspect the repository structure.
Identify existing application features.
Inspect routing and API conventions.
Inspect database and migration setup.
Inspect authentication and authorization.
Identify missing patient and clinician workflows.
Agree on integration contracts with Developers 1 and 3.
Phase 2 — Data model and security
Define the minimal intake data model.
Agree on the schema with Developer 1.
Implement database migrations.
Configure relevant foreign keys and constraints.
Configure authentication.
Implement server-side authorization.
Configure RLS where applicable.
Add synthetic seed data.
Test unauthorized access.
Phase 3 — Patient intake
Build the intake introduction and disclaimer.
Implement the text conversation interface.
Implement message submission.
Implement loading and error states.
Support skipped and unknown answers.
Support corrections.
Preserve the current intake state across reloads where appropriate.
Display urgent safety guidance when required.
Phase 4 — AI integration
Obtain Developer 1's verified AI service interface.
Implement the server-side integration.
Validate all incoming requests.
Validate AI responses.
Handle timeouts and unavailable dependencies.
Preserve responses when AI inference fails.
Test the actual application-to-AI path.
Phase 5 — Brief review and submission
Display the structured consultation brief.
Preserve source references.
Distinguish unknown and unanswered fields.
Allow patient corrections.
Validate the confirmed brief.
Implement explicit patient confirmation.
Implement reliable database persistence.
Prevent unintended duplicate submissions.
Verify the stored record before displaying success.
Phase 6 — Clinician workflow
Build the authorized case list.
Implement case details.
Display the brief and original source statements.
Highlight missing and conflicting information.
Implement clinician editing.
Persist revisions.
Implement authorized finalization.
Record the finalizing clinician and timestamp.
Prevent silent overwrites of finalized documentation.
Phase 7 — Testing and handoff
Test the complete patient journey.
Test the complete clinician journey.
Test database failures.
Test duplicate submissions.
Test authorization boundaries.
Test safety-routing behavior.
Test invalid AI output.
Prepare the setup guide.
Prepare .env.example.
Document migrations and commands.
Coordinate integration testing with Developers 1 and 3.
Record actual results and remaining limitations.

11. Required handoff to the other developers
To Developer 1 — AI Engineering
Provide the agreed AI integration interface, database persistence boundaries, accepted schema version, source-reference requirements, error handling expectations, and feedback from actual integration tests.
Developer 1 should know how the application consumes the AI output and which validations are required at the application boundary.
To Developer 3 — Product and Quality
Provide the implemented patient and clinician workflows, acceptance criteria, test environment, synthetic seed data, observable error behavior, and known UX limitations.
Developer 3 should be able to test the actual product without relying on mocked behavior unless the test is explicitly intended to use a mock.
To the entire team — Demonstration evidence
Demonstrate the following end-to-end flow:
Patient starts an intake.
Patient provides synthetic responses.
The application calls the verified AI service.
The AI produces structured intake information.
The application validates and presents the brief.
Patient reviews and confirms the intake.
The application persists the submission.
An authorized clinician opens the case.
The clinician reviews the source-linked brief and edits it.
The clinician explicitly finalizes the record.
The application displays the correct status at every stage.
Also demonstrate at least one meaningful failure path, such as an unavailable AI service, invalid output, or failed submission.
The goal is a reliable, verifiable application workflow—not just a working UI.

