# Versioned intake and brief contract

Schema version: `1.0` (TypeScript and Zod source: `src/contracts.ts`)

## Information states

`reported`, `patient_denied`, `patient_corrected`, `declined`, `unknown`, `not_answered`, `not_asked`, `unclear`, and `conflicting` are distinct. Reported, denied, corrected, declined, unclear, and conflicting facts require source response IDs. Unknown, not-answered, and not-asked values must be `null`. A skipped answer is not a denial.

## Source convention

`sourceResponseIds` contains IDs already present in `IntakeState.responses`. Model output may only reference supplied IDs. Corrections are new patient responses with a `correctsResponseId` that points to an earlier response; the original response remains in the array. RAG chunk IDs cite project guidance and must never be substituted for patient response IDs.

Symptom-scoped timeline facts use stable field IDs such as `symptom_onset_headache` and `symptom_onset_visual_changes`. They are separate facts even when they share one source response. A global `onset` statement is retained as a general patient statement and is not copied to every reported symptom. Corrections can target a symptom-scoped field without changing another symptom's timeline.

## Valid synthetic intake example

```json
{
  "schemaVersion": "1.0",
  "concern": "Mild headache since yesterday",
  "responses": [{"id":"r1","text":"I have had a mild headache since yesterday.","sequence":0}],
  "fields": [{"fieldId":"timeline","value":"Since yesterday","status":"reported","sourceResponseIds":["r1"]}],
  "questionsAsked": [],
  "completion": "in_progress"
}
```

## Invalid synthetic example

```json
{"schemaVersion":"1.0","concern":"Headache","responses":[],"fields":[{"fieldId":"timeline","value":"Yesterday","status":"reported","sourceResponseIds":["invented-id"]}],"questionsAsked":[],"completion":"in_progress"}
```

It is invalid because the source response ID does not exist.

## Incomplete synthetic example

```json
{"schemaVersion":"1.0","concern":"Headache","responses":[{"id":"r1","text":"I have a headache.","sequence":0}],"fields":[{"fieldId":"onset","value":null,"status":"not_asked","sourceResponseIds":[]}],"questionsAsked":[],"completion":"in_progress"}
```

It is valid but incomplete: onset is not asked and must remain unknown to the summary rather than become a negative finding.

## AI boundary

`continueIntake` proposes one next assistant question, field updates, and a stable question ID. The interactive CLI keeps active question and answer-status history. A typed adaptive question bank filters by concern category and conversation evidence; there is no mandatory question sequence. The planner deduplicates by target field, skips established facts, keeps timelines symptom-scoped, and limits routine follow-ups. `generateBrief` builds a local `ai_generated_draft` from the validated intake facts; it does not ask the model to invent or source patient facts. Safety routing returns the matched evidence and guidance in an updated state. Persistence, clinician edits, authorization, actual transmission, and finalization remain outside this package; the CLI does not forward records. For the full behavior and limitations, see [the intake engineering report](intake-engineering-report.md).
