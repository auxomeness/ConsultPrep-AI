# ConsultPrep AI gap audit and next-step implementation

Updated: 2026-10-17

## Audit scope

Reviewed the intake planner, state/contracts, deterministic fact extraction, question library, AMD prompt/client path, source-linked brief builder, safety rules, terminal workflow, RAG package, and their offline tests. This package does not contain the host application's database, authentication/authorization, clinician UI, or delivery workflow, so those areas were audited for boundaries rather than claimed as implemented.

## Findings

| Area | Audit status | Evidence and gap |
|---|---|---|
| Adaptive conversation | Implemented, heuristic | `service.ts` owns one question planner; `question-bank.ts` uses symptom evidence and cues; model-suggested follow-up questions are discarded. Keyword matching can miss paraphrase, slang, spelling, and other languages. |
| Multi-symptom timelines | Implemented, heuristic | `intake-facts.ts` and `workflow.ts` store symptom-scoped onset and preserve correction evidence. Unsupported relationships are not inferred, but extraction still depends on explicit patterns. |
| Completeness | Previously missing as an explicit result; implemented in this pass | The planner had relevance/applicability rules but no first-class per-concern record of known, unknown, unclear, urgent, and workflow coverage states. `completeness.ts` now produces this record and the planner prioritizes its open required workflow criteria. |
| Clinical information standard | Not available | No clinician-authored/approved completeness criteria were found. The new minimum prompts are provisional engineering criteria, marked for clinician review; they are not a clinical standard or a readiness score. |
| Safety and escalation | Prototype only | `safety.ts` deterministically routes configured synthetic phrase patterns before model calls and stores matched evidence/guidance. It is not a complete or clinically validated escalation framework. |
| Evidence-backed brief | Implemented, heuristic extraction | `brief.ts` builds locally from validated state and links facts to patient response IDs and original text. Source validation establishes provenance, not truth or correct classification. |
| Completion and clinician handoff | Terminal-only / not connected | The CLI can show, correct, and locally confirm a draft, then truthfully reports it has not been sent. No persistence, clinician inbox, access control, editing, or finalization workflow exists in this package. |
| Privacy and recovery | Partial | AMD errors are normalized and inference is not automatically retried; local fallback and local state exist. Consent, retention/deletion, encryption, audit logging, durable session recovery, and persistence failure handling belong to the host application and are not implemented here. |
| Evaluation | Synthetic offline suite | Tests cover deterministic scenarios and mocked providers. No repeatability benchmark, clinician usefulness rating, clinical validation, live provider evaluation, or clinical performance metric is established. |
| RAG | Local project-guidance retrieval | Section-based project Markdown retrieval is implemented. The corpus is not an approved clinical knowledge base and is not used to support clinical claims or fill patient facts. |

## Implemented priority: documentation-completeness engine

`src/completeness.ts` builds per-symptom criteria from current patient evidence. It marks each criterion known, unknown, or clarification-needed; urgent routing takes precedence. It records whether an unknown item was actually asked, the underlying information state, and patient response source IDs. The initial provisional criteria require a timeline per reported symptom, relevant eye/vision details for reported vision changes, and breathing context for cough or chest discomfort.

The result is available to the centralized question planner and is included in the source-validated brief. Open required criteria can move ahead of optional questions. Explicitly unknown or declined answers remain visible as such and are not turned into denials. “Sufficiently covered” means only that the prototype's minimum documentation prompts have known answers or were explicitly recorded as unknown/declined. It does not mean clinically complete, safe, or ready for a medical decision. A safety event overrides coverage and stops ordinary question planning.

These criteria are provisional because this repository has no qualified clinician-authored information standard. A clinical owner must define and review category criteria before they are treated as required in a real service.

## Remaining roadmap

1. Have qualified clinicians define category-specific information standards and review each question, criterion, and safety action.
2. Improve extraction with confidence and ambiguity states, then evaluate paraphrase, spelling, slang, and multilingual synthetic cases without losing original wording.
3. Add a repeatable quality evaluation set for relevant question choice, deduplication, evidence fidelity, coverage, consistency, and safety-routing misses/false triggers.
4. Design the host application's consent, authorization, privacy/retention, durable recovery, persistence, clinician review/edit/finalization, and delivery states. Verify that every success message follows confirmed application/database state.
5. Run provider integration only under an explicit request budget. Mocked provider tests do not establish live model behavior.

## Verification for this pass

The offline suite covers distinct eye and cough completeness, per-symptom timelines, explicit unknown values, clarification, urgent precedence, planner behavior, and brief rendering. No AMD inference or persistence/handoff operation was performed.
