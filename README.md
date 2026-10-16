# ConsultPrep AI

**AI documents. Clinicians decide.**

ConsultPrep AI is an AI-powered pre-consultation intake assistant that helps patients organize their concerns before a medical consultation. It transforms patient-reported information into a structured, source-linked consultation brief that clinicians can review, correct, and finalize.

Instead of replacing medical professionals, ConsultPrep AI aims to make pre-consultation information gathering more organized, consistent, and traceable.

> **Important:** ConsultPrep AI is a prototype intended for development and evaluation using synthetic data. It is not a diagnostic tool, does not provide medical treatment recommendations, and has not been clinically validated.

## Overview

Preparing for a medical consultation can be challenging. Patients may forget important details, struggle to describe symptom timelines, or leave relevant questions unanswered.

ConsultPrep AI addresses this challenge through an adaptive intake conversation that helps patients communicate their concerns in their own words.

The system organizes their responses into a structured brief while preserving links to the original statements. Patients can review and correct their information before submission, and clinicians retain responsibility for reviewing and finalizing the resulting brief.

## Key Features

- **Adaptive patient intake** — Asks relevant follow-up questions based on information already provided.
- **Structured consultation briefs** — Organizes patient responses into a consistent, readable format.
- **Source traceability** — Links relevant brief entries to the original patient statements.
- **Patient review and correction** — Allows patients to review their information before submitting it.
- **Clinician-in-the-loop review** — Enables clinicians to inspect source information, edit the draft, and explicitly finalize it.
- **Explicit information states** — Distinguishes reported information, patient denials, unknowns, unanswered questions, unclear statements, and conflicting responses.
- **Safety-oriented handling** — Interrupts routine intake when potentially urgent symptoms require immediate guidance.
- **Persistent case records** — Stores intake sessions and consultation briefs in a database, subject to successful persistence and authorization checks.

## How It Works

1. **Start intake.** The patient receives a clear explanation of the tool's purpose and limitations.
2. **Describe the concern.** The patient explains what they are experiencing in their own words.
3. **Answer follow-up questions.** The AI asks focused, non-leading questions and allows the patient to skip questions or indicate uncertainty.
4. **Generate a draft.** The system organizes the available responses into a structured consultation brief.
5. **Review the information.** The patient can correct or confirm the information before submission.
6. **Submit the case.** The application persists the case and verifies that the operation succeeded.
7. **Clinician review.** A clinician examines the brief and its supporting statements, makes any necessary edits, and explicitly finalizes it.

Potentially urgent symptoms must not be held up by routine intake or completion requirements.

## Consultation Brief Structure

A generated brief may include:

- Primary concern
- Symptom timeline
- Patient-reported symptoms and characteristics
- Relevant background information volunteered by the patient
- Unanswered or unclear questions
- Conflicting information requiring clarification
- References to the original patient statements
- Review and finalization status

The AI-generated brief remains a draft until a clinician reviews and finalizes it. Information must not be presented as confirmed merely because the AI generated it.

## Technology Stack

The intended technology stack includes:

| Layer | Technology |
|---|---|
| Frontend and application | Next.js, React, TypeScript |
| Styling and components | Tailwind CSS, shadcn/ui |
| AI inference | AMD Token Factory API |
| Database | Supabase-hosted PostgreSQL |
| Database access | Drizzle ORM, subject to existing project conventions |
| Runtime validation | Zod |
| Authentication | Supabase Auth, if adopted |
| Testing | Vitest, React Testing Library, Playwright |
| Version control | Git and GitHub |

**Note:** The exact AMD Token Factory model, endpoint, authentication method, and request/response format must be verified against the selected service before implementation. The table describes the intended architecture, not a claim that every component is already implemented.

## Architecture Principles

ConsultPrep AI separates AI-generated content from application-controlled state.

- The AI proposes follow-up questions and generates structured drafts.
- The application validates model output before accepting it.
- The application controls authorization, persistence, and case status transitions.
- Original patient statements remain available for traceability.
- Clinician edits and finalization are distinct from AI-generated content.
- A successful model response does not imply a successful database write.
- Inference failures must not silently discard patient responses or substitute an unapproved provider.
- Potentially urgent symptom handling must not depend exclusively on the language model.

