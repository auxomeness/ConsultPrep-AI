# Clinical intake engineering report

Updated: 2026-10-17

## Patient-specific hardening pass

The initial implementation still made all universal questions eligible for all intakes and stored onset in a single `onset` field. That left a fixed-feeling sequence and could blur the timing of two separate symptoms. The current pass changes the planner and evidence handling:

- `isQuestionApplicable` now gates each bank item against reported symptom evidence and conversation cues. Prior episodes, episode pattern, triggers, context, actions taken, and patient goals are only eligible when the patient says something that makes them relevant. Questions about another symptom category are excluded. The bank remains a library; it no longer defines a mandatory sequence.
- The planner creates a patient-specific onset question using reported symptom labels. It stores dates as fields such as `symptom_onset_eye_soreness` and `symptom_onset_visual_changes`, retaining each response ID. A statement that explicitly says “these symptoms started…” may apply the same time to the named symptom set; a vague singular onset is not copied across symptoms. A response with different dates keeps those values separate.
- Explicitly negated symptoms are stored as patient denials and are excluded from the active symptom set. A denied cough therefore does not trigger respiratory follow-up for an unrelated digestive concern.
- New symptoms create a new relevant candidate. If the patient introduces a new symptom while responding to an earlier onset prompt, the old onset prompt is not reissued as part of a larger question. It remains an unresolved brief item.
- For cough, a breathing-difficulty question has higher priority than routine onset questions. Deterministic urgent rules still interrupt before the planner runs.
- An explicit finish request exits to the current draft. A “yes/that's all” response to the completion check now proceeds to summary review instead of reopening optional questions.
- Safety-routing results carry an updated intake state with `completion: ready_for_review`, the source response IDs, the rule, and the actual guidance text. The CLI records the same event before stopping. The brief can display that stored guidance with its patient source.

The following files were changed for this pass: `src/question-bank.ts` (applicability rules and reported symptom inventory), `src/service.ts` (patient-specific candidates, safety state, and selection), `src/intake-facts.ts` (symptom-scoped timeline extraction), `src/workflow.ts` (symptom-scoped corrections), `src/brief.ts` (symptom timelines, relevant gaps, and saved safety guidance), `scripts/interactive-chat.ts` (completion and safety state transitions), and tests covering the new behavior.

## Completeness and gap-audit pass

The follow-up audit found that the implementation had adaptive question eligibility but no explicit per-concern completeness result. `src/completeness.ts` now records each provisional requirement as known, unknown, or clarification-needed, including whether the patient was asked, the underlying information status, and evidence response IDs. A matching configured safety event takes precedence as potentially urgent. The planner prioritizes open required documentation criteria, and `brief.ts` includes the versioned completeness result in the patient-review draft. “Sufficiently covered” is strictly a minimum-documentation workflow state and never a statement of clinical completeness or safety. Criteria are provisional pending qualified review. See [the gap audit](gap-audit.md) for the repository-wide findings and remaining work.

## Audit findings and confirmed root causes

The repository audit found that several earlier conversation failures came from the application accepting too much control from the model and maintaining too little structured conversation state:

- The model could contribute its own follow-up question while a separate local planner also added one. That allowed repeated, overlapping, or stale questions in one turn.
- The planner used a small generic checklist and did not track stable question IDs and answer status. It could not distinguish answered, declined, unclear, or conflicting details well enough to avoid repetition.
- Fact extraction did not consistently use the active question, so short responses such as “worse” and “none” could be attached to the wrong topic or treated as an unknown.
- Summary generation had a narrow shape, mixing symptom evidence, timeline, impact, and patient concerns. It did not have space to list the most relevant gaps or expose local confirmation versus clinician review.
- The CLI’s finish and confirmation paths are local state transitions. No persistence or clinician-delivery operation exists, so it must not suggest that anything was transmitted.

The AMD client already normalizes provider errors and does not retry; its behavior and provider were preserved. RAG already chunks project-owned Markdown and uses local MiniLM embeddings. The corpus has no reviewed clinical references, so it is not used to support medical answers or determine patient facts. No clinical document or diagnosis knowledge was added.

