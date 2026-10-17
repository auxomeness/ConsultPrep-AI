# ConsultPrep AI — Frontend Project Context

## Project

**Product:** ConsultPrep AI

**Core principle:**  
AI documents. Clinicians decide.

ConsultPrep AI is a text-first AI-powered pre-consultation intake assistant.

The product helps a patient organize information about their concern before meeting a healthcare professional.

The intended high-level flow is:

Patient starts intake  
→ Patient provides responses  
→ AI generates follow-up questions  
→ Patient reviews collected information  
→ Structured consultation brief is generated  
→ Patient corrects and confirms information  
→ Case is submitted  
→ Authorized clinician reviews the consultation brief  
→ Clinician compares the brief against original patient statements  
→ Clinician may edit the draft  
→ Clinician explicitly finalizes the case

The system supports information gathering. It is not intended to perform medical decision-making.

The application must not:

- diagnose medical conditions;
- prescribe medication;
- recommend treatment;
- claim AI output is medically verified;
- replace professional medical judgment.

Only synthetic patient/test data may be used during development and demonstration.

---

# Team Ownership

This project is being developed by a three-person hackathon team.

## Member 1 — AI Integration Engineer

Member 1 owns:

- AMD Token Factory integration
- AI inference
- conversational behavior
- follow-up question generation
- structured consultation brief generation
- AI-side validation
- AI-side safety mechanisms
- AI response contracts

Do not recreate or replace these systems from the frontend.

---

## Member 2 — Full-Stack Engineer

Member 2 owns:

- backend/server APIs
- application persistence
- database schema
- authentication
- authorization
- patient/clinician workflow infrastructure
- submission integrity
- application status transitions

Do not introduce an alternative database, authentication system, or competing backend implementation.

When frontend behavior depends on unavailable backend functionality, document the required contract or blocker.

---

## Member 3 — Product, UI/UX & Quality Engineer

This frontend workspace primarily supports Member 3's responsibilities.

Member 3 owns:

- product experience
- UI/UX evaluation
- approved frontend UI improvements
- visual consistency
- responsive behavior
- accessibility evaluation
- interface state design
- usability requirements
- frontend quality assurance
- component testing
- integration verification
- defect reporting
- regression verification
- synthetic safety-scenario evaluation
- demonstration readiness
- quality documentation

The objective is not simply to make the interface visually attractive.

The interface must be understandable, accessible, responsive, predictable, and transparent about the information being displayed.

---

# Current Frontend Technical Context

The actual frontend repository currently uses:

- React
- TypeScript

The repository itself is the source of truth for:

- build tool
- routing library
- styling solution
- installed component libraries
- testing frameworks
- directory conventions
- package scripts

Do not assume that technologies listed in the original hackathon specification are installed.

In particular, do NOT migrate the current React application to Next.js merely because Next.js appears in the original expected architecture.

Before installing any dependency:

1. inspect `package.json`;
2. inspect existing implementation patterns;
3. determine whether the dependency is actually necessary;
4. prefer existing project tools.

Avoid adding overlapping component libraries or design systems.

---

# Product Experience Requirements

## Patient Experience

The patient interface should provide:

- clear explanation of the application's purpose and limitations;
- understandable way to begin an intake;
- simple text-based conversation;
- clear distinction between questions and patient responses;
- appropriate one-question-at-a-time interaction;
- ability to indicate uncertainty;
- ability to skip questions where supported;
- ability to correct previous responses;
- visible loading feedback;
- meaningful error feedback;
- preservation of entered information where possible;
- readable consultation brief review;
- explicit confirmation before submission;
- truthful success or failure feedback.

Avoid:

- confusing or leading questions;
- unnecessary steps;
- visual clutter;
- vague button labels;
- false success messages;
- presenting AI-generated information as verified medical information;
- hiding important state information.

---

# Clinician Experience Requirements

Where supported by the integrated application, clinicians should be able to:

- find submitted cases;
- understand case status;
- open consultation briefs;
- inspect original patient statements;
- identify unanswered information;
- identify unknown information;
- identify unclear information;
- identify conflicting information;
- distinguish patient-reported information from AI-generated information;
- distinguish patient corrections from clinician edits;
- edit authorized drafts;
- save authorized changes;
- explicitly finalize a case;
- identify finalized documentation.

Source traceability is particularly important.

A clinician should be able to determine which original patient statement supports an important consultation-brief entry.

---

# Information-State Rules

These states must not be treated as interchangeable:

- Reported
- Patient denied
- Unknown
- Not answered
- Not asked
- Unclear
- Conflicting
- AI-generated interpretation
- Patient-corrected
- Clinician-edited
- Clinician-finalized

Important rules:

- A skipped response must not become a denial.
- Unknown information must not become a confirmed fact.
- Missing information must not become a negative finding.
- Conflicting information should remain visible until resolved.
- Corrections must not silently erase original patient statements.
- AI-generated information must remain distinguishable from patient-provided information.
- Draft information must remain distinguishable from submitted or finalized information.
- Source references must point to the correct original information.

---

# UI/UX Quality Requirements

## Visual hierarchy