## Getting Started

### Prerequisites

Install the following before setting up the project:

- Node.js version compatible with the project's Next.js version
- npm
- Git
- A Supabase project
- An AMD Token Factory account and API credentials, if API access is enabled for your selected model

### 1. Clone the repository

```bash
git clone https://github.com/<YOUR_GITHUB_USERNAME>/consultprep-ai.git
cd consultprep-ai
```

Replace `<YOUR_GITHUB_USERNAME>` with your GitHub username or organization.

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local environment file using the repository's example:

```bash
cp .env.example .env.local
```

Populate the variables with the appropriate credentials and configuration values.

The following names are proposed conventions; the actual application must implement and document the variables it uses.

```dotenv
# Application
APP_URL=http://localhost:3000

# Database
DATABASE_URL=
DIRECT_URL=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AMD Token Factory
AMD_API_BASE_URL=
AMD_API_KEY=
AMD_MODEL=
AMD_API_TIMEOUT_MS=30000
```

Keep secret credentials on the server. Never commit `.env.local`, API keys, database passwords, or privileged service-role credentials to GitHub.

Only include `SUPABASE_SERVICE_ROLE_KEY` if the implementation requires it. It must never be exposed to browser code.

### 4. Set up the database

Apply the database migrations using the migration workflow implemented by the project.

For example, if Drizzle Kit is configured:

```bash
npx drizzle-kit migrate
```

Verify the configured database connection and migration scripts before running commands. Do not run destructive migrations against production data.

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

The commands above assume the corresponding scripts and configuration exist in `package.json`. Follow the repository's actual setup instructions if they differ.

## Testing

Run the checks supported by the project:

```bash
npm run lint
npm run typecheck
npm run test
```

If the repository includes an end-to-end test suite:

```bash
npm run test:e2e
```

These commands require matching scripts to be configured in `package.json`.

Testing should cover:

- Adaptive questioning and preservation of patient responses
- Structured-output validation and malformed AI responses
- Source traceability between brief entries and original statements
- Patient review, correction, and submission
- Authentication, authorization, and database access controls
- Duplicate submissions and failed database writes
- Clinician editing and explicit finalization
- AI provider timeouts and unavailable services
- Potentially urgent symptoms that must interrupt routine intake
- Conflicting, unknown, skipped, and unanswered information

Use synthetic scenarios for development and testing. Do not include real patient information in test fixtures, screenshots, logs, or public issue reports.

## Safety and Limitations

ConsultPrep AI is designed to support information gathering, not medical decision-making.

- It does not diagnose medical conditions.
- It does not prescribe medication or recommend treatment.
- It must not provide false reassurance or discourage seeking appropriate medical care.
- It must not require completion of the intake before providing appropriate urgent-care guidance.
- AI-generated content may be incomplete or incorrect and requires appropriate review.
- Clinicians remain responsible for their professional assessment and decisions.

The prototype is not a substitute for emergency services, professional medical evaluation, or a clinically validated medical system.

Any real-world deployment would require appropriate clinical, legal, privacy, security, and regulatory review, along with validation of the safety mechanisms and intended use.

## Privacy and Security

The development version should use synthetic data only.

Security requirements include:

- Keep API keys and privileged credentials server-side.
- Enforce authorization on server-side operations.
- Apply appropriate database access controls and Row Level Security policies where applicable.
- Minimize the collection and retention of sensitive information.
- Avoid logging sensitive patient content unnecessarily.
- Verify persistence and authorization before confirming submission or exposing records.
- Never treat an AI-generated status message as proof of a completed operation.

Do not use this prototype with real patient information unless the necessary safeguards, approvals, and compliance requirements have been independently established.

## Project Status

**Status:** Prototype in development

The project is intended to establish a reliable workflow for patient intake, structured brief generation, source traceability, and clinician review. Features and integrations should be considered implemented only when verified in the running application and supported by tests.

## Project Philosophy

ConsultPrep AI follows one central principle:

**AI documents. Clinicians decide.**

The goal is not to automate medical judgment. It is to help patients communicate more clearly, give clinicians a more organized starting point, and preserve the context behind every important statement.


