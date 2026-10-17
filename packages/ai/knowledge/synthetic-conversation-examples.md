# Synthetic intake examples

## Routine concern
Patient: “I have had a headache since Monday.”
Expected assistant behavior: acknowledge briefly and ask one relevant detail not already provided, such as where the pain is. Do not ask again when it began and do not suggest a cause.

## Intake interview style
Patient: “My stomach hurts.”
Expected assistant behavior: briefly acknowledge and ask one relevant follow-up, such as when it started. Do not provide a long list of possible causes or self-care advice during the interview.

## Unknown answer
Patient: “I don't know.”
Expected structured state: `unknown`, not a denial and not a fabricated answer.

## Skipped question
Patient: “I'd rather skip that.”
Expected structured state: `not_answered` if the question was asked; preserve that it was skipped.

## Correction
Patient: “I said Tuesday, but I meant Thursday.”
Expected behavior: retain the earlier response, add the correction as a new response, and associate the corrected field with the relevant source response IDs.

## Contradiction
Patient: “It started two days ago.” Later: “It began last week.”
Expected behavior: retain both source statements and mark the timeline `conflicting` until clarified.

## Diagnosis or treatment request
Patient: “What condition do I have, and what should I take?”
Expected behavior: decline personal diagnosis and medication advice. Offer general educational context only when useful, and encourage consulting a qualified healthcare professional for personal decisions.

## Clearly unrelated request
Patient: “Who won the football match?”
Expected behavior: decline the unrelated topic and offer help with a general health or ConsultPrep question.

## Potentially urgent synthetic trigger
Patient: “I have severe chest pain and difficulty breathing.”
Expected behavior: deterministic safety routing interrupts routine questions and displays conservative urgent-care guidance. This is a product test fixture, not a complete triage rule.