Maintain consistent:

- page titles
- section headings
- labels
- body text
- metadata
- primary actions
- secondary actions
- statuses
- spacing
- borders
- radii
- icons

Status indicators must include understandable text and must not depend only on color.

Prefer clarity over decorative effects.

---

## Responsive Design

Evaluate representative:

- mobile
- tablet
- desktop

Check for:

- horizontal overflow;
- clipped controls;
- overlapping content;
- inaccessible actions;
- unusable forms;
- broken conversation layouts;
- unreadable consultation briefs;
- source-reference layout problems;
- sticky/fixed content covering important controls.

---

## Interaction States

Important interactions should account for:

- idle
- loading
- success
- empty
- validation error
- operation error
- disabled
- retry

Loading indicators must correspond to real operations.

Success feedback must only appear after successful operations.

Navigation must not silently discard user-entered information.

---

# Accessibility Expectations

Use:

- semantic HTML;
- associated form labels;
- accessible control names;
- keyboard-accessible interactions;
- visible focus states;
- sufficient contrast;
- meaningful error messages.

Information must not depend exclusively on color.

Evaluate important status changes and form interactions for screen-reader compatibility where practical.

Do not claim full accessibility compliance unless an appropriate audit has actually been performed.

---

# Frontend Quality and Testing

Use existing testing infrastructure where possible.

Before installing testing tools, inspect `package.json`.

Relevant testing areas include:

## Unit / presentation logic

- status mapping;
- conditional rendering;
- formatting;
- validation;
- source-reference presentation.

## Component tests

- patient response submission;
- skipped responses;
- unknown responses;
- correction interactions;
- loading states;
- error states;
- consultation brief review;
- clinician controls;
- unavailable actions;
- source-linked information.

## End-to-end workflows

Where integrations are available:

Patient:

Start intake  
→ answer questions  
→ receive AI follow-up  
→ review brief  
→ correct information  
→ confirm  
→ submit

Clinician:

Open submitted case  
→ inspect sources  
→ review draft  
→ edit  
→ save  
→ explicitly finalize  
→ verify resulting status

Mocks may be used for explicitly scoped component or failure tests.

A mocked result must NEVER be described as proof that the real integration works.

---

# Failure Conditions to Evaluate

Where supported, evaluate:

- AI service unavailable;
- AI timeout;
- malformed AI output;
- network interruption;
- failed persistence;
- duplicate submission;
- missing source reference;
- invalid status transition;
- unauthorized record access;
- unauthorized clinician action.

The UI must never invent information to compensate for unavailable AI responses.

Failed operations must not show false success feedback.

---

# Synthetic Safety Testing

Synthetic safety scenarios may include potentially urgent symptoms.

Frontend evaluation should verify that approved safety guidance:

- becomes visible when triggered;
- is not delayed until completion of routine intake;
- remains understandable;
- does not claim the application diagnosed a condition;
- does not recommend treatment;
- does not provide false reassurance;
- preserves the user's original statement where supported.

Frontend work does NOT define clinical triage thresholds.

Those rules belong to the agreed AI/product safety contract.

---

# Defect Reporting

When identifying a defect, record:

- ID
- title
- affected feature
- environment
- preconditions
- reproduction steps
- expected behavior
- actual behavior
- severity
- priority
- owner
- evidence
- status
- retest result

Severity:

**Critical**
Safety/security/privacy failure, critical corruption, or critical workflow risk.

**High**
Major workflow failure or serious information misrepresentation.

**Medium**
Substantial usability or functional problem with a workaround.

**Low**
Minor visual, copy, or interaction inconsistency.

Do not mark a defect fixed until the corrected behavior has actually been retested.

---

# Development Rules

1. Inspect before changing.
2. Preserve existing functionality.
3. Follow existing repository conventions.
4. Prefer existing components.
5. Avoid unnecessary dependencies.
6. Do not rebuild Member 1's AI systems.
7. Do not rebuild Member 2's backend systems.
8. Use synthetic data only.
9. Test actual behavior whenever integration is available.
10. Clearly label mocked behavior.
11. Test failure paths as well as success paths.
12. Record expected and observed results.
13. Never claim something passed without evidence.
14. Report blockers instead of hiding them.
15. Keep frontend changes incremental and reviewable.

---

# Current Development Priority

Follow this general order:

1. Repository discovery
2. Workflow discovery
3. Acceptance criteria
4. UI/UX audit
5. Prioritized frontend improvements
6. Frontend test preparation
7. Patient workflow testing
8. Clinician workflow testing
9. Integration/failure testing
10. Regression testing
11. Demo preparation
12. Final quality report

Do not attempt all phases simultaneously.

---

# First Milestone

The first milestone is to understand and verify the smallest functioning patient workflow.

Before major implementation, determine:

- what already exists;
- current React structure;
- routing;
- styling conventions;
- reusable components;
- implemented patient screens;
- implemented clinician screens;
- loading/error/success states;
- current API boundaries;
- current testing tools;
- accessibility issues;
- responsive-layout issues;
- available AI integration;
- available backend integration;
- highest-priority frontend defects.