## What changed

- `src/question-bank.ts` provides typed, stable question definitions for eye/vision, respiratory, throat/nose/ear, general, headache/neurological, digestive, skin, musculoskeletal, urinary, and other concerns. It includes universal history prompts, relevance metadata, purpose, target field, priority, answer type, safety marker, sufficiency expectation, and clinician-review marker.
- `src/service.ts` is the central question selector. It uses locally extracted facts and response history, filters to relevant categories, deduplicates by target concept, checks for answered and unclear/conflicting fields, selects one question, and caps routine follow-ups at eight. It discards model-proposed questions before formatting the final turn. Invalid model output falls back without an automatic second inference request.
- `src/contracts.ts`, `src/intake-facts.ts`, `src/workflow.ts`, and `scripts/interactive-chat.ts` retain original response text and IDs, structured values, explicit information statuses, active question IDs, question history, and correction links. One response may populate multiple supported fields. Subjective feverishness stays separate from a measured temperature. The correction flow preserves the earlier response and adds a new source.
- `src/brief.ts` constructs the report locally from validated state; model output is not the source of brief facts. It includes reason for consultation, symptoms, timeline, functional impact, background, associated responses, relevant unanswered questions, patient concerns, safety flags, source traceability, and status/limitations. Uncollected medical history, medications, and allergies are not assumed to be absent.
- `src/safety.ts` retains deterministic prototype routing and handles configured examples before routine intake. Rules now include eye chemical exposure, sudden confusion/loss of consciousness, and sudden severe weakness. These phrases and actions are prototypes, not a complete triage protocol.
- `tests/question-bank.test.ts` adds category detection and relevance checks. Fact, brief, safety, and service tests cover multi-fact answers, ambiguity, duplicate-question prevention, new safety triggers, and unknown/conflicting information.

## Question selection and deduplication

Category matching is deterministic and keyword-based. Universal questions remain eligible, while category-specific questions require a detected matching category. Candidates are sorted by priority and deduplicated on their explicit `targetConcept`; the planner returns at most one. A field with reported, denied, declined, unknown, not-answered, or not-asked status is not repeatedly requested as missing. Unclear or conflicting fields can receive one targeted clarification, and question history prevents repeating that clarification. The routine follow-up cap is eight, independent of the opening and final confirmation questions.

This is a short, adaptive prototype, not a comprehensive clinical interview. Question wording and coverage require qualified clinical review before real-patient use.

## Structured intake and evidence

The versioned intake state includes patient responses, source-linked fields, active question ID, question history, completion status, and optional safety state. Field statuses distinguish reported, patient denied, corrected, declined, unknown, not answered, not asked, unclear, and conflicting. Correction responses point to the earlier response; the original text is retained. The brief validator checks source IDs and original quotations against the state. These checks verify provenance, not clinical truth.

## Synthetic consultation brief example

For synthetic responses “I have a headache that started yesterday and is getting worse” and “It has made it hard to work,” the report is structured as follows (source IDs are illustrative):

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONSULTPREP  |  PRE-CONSULTATION SUMMARY
DRAFT · AWAITING PATIENT CONFIRMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

OVERVIEW

  You came to organize a concern about headache. You also reported headache.
  This summary records what you shared; it does not identify a cause or
  diagnosis.
REASON FOR VISIT

  • Headache [r1]
REPORTED SYMPTOMS

  • Headache [r1]
TIMELINE

  • Onset: Yesterday [r1]
  • Progression: Worsening [r1]
DAILY IMPACT

  • Hard to work [r2]
WHAT YOU HAVE TRIED

  Not established during intake.
STILL TO CLARIFY

  • [only relevant unresolved questions, with status]
YOUR ORIGINAL ANSWERS

  [r1] “I have a headache that started yesterday and is getting worse”
  [r2] “It has made it hard to work”

HANDOFF STATUS
  Patient confirmation: not yet confirmed. Clinician review: not available.
  This terminal demo has not sent the summary to a clinician.

