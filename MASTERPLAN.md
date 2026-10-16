ConsultPrep AI — Master Project Context
1. Project Overview
Project Name: ConsultPrep AI
Project Category: AI-powered healthcare intake and clinical documentation assistance
Primary Interface: Text-based conversational chat
Primary Users: Patients and healthcare professionals
AI Inference Provider: AMD Token Factory API
Database: PostgreSQL hosted on Supabase
Development Context: AMD AI hackathon; final track eligibility must be verified
ConsultPrep AI is an AI-powered pre-consultation intake platform that helps patients communicate their health concerns clearly before speaking with a healthcare professional.
Patients interact with an AI assistant through a familiar, text-based chat interface. Instead of requiring them to complete a long, complicated medical form, the assistant guides them through a structured conversation, asking relevant follow-up questions one at a time.
After collecting the patient's responses, the system organizes the information into a structured pre-consultation brief that a healthcare professional can review, correct, and finalize.
The system is designed to improve the organization and completeness of patient-reported information, not to make medical decisions.
Core principle: AI documents. Clinicians decide.
ConsultPrep AI must never present itself as a doctor, diagnose medical conditions, prescribe medication, recommend treatments, or replace professional medical judgment.
The initial prototype will use synthetic patient data and will be demonstrated as a proof of concept rather than a clinically validated medical product.
Current technology direction
The project will use the AMD Token Factory API directly for AI inference. The application will call the verified AMD endpoint from server-side application code.
Evolus Business Agents will not be part of the initial architecture unless the project owner explicitly changes this decision.
The exact model, endpoint, authentication mechanism, and request format must be verified against the actual AMD Token Factory service before implementation. Do not assume that access to a model catalog automatically establishes eligibility for a particular hackathon track.
2. The Problem
Healthcare consultations frequently begin with patients trying to explain their symptoms, medical history, and concerns from memory.
Several challenges can arise:
Patients may struggle to explain what they are experiencing.
Important details, such as when symptoms started or how they have changed, may be omitted.
Patients may not know which information is relevant to their consultation.
Healthcare professionals may need to spend valuable consultation time gathering basic information.
Written intake forms can feel long, confusing, or impersonal.
Information may be scattered across free-text notes, forms, and verbal explanations.
Clinicians need to distinguish between information the patient reported, information that remains unknown, and information that requires clarification.
These issues do not mean that patients should be expected to provide a perfect medical history. Instead, the system should help them communicate their concerns in a clear, organized, and reviewable way.
The proposed solution
ConsultPrep AI transforms an ordinary text conversation into a structured, source-traceable pre-consultation brief.
Rather than simply answering health questions, the assistant has a specific task: help the patient explain their concern and prepare the information for clinician review.
3. Product Vision
Make pre-consultation preparation more accessible, conversational, organized, and transparent.
A patient should be able to describe a concern in their own words, answer a few relevant follow-up questions, review the information collected, and submit it for professional review.
A clinician should be able to open the resulting brief, quickly understand what the patient reported, identify unanswered questions, inspect the original statements, and edit or finalize the documentation.
The system should feel like a simple, trustworthy healthcare intake tool—not a general-purpose chatbot, an automated doctor, or an overly complicated hospital management system.
4. Product Goals
The prototype should demonstrate that ConsultPrep AI can:
Conduct a natural, understandable text conversation with a patient.
Collect relevant information through focused follow-up questions.
Organize patient responses into a consistent structure.
Preserve the distinction between reported facts, unknown information, and missing answers.
Generate a concise consultation brief grounded in the patient's actual responses.
Allow patients to review and correct their information before submission.
Persist intake records and consultation briefs in Supabase PostgreSQL.
Provide a clinician-facing interface for reviewing, editing, and finalizing briefs.
Preserve links between structured brief fields and original patient statements.
Integrate directly with the AMD Token Factory API.
Demonstrate reliable structured output, responsible failure handling, and safety boundaries.
Provide a working, testable patient-to-clinician workflow.
Demonstrate the chosen AMD model and inference configuration with credible technical evidence.
Non-goals
The first version is not intended to:
Diagnose diseases or conditions.
Predict which disease a patient has.
Prescribe medication or recommend treatment.
Calculate individualized treatment plans.
Replace emergency services or professional consultations.
Automatically make clinical decisions.
Claim that AI-generated information is medically verified.
Replace an electronic health record system.
Support production-scale hospital deployment.
Claim clinical effectiveness or time savings without appropriate evaluation.
Implement voice interaction before the core text workflow is complete.
5. Target Users
A. Patients
Patients use the application to prepare for an upcoming consultation or organize information about a health concern.
They should be able to:
Start an intake session.
Describe their concern in their own words.
Answer conversational follow-up questions.
Skip questions or indicate that they do not know an answer.
Correct information previously provided.
Review the structured summary.
Submit the brief for clinician review.
Understand that the AI does not provide a diagnosis.
The experience must be understandable to people who are not familiar with medical terminology.
B. Healthcare professionals
Healthcare professionals use the clinician interface to review patient-submitted briefs.
They should be able to:
View submitted cases.
Open a consultation brief.
Review the patient's primary concern and symptom timeline.
See relevant information the patient reported.
Identify missing, uncertain, or contradictory information.
Inspect the original statements behind summary entries.
Edit the AI-generated draft.
Finalize the brief after their review.
View the current status of each case.
The AI-generated brief must remain a draft until an authorized clinician explicitly reviews and finalizes it.
C. Demonstrators and evaluators
Demonstrators and hackathon judges should be able to understand the complete product workflow during a short presentation.
They should see:
The patient's conversation.
The structured consultation brief.
Source traceability and uncertainty handling.
The clinician's review process.
The direct AMD Token Factory API integration.
The application's safety controls and failure handling.
Verifiable evidence of the selected model and actual inference configuration.
Do not claim integration with an infrastructure component that the application does not actually use.
6. Core User Journey
The main workflow is text-first and must work end to end.
Step 1: Start an intake session
The patient opens ConsultPrep AI and sees a concise explanation of its purpose.
The interface explains that the assistant helps organize information for a healthcare professional and does not diagnose or replace medical care.
The patient starts a new intake session.
Step 2: Describe the concern
The assistant asks the patient to describe what they would like to discuss.
Example:
Patient: "I've been having stomach pain since yesterday, and it gets worse after I eat."
The assistant acknowledges the concern without making a diagnosis.
Step 3: Conduct conversational intake
The assistant identifies relevant missing information and asks follow-up questions one at a time.
Possible questions include:
When did the discomfort begin?
Where do you feel it?
How would you describe the discomfort?
Has it changed since it started?
Does anything seem to make it better or worse?
Are there other symptoms you have noticed?
Is there any relevant medical history or medication information you would like to share?
These are examples, not a mandatory fixed questionnaire. Questions must depend on what the patient has already said.
The assistant must avoid unnecessary questions and must not repeatedly request information that is already available.
Step 4: Review the collected information
Once sufficient information has been collected—or the patient chooses to stop—the application prepares a structured draft.
The patient sees a review screen showing the information that will be submitted.
The patient can correct inaccurate entries, provide additional details, or leave unknown fields unanswered.
Step 5: Submit the brief
After the patient confirms submission, the application validates the intake and persists the required records in Supabase PostgreSQL.
The application must verify that the necessary database operations succeeded before displaying a successful submission state.
If a separate processing step is used, its success must also be verified. Do not display a success message merely because the AI generated a confirmation sentence.
Step 6: Clinician review
The clinician opens the submitted case and reviews the structured brief.
The clinician can inspect source statements, correct the draft, and finalize the documentation.
The system records the case status and distinguishes AI-generated content from clinician-edited or clinician-finalized content.
Step 7: Complete the workflow
A successfully reviewed case receives a clear status, such as:
Draft
Awaiting patient confirmation
Submitted
Awaiting clinician review
In review
Finalized
Statuses must correspond to actual application and database state, not merely to text generated by the AI.
7. AI Conversation Behavior
The conversational assistant is central to the product. It should feel natural and approachable while remaining focused on collecting patient-reported information.
Communication style
The assistant must:
Use plain, respectful language.
Ask one primary question at a time.
Acknowledge the patient's concern without being overly emotional.
Avoid unnecessary medical jargon.
Explain unfamiliar terms when needed.
Avoid making the patient feel blamed or judged.
Allow the patient to skip questions.
Accept short, long, or informal answers.
Avoid repeating questions when the answer is already available.
Confirm ambiguous information when clarification is important.
Allow the patient to correct earlier statements.
Avoid suggesting answers that could influence the patient's response.
Adaptive questioning
The assistant should use the structured intake state to decide what to ask next.
For example:
Patient: "My headache started three days ago."
The assistant should not ask when the headache started again. It may ask another relevant question if additional information is appropriate.
The application must maintain a structured intake state throughout the conversation rather than relying entirely on the latest message or the model's conversation history.
Conversation completion
The assistant should conclude when:
Relevant intake information has been collected sufficiently for a preliminary brief.
The patient asks to stop.
The patient chooses to submit with unanswered questions.
A safety concern requires stopping routine intake.
A technical or model failure prevents safe continuation.
A completed intake does not mean the patient's medical situation has been fully assessed.
Unknown and unanswered information
The assistant must distinguish between:
Reported: The patient explicitly provided the information.
Patient denied: The patient explicitly said the symptom or condition is absent.
Unknown: The patient does not know the answer.
Not answered: The question was asked but remains unanswered.
Not asked: The information was not requested.
Unclear: The response needs clarification.
Conflicting: Two statements appear inconsistent.
The assistant must never fill gaps with assumptions or treat missing information as a negative response.
8. Intake Information Structure
The intake process should collect only information relevant to the patient's stated concern.
Patient-reported concern
Primary concern in the patient's own words.
Concise summary of the concern.
Date or approximate time symptoms began, if reported.
Duration and pattern, if reported.
Location of the symptom, if applicable.
Description of the symptom, if reported.
Patient-reported severity or impact, when appropriate.
Changes over time.
Factors the patient says make it better or worse.
Other symptoms the patient reports.
Relevant background
Relevant medical history, if provided.
Current medications, if provided.
Allergies, if provided.
Other relevant context volunteered by the patient.
The assistant should not collect an exhaustive medical history by default. Sensitive information must be limited to what is necessary for the intake purpose.
Documentation and quality fields
Original patient statements.
Structured interpretation of each statement.
Source reference for each summary field.
Information requiring clarification.
Questions asked and unanswered.
Uncertainty and contradiction indicators.
Intake completion status.
Submission timestamp.
AI draft status.
Clinician review status.
Clinician edits and finalization status.
These fields allow the system to produce a useful summary without losing the context needed to verify it.
9. Consultation Brief Output
The consultation brief is the primary output of ConsultPrep AI.
It must be concise enough for a clinician to scan while retaining enough detail to understand what the patient actually reported.
Proposed structure
Primary concern: A short summary of the reason for consultation, grounded in the patient's statements.
Symptom timeline: A chronological summary of onset, duration, progression, and relevant changes reported by the patient.
Reported symptoms and characteristics: Relevant patient-reported details, including location, description, impact, and associated symptoms where applicable.
Relevant background: Medical history, medications, allergies, and contextual information supplied by the patient, where relevant.
Unanswered or unclear information: Questions that remain unanswered, information the patient does not know, and details requiring clarification.
Contradictions or inconsistencies: Statements that appear inconsistent and need review. The system must not silently choose one version.
Original patient statements: Links or expandable excerpts that let the clinician inspect the source of important summary details.
Review status: A clear label stating that the brief was AI-generated and has not yet been finalized by a clinician.
Example
Patient-reported concern: "I've been having stomach pain since yesterday, and it gets worse after I eat."
The assistant collects additional relevant information, then generates a draft such as:
Primary concern: Patient reports stomach pain beginning yesterday.
Pattern: Patient reports that the pain worsens after eating.
Location: Unknown, if not provided.
Severity: Not answered, if the patient was asked but did not answer.
Associated symptoms: Include only symptoms the patient actually reported or explicitly denied.
Relevant history: Not provided, if the patient did not provide it.
Needs clarification: Exact location and other relevant details that remain unanswered.
Source: Original patient statements available for review.
Status: AI-generated draft; clinician review pending.
This is an example of documentation structure, not a clinical assessment or recommendation.
10. Medical Safety Boundaries
Safety is a core product requirement, not an optional feature.
No diagnosis or treatment
The assistant must not:
Tell the patient which disease they have.
Rank likely diagnoses.
Interpret symptoms as confirmation of a specific condition.
Recommend medication, dosage, or treatment.
Claim that symptoms are harmless based on incomplete information.
Tell patients to avoid professional care.
Present the generated brief as a medically verified conclusion.
When patients ask for a diagnosis, the assistant should explain that it can organize their reported information but cannot determine what condition they have.
Urgent or potentially emergency symptoms
If the patient describes symptoms that may indicate an emergency, the assistant must not continue routine intake as if nothing has changed.
It should provide clear, conservative guidance to seek appropriate urgent medical help, based on predefined safety rules for the prototype.
For example, if the patient reports severe chest pain or difficulty breathing, the system should direct them to emergency services or the nearest appropriate emergency department without delaying care to complete the questionnaire.
The assistant must not attempt to rule out an emergency.
For the prototype:
Implement a conservative safety gate.
Define and test predefined synthetic scenarios.
Treat urgency classification as a safety-routing mechanism, not a diagnosis.
Do not rely solely on unconstrained model output for urgent-symptom handling.
Do not require the patient to finish intake before urgent guidance is displayed.
Uncertainty
When the system cannot determine whether a response is safe or relevant, it should avoid unsupported conclusions and route the situation for appropriate human attention.
Clear disclaimers
The interface should explain that:
ConsultPrep AI helps organize patient-reported information.
It does not provide a diagnosis or replace professional care.
The AI-generated brief requires clinician review.
Patients should not delay urgent medical care to complete the intake.
11. AMD Token Factory API Integration
The application will use the AMD Token Factory API directly for AI inference.
Integration responsibilities
The AMD integration must support the conversational intake and structured brief generation using the selected model and verified API capabilities.
Before implementation, verify:
The actual API base URL and endpoint.
Authentication requirements.
The model identifiers available to the project.
Request and response formats.
Whether OpenAI-compatible chat completions are supported.
Whether structured JSON output is supported.
Context limits, rate limits, quotas, and usage restrictions.
Timeout behavior and error responses.
Whether the chosen model satisfies the applicable hackathon rules.
Do not invent endpoints, payloads, response fields, or authentication mechanisms.
Model selection
Evaluate available candidates using synthetic intake scenarios.
Assess:
Instruction following.
Quality and relevance of follow-up questions.
Faithfulness to patient statements.
Structured output reliability.
Handling of unknown, unanswered, and contradictory information.
Response latency.
Rate limits and availability.
Safety behavior.
Compatibility with the verified API.
Do not choose a model based only on its name, parameter count, or availability in the catalog.
Server-side inference
All AMD API calls must pass through server-side application code.
The browser must never receive the AMD API key.
Implement:
Request timeouts.
Bounded retries.
Explicit handling for rate limits and service outages.
Structured response parsing and validation.
Handling for malformed or incomplete responses.
Protection against duplicate submissions.
Safe behavior when inference is unavailable.
Appropriate request-size and token limits.
Logging that avoids unnecessary sensitive information.
Do not silently switch to an unrelated commercial AI provider if the AMD endpoint fails.
If inference fails, preserve existing patient responses and provide a safe retry or recovery path.
Infrastructure and hackathon eligibility
Do not claim that the selected AMD Token Factory endpoint is a vLLM endpoint or that it satisfies an AMD Developer Cloud requirement without verification.
If the selected competition track requires an open model served through vLLM on AMD infrastructure, verify that the chosen deployment satisfies the requirement. If it does not, identify the gap before proceeding.
The product architecture and competition eligibility are separate concerns and must be evaluated separately.
12. Application Components
The product is conceptually divided into four components.
A. Patient-facing intake application
Provides:
A welcome screen.
A text chat interface.
Visible conversation history.
A simple indication of progress.
A review-and-correct screen.
Submission confirmation.
Clear loading, error, and recovery states.
The chat should be the central experience. Do not overload the patient interface with dashboards, analytics, excessive cards, or irrelevant clinical terminology.
B. Intake orchestration layer
Coordinates:
Conversation state.
Structured intake fields.
Calls to the AMD Token Factory API.
Validation of generated output.
Safety routing.
Patient confirmation.
Database persistence.
Error recovery.
The orchestration layer must ensure that the application—not the model's conversational text—controls the actual submission state.
C. Consultation case storage and processing
Responsible for:
Recording submitted cases.
Maintaining case status.
Associating source statements with the brief.
Persisting validated records in Supabase PostgreSQL.
Making submitted cases available to authorized clinicians.
The initial implementation should avoid unnecessary infrastructure. Add background jobs or queues only if actual reliability or processing requirements justify them.
D. Clinician review interface
Provides:
A list of submitted cases.
Case status and submission information.
A structured consultation brief.
Source statements and traceability.
Missing-information and contradiction indicators.
Editable draft fields.
A finalization action.
Clear separation between AI-generated content and clinician-confirmed content.
Prioritize a functional end-to-end workflow over a large collection of secondary features.
13. User Interface and Experience Principles
The application should look like a thoughtfully designed healthcare utility.
Visual direction
Clean, restrained, and professional.
Clear typographic hierarchy.
Readable text and comfortable spacing.
Accessible contrast and focus states.
A calm visual identity appropriate for a healthcare-related product.
Consistent components and predictable navigation.
Responsive layouts for desktop and mobile.
Helpful empty, loading, success, and error states.
Avoid:
Generic AI landing-page aesthetics.
Excessive glassmorphism and gradients.
Unnecessary decorative cards.
Excessive animations.
Large, vague marketing claims.
Fake clinical metrics or testimonials.
Unnecessary medical imagery.
Dense forms presented all at once to patients.
Patient chat experience
The patient should understand:
What the assistant is doing.
Why a follow-up question is being asked, when clarification is useful.
What information has been collected.
How to correct a previous answer.
When the conversation is ready for review.
Whether submission actually succeeded.
Clinician experience
The clinician should be able to scan the brief quickly, find original patient statements, identify gaps, and make corrections without navigating through unnecessary screens.
14. Data Integrity, Privacy, and Security
The prototype should be designed with healthcare data sensitivity in mind.
Prototype data
Use synthetic patient records and fictional cases during development and the hackathon demonstration.
Do not use real patient information in screenshots, demonstrations, logs, public repositories, or test fixtures.
Data minimization
Collect only the information necessary for the consultation-intake purpose. Do not require identifying information unless a demonstrated workflow genuinely needs it.
Source preservation
Keep original patient statements separate from AI-generated summaries and clinician edits.
The AI must not silently rewrite the original transcript. Corrections should be recorded as explicit changes with clear provenance.
Access control
Patient-facing and clinician-facing functions must have distinct authorization boundaries.
A patient must not be able to access another patient's case or the clinician administration interface.
Do not rely solely on hiding buttons in the UI as an authorization mechanism.
Database security
Use Supabase PostgreSQL with appropriate access policies.
Evaluate and implement Row Level Security (RLS) where applicable. Enforce authorization in server-side code and database policies rather than relying exclusively on frontend checks.
Do not expose service-role credentials or privileged database access to the browser.
Secrets
All API keys, tokens, and credentials must be stored in environment variables or an appropriate secrets mechanism.
Provide an environment-variable example file containing placeholder values only.
Logging and retention
Avoid logging full sensitive conversations unnecessarily.
Establish a clear prototype data-retention policy and a way to remove test cases.
Production limitation
Before any real-patient deployment, the product would require a separate assessment of applicable privacy laws, security controls, clinical safety, operational procedures, and regulatory obligations.
The hackathon prototype must not be represented as production-ready or clinically validated.
15. Failure Handling
The system must handle failure explicitly rather than relying on the model to improvise.
Model unavailable
If the AMD endpoint fails, show a clear error and allow the patient to retry.
Do not fabricate a response or silently switch to an unapproved model.
Invalid structured output
If the model returns malformed or incomplete data, validate the response and attempt a controlled recovery where safe.
If validation still fails, preserve the patient's original responses and avoid submitting a misleading brief.
Database failure
If a database operation fails, do not display a successful submission or finalization status.
Use appropriate transaction boundaries for related writes and provide a recovery path that prevents duplicate cases.
Incomplete intake
Allow patients to submit with unanswered fields where appropriate, but label the missing information accurately.
Contradictory statements
Preserve both statements and flag the inconsistency for clarification rather than silently choosing one.
Patient abandonment
If a patient leaves before submission, the application must not mark the case as submitted.
Any persistence of incomplete drafts must follow the defined prototype retention and privacy rules.
Urgent symptoms
Interrupt routine intake and activate the conservative safety guidance. Do not require completion of the intake before showing the guidance.
16. Testing and Evaluation
Testing should use synthetic cases and measurable acceptance criteria.
Functional testing
Verify that:
A patient can start and complete a text-based intake.
The assistant asks relevant follow-up questions.
Previously answered questions are not unnecessarily repeated.
Patients can correct information.
The generated brief reflects the actual responses.
Unknown and unanswered fields remain distinct.
Patients can review the brief before submission.
A successful submission creates or records the case correctly in PostgreSQL.
The clinician can inspect, edit, and finalize the brief.
Case statuses update only after the corresponding operation succeeds.
Source references point to the correct original statements.
Safety testing
Create synthetic scenarios covering:
Routine, non-urgent intake.
Requests for a diagnosis.
Requests for medication or treatment.
Potentially urgent symptoms.
Missing information.
Contradictory answers.
Model endpoint failure.
Rate limits and timeouts.
Malformed structured output.
Failed database writes.
Duplicate submission attempts.
Attempts to access unauthorized cases.
Quality metrics
Measure actual prototype performance for:
Intake completion rate across test sessions.
Correct extraction of explicitly reported fields.
Unsupported or fabricated information in summaries.
Correct handling of unknown and unanswered fields.
Contradiction detection.
Schema validation success.
Model response latency.
Submission success and failure rates.
Successful preservation of source references.
Metrics must be calculated from real test results. Do not invent percentages, claim clinical effectiveness, or advertise time savings that have not been measured.
17. Technology Stack
The default technical direction is:
Frontend and application
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
Lucide icons
Backend
Next.js server-side route handlers.
A dedicated AMD API client.
Application-level intake orchestration.
Zod for runtime validation.
AI inference
AMD Token Factory API.
One selected model validated against synthetic test scenarios.
Server-side credentials and inference requests.
A provider abstraction that isolates model-specific request and response handling.
Database
Supabase PostgreSQL.
Drizzle ORM.
Version-controlled migrations.
Supabase Auth if appropriate for the authentication requirements.
Row Level Security where applicable.
Testing
Vitest.
React Testing Library.
Playwright.
Deployment and source control
Docker.
GitHub.
A Next.js-compatible deployment platform.
Server-side environment variables.
This stack is the approved starting direction for implementation. Verify actual repository constraints and API requirements before introducing additional services or libraries.
18. Core Data Model
Plan a relational schema around the following conceptual entities. Refine it after inspecting the repository and confirming authentication and ownership requirements.
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
Original patient statements must remain distinguishable from AI-generated interpretations.
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
BriefSourceReference
Links individual brief fields to original patient statements.
Possible fields:
ID.
Brief reference.
Source response reference.
Field identifier.
Relevant source excerpt, if necessary.
References must accurately represent the source. Do not imply that a statement supports a fact the patient did not report.
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
Protect revision records with appropriate access controls.
Information states
The data model must distinguish:
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
19. Hackathon Deliverables and Eligibility
The final submission must satisfy the rules of the actual hackathon track selected by the team.
Expected project deliverables include:
A working ConsultPrep AI prototype.
A patient-facing text chat interface.
An end-to-end intake and review workflow.
A clinician-facing review interface.
A working AMD Token Factory API integration.
A verified model and inference configuration.
A containerized application if required.
A public GitHub repository if required.
A complete README with setup and execution instructions.
An environment-variable example file with placeholders.
Synthetic test data and documented test results.
A hosted or otherwise demonstrable prototype according to event requirements.
A short presentation demonstrating the problem, workflow, architecture, safety boundaries, and business value.
Track eligibility verification
Before treating the architecture as competition-ready, verify:
Whether the chosen track requires Evolus.
Whether direct AMD Token Factory API access is permitted.
Whether a particular AMD infrastructure or vLLM deployment is mandatory.
Whether an open model is required.
Whether the application must use specific SDKs, endpoints, or platform building blocks.
Whether the repository, deployment, and demonstration meet submission rules.
Do not claim compliance with requirements that have not been verified.
If the selected track explicitly requires Evolus integration or a self-managed vLLM endpoint on AMD Developer Cloud, identify the gap and obtain a project-owner decision before proceeding.
20. Definition of Done
The first version is considered complete only when the following are demonstrable.
Patient workflow
A patient can describe a concern through text chat.
The assistant asks relevant follow-up questions.
The patient can review and correct the collected information.
The generated brief accurately reflects the patient's statements.
Missing and uncertain information is clearly labeled.
The patient can submit the brief.
The application accurately reports submission success or failure.
Clinician workflow
A submitted case appears in the clinician interface.
The clinician can inspect the brief and source statements.
The clinician can edit the draft.
The clinician can finalize the documentation.
AI-generated and clinician-finalized states are distinguishable.
Case status changes correspond to actual successful operations.
Technical integration
The main AI functionality uses the verified AMD Token Factory API.
The selected model and endpoint are documented.
The application validates generated structured output.
Source references are preserved.
Model and database failures are handled safely.
No privileged credentials are exposed to the browser.
Safety and delivery
Synthetic test scenarios pass the documented acceptance criteria.
Urgent-symptom handling is demonstrated.
Unauthorized access and submission failure are tested.
The application is containerized if required.
The repository and README are complete.
No secrets or real patient information are committed.
The demonstration does not claim diagnosis, clinical validation, or unmeasured outcomes.
Applicable hackathon requirements have been checked.
21. Product Differentiation
ConsultPrep AI is not intended to compete with general-purpose AI chatbots by answering more questions.
Its value lies in transforming an unstructured patient conversation into a structured, traceable, clinician-reviewable intake document.
The distinguishing capabilities are:
Adaptive intake rather than a static, lengthy form.
Structured output rather than a conversation transcript alone.
Source traceability for important summary details.
Explicit handling of unknown and contradictory information.
A real patient-to-clinician workflow.
Human review and finalization.
Safety-conscious boundaries.
Direct integration with an AMD-hosted or AMD-provided open-model inference service, subject to verification of the actual deployment.
Business value hypothesis
The product may help patients organize their concerns and help clinicians access relevant information more consistently before a consultation.
This is a hypothesis to validate through prototype testing and clinician feedback, not an established clinical or operational outcome.
Potential future directions include clinic intake integrations, multilingual intake, administrative document processing, and integration with existing healthcare systems. These are outside the first-version scope.
22. Development Priorities
Build the project in the following order.
Priority 1 — Validate hackathon requirements
Confirm the actual competition track, mandatory platform integrations, eligible model requirements, deployment requirements, and submission criteria.
Priority 2 — Validate AMD Token Factory access
Confirm the API endpoint, authentication, model availability, quotas, request format, and successful structured response generation.
Priority 3 — Define the intake contract
Establish the structured fields, conversation rules, source references, validation requirements, and safety behavior.
Priority 4 — Establish the application foundation
Inspect the repository, establish Next.js conventions, configure Supabase PostgreSQL, and define authentication and migration requirements.
Priority 5 — Build the patient chat
Implement the text conversation, adaptive questioning, intake state, and review-and-correct screen.
Priority 6 — Implement brief generation and persistence
Generate validated consultation briefs, preserve source traceability, and save the necessary records safely.
Priority 7 — Build the clinician review interface
Display cases, structured briefs, source statements, missing information, and clinician editing and finalization actions.
Priority 8 — Test failures and safety
Test routine and edge cases, including urgent symptoms, unknown fields, contradictions, malformed model output, database failures, and unauthorized access.
Priority 9 — Package and demonstrate
Containerize the application if required, document setup, prepare synthetic test scenarios, verify the repository, and rehearse the complete demonstration.
Do not add secondary features before the core workflow works end to end.
23. Instructions for the AI Development Assistant
You are acting as a senior software engineer, product architect, and implementation partner for ConsultPrep AI.
Your responsibility is to help design and build a credible, working prototype—not merely generate an attractive interface or a superficial AI demonstration.
Follow these rules throughout development:
Treat this document as the canonical product context unless the project owner explicitly changes a requirement.
Do not silently change the product scope or safety boundaries.
Use the AMD Token Factory API directly unless the project owner changes the decision.
Verify the actual API documentation, authentication requirements, endpoint configuration, and supported model capabilities before implementing the integration.
Do not invent API endpoints or claim an integration works without evidence.
Verify hackathon track requirements separately from the technical architecture.
Do not claim that an AMD Token Factory endpoint satisfies a vLLM or AMD Developer Cloud requirement without evidence.
Preserve original patient statements and source references.
Validate model output before using it for persistent records or workflow actions.
Never let the model invent missing patient information.
Enforce authorization and submission status in application logic, not only in the UI.
Treat urgent-symptom handling and failure recovery as essential requirements.
Use synthetic data during the hackathon.
Keep API keys and secrets out of source control and client-side bundles.
Do not fabricate test results, clinical outcomes, performance metrics, or business impact.
Keep the interface clean, responsive, accessible, and focused on the patient-to-clinician journey.
Explain significant architectural decisions and trade-offs before introducing unnecessary complexity.
Identify assumptions explicitly and verify them when possible.
When working in an existing repository, inspect the current structure and conventions before making changes.
Avoid destructive changes without approval.
Prioritize working functionality, testability, traceability, and demonstration readiness.
Report what is implemented, what has been tested, what remains incomplete, and what depends on external configuration.
Current project decisions
AI inference: AMD Token Factory API directly.
Database: Supabase-hosted PostgreSQL.
Initial interface: Text chat only.
Product principle: AI documents; clinicians decide.
Development data: Synthetic patient records only.
Clinician finalization: Explicit human action required.
Evolus: Excluded from the current architecture unless explicitly reintroduced.
Technology stack: Use the approved stack in this document, subject to repository inspection and integration verification.
Immediate next task
Before writing application code, create an implementation-readiness checklist covering:
Confirmed hackathon requirements.
AMD Token Factory API access.
Supported model and endpoint verification.
Structured intake schema.
Conversation and safety acceptance criteria.
Patient and clinician workflows.
Authentication and authorization.
Supabase database schema and migration strategy.
Required synthetic test cases.
Deployment and submission requirements.
For each item, identify whether it is:
Confirmed: Supported by available documentation or a successful test.
Requires verification: Not yet established.
Design decision: Requires the project owner's approval or a documented engineering choice.
Do not invent missing infrastructure details.
The immediate goal is to establish a verified implementation plan before beginning application development.

