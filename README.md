# ConsultPrep AI

**AI documents. Clinicians decide.**

ConsultPrep AI is an AI-powered pre-consultation intake assistant with a domain-limited Q&A mode for general educational health questions and questions about ConsultPrep. It helps patients organize their concerns into a structured, source-linked consultation brief that clinicians can review, correct, and finalize.

Instead of replacing medical professionals, ConsultPrep AI aims to make pre-consultation information gathering more organized, consistent, and traceable.

> **Important:** ConsultPrep AI is a prototype intended for development and evaluation using synthetic data. It is not a diagnostic tool, does not provide medical treatment recommendations, and has not been clinically validated.

## Overview

Preparing for a medical consultation can be challenging. Patients may forget important details, struggle to describe symptom timelines, or leave relevant questions unanswered.

ConsultPrep AI addresses this challenge through an adaptive intake conversation that helps patients communicate their concerns in their own words.

The system organizes their responses into a structured brief while preserving links to the original statements. Patients can review and correct their information before submission, and clinicians retain responsibility for reviewing and finalizing the resulting brief.

## Key Features

The following are product goals. Some have standalone demonstrations or backend contracts, but the complete connected application workflow is not implemented yet. See [current implementation status](#current-implementation-status).

- **Adaptive patient intake** — Asks relevant follow-up questions based on information already provided.
- **Domain-limited Q&A** — Handles general educational health questions and ConsultPrep system questions while declining clearly unrelated topics and personal diagnosis/treatment requests. Medical answers are not yet grounded in a vetted clinical reference corpus.
- **Project-guidance retrieval** — Uses locally generated embeddings to retrieve approved project guidance and synthetic examples for the AI workflow; it is not a clinical knowledge base.
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

## AI Integration Status

The current frontend intake page is a non-persistent preview. The standalone AI package in `packages/ai/` provides local inference and an optional AMD client, but it is not connected to the frontend or an application API. Authenticated session storage and frontend-to-backend integration are not implemented. See the [frontend/backend AI integration guide](packages/ai/docs/frontend-backend-integration.md) for the proposed HTTP contract, server setup, state lifecycle, and verification steps.

## Current implementation status

- `frontend/` contains local patient and clinician UI previews. They do not authenticate users or persist changes.
- `packages/ai/` contains standalone AI tooling and versioned Zod contracts. The interactive intake uses local Qwen; AMD access is optional and separately guarded.
- `backend/` contains SQL migrations, database schema definitions, authorization helpers, persistence contracts, and in-memory tests. It does not yet contain application routes, a Supabase client, or a concrete database adapter.
- Supabase Auth, live RLS verification, actual database persistence, and end-to-end AI integration remain unfinished.

Use synthetic data only. The [setup and handoff guide](SETUP_AND_HANDOFF.md) has package-by-package commands and detailed blockers.

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
| AI inference | Local Qwen3-0.6B for the current intake; AMD client is not used by the intake flow |
| Database | Supabase-hosted PostgreSQL |
| Database access | Drizzle ORM, subject to existing project conventions |
| Runtime validation | Zod |
| Authentication | Supabase Auth, if adopted |
| Testing | Vitest, React Testing Library, Playwright |
| Version control | Git and GitHub |

**Note:** AMD Token Factory support remains a separate, unverified capability. The current interactive intake uses local inference only and does not send AMD requests. The table describes the current intake provider and planned stack, not a claim that every component is already implemented.

Developer 1's AI package uses local embeddings for project-guidance retrieval. The current intake path is local-only; do not run AMD inference until explicitly approved.

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

## Getting Started and Testing

There is no root npm workspace. Install and run each package separately. For the current prerequisites, exact frontend and AI commands, local Supabase workflow, synthetic seed, migrations, tests, and deployment blockers, follow [SETUP_AND_HANDOFF.md](SETUP_AND_HANDOFF.md). That guide reflects commands and scripts actually present in this repository; there is no configured root `npm install` or Drizzle migration command.

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