GENERAL COMFORT INFORMATION FOR YOU

  • For a headache, drinking water and resting may help with comfort.
  • These are general comfort measures, not a diagnosis or a personalized
  treatment plan. If symptoms are severe or suddenly worsen, seek urgent
  medical care. Follow any advice already given to you by a healthcare
  professional.
SOURCES FOR COMFORT INFORMATION
  NHS 111 Wales — Headache
    https://111.wales.nhs.uk/encyclopaedia/h/article/headache/

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PLEASE NOTE
  [the professional-advice warning is wrapped to fit the terminal]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

The formatter wraps text to fit the terminal, shows the intake as a short narrative plus symptom bullets, records actions tried separately, and keeps source references compact beside facts. It always shows original answers and the professional-advice warning. For selected mild cold-like, feverish, headache, or vomiting reports, it adds a separate patient comfort-information note with official source links; this note is not included in the validated clinician evidence and is omitted when an automated urgent flag is present. Advice is limited to simple, non-medication comfort measures and needs clinician review before production. The terminal interview displays the professional-advice notice before asking the opening question, including the instruction to seek urgent care for severe or sudden symptoms rather than wait to finish. It does not add a diagnosis or treatment recommendation.

## Corrections, confirmation, and handoff

The CLI lets a patient review, correct, and locally confirm the draft. Corrections are stored as new response evidence and supersede the corrected value for display while the original statement remains traceable. A confirmation marks the state `completed` and `patientConfirmed: true`; it does not mean clinician approval or delivery. A terminal demo explicitly says that it has not saved or sent the brief. There is no persistence, authentication, submission, or clinician handoff implementation in this package.

## RAG audit

The package retains an in-memory index over project-owned Markdown, section-based chunks, source metadata, and local `Xenova/all-MiniLM-L6-v2` embeddings. `npm run embeddings:check` completed successfully on 2026-10-17 and retrieved the “Unknown answer” and “Information states” chunks for the query “How are unknown answers represented?” with cosine scores 0.594 and 0.418. Existing RAG unit tests also pass. This only evaluates retrieval of project guidance. Medical Q&A is not grounded in an approved clinical corpus, and retrieval is not used to infer diagnoses or fill patient facts.

## Offline verification

Executed in `packages/ai` on 2026-10-17:

- `npm run typecheck` — passed.
- `npm test` — 14 test files, 136 tests passed. Coverage includes subjective feverishness (“I feel hot”), patient-described cold-like symptoms, past-tense vomiting extraction, onset clarification, narrative summary rendering, action history, source-linked comfort information, and suppression of comfort tips after an urgent safety flag. Provider calls in these tests are mocked; no AMD or local language-model inference was made.
- `npm run build` — passed.
- `git diff --check` — passed.
- `npm run embeddings:check` — passed using the local embedding model and in-memory project corpus.

No live AMD inference was made for this change. Model quality, latency, broad safety behavior, and real-provider responses remain unverified.

## Limitations and required review

- This is an unvalidated prototype; the question bank and keyword safety rules need review by qualified healthcare professionals.
- The safety rules are incomplete and may miss urgent descriptions or match a phrase incorrectly. A no-match does not rule out danger.
- Fact extraction and category detection are limited deterministic patterns. They can miss paraphrases, languages, spelling variants, context, or conflicting meanings. Symptom-specific timeline extraction is particularly dependent on explicit wording and should not be mistaken for clinical interpretation.
- The maximum of eight follow-ups can leave relevant questions unanswered; the brief lists some gaps but is not a clinical completeness score.
- Medical general-information answers are not grounded in a vetted, versioned clinical corpus.
- The scope and personalized-advice gates are heuristics, not a safety guarantee.
- Patient correction field selection is heuristic and should be reviewed against a broader synthetic correction set.
- Authentication, persistence, authorization, clinician UI, and actual handoff belong to the host application and are not implemented here.
- No clinical validation, diagnosis accuracy, emergency sensitivity/specificity, or patient-care effectiveness is claimed.
