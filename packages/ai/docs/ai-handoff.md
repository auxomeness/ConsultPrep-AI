# Developer 1 AI integration handoff

## Package purpose

`@consultprep/ai` is a server-side TypeScript module for local-first patient intake, local RAG over project guidance, domain-limited health/system Q&A, validated brief drafts, and an optional AMD client. The current interactive intake uses `LocalQwenChatClient`; it does not load AMD credentials or call AMD. The package does not persist records or control application status.

The host can compose the public interface with `loadAmdConfig()`, `new AmdChatClient(config)`, and `createDefaultRetriever()`; pass those to `createAiService(client, retriever)`.

Use `answerQuestion({ question })` for general educational health questions or ConsultPrep system questions. Its lexical scope gate rejects clearly unrelated topics before inference, blocks recognized personal diagnosis/treatment requests, and routes a few configured urgent phrases to static guidance. It is a conservative heuristic, not a complete or adversarially robust classifier. Callers must not treat it as a guarantee that every accepted question is safe.

## Setup

```sh
cd packages/ai
npm install
npm run typecheck
npm test
npm run build
npm run embeddings:check
```

Set `RADEON_API_KEY`, `RADEON_MODEL`, and optional `RADEON_BASE_URL`, `RADEON_TIMEOUT_MS`, and `RADEON_REASONING_EFFORT` in the local runtime environment or a local secret manager. The local ignored `.env` selects `DeepSeek-V4-Flash` with reasoning disabled; AMD documents JSON output support, but no live request has verified this configuration here. The `.env.example` is documentation only. Never put the key in chat, source files, or a `NEXT_PUBLIC_` variable; never commit credentials.

The embedding model `Xenova/all-MiniLM-L6-v2` is loaded locally by Transformers.js and may need a one-time model download. It does not call AMD. `npm run embeddings:check` exercises the real local embedding/retrieval path. A small in-memory index is built from `knowledge/*.md`.

## Knowledge and retrieval choices

The corpus is deliberately limited to ConsultPrep workflow rules and synthetic examples. Retrieval adds up to four project-guidance sections for system questions and draft briefs; patient interview turns skip it because the corpus contains no clinical references and retrieval would add latency without helping organize symptoms. Retrieved content is supporting project context, not patient evidence or a clinical reference. Medical Q&A currently relies on the selected model's general knowledge and is not grounded in an approved clinical corpus. Do not describe those answers as sourced, verified, or ready for patient-facing deployment. No fine-tuning is used: project facts live in the curated corpus, and behavior is guided by system instructions and runtime validation. The corpus is small and process-local, so a separate orchestration framework or hosted vector database would add infrastructure without a current need.

## Service contract

- `continueIntake({ state, latestResponseId? })` returns `{ assistantMessage, askedQuestion, fieldUpdates }`, or `{ safety }` when a deterministic synthetic safety rule routes the interaction.
- `answerQuestion({ question })` returns `{ scope, answer }` for health/system questions or a static out-of-scope response. See the limitations below before exposing this operation to users.
- `startIntake()` returns the initial patient-facing prompt and an empty versioned state without invoking AMD.
- `generateBrief({ state })` returns a schema-versioned `ai_generated_draft`. Fields that assert patient information must cite response IDs already present in the supplied state.
- `AmdChatClient.complete(messages, options?)` sends one JSON-mode request to `/chat/completions` and maps provider failures to `AiServiceError` codes. It never retries automatically.
- The host application validates its own request boundary and remains responsible for persistence, authorization, confirmation, submission, and clinician finalization.

## Smoke test

After all offline checks pass and the project owner chooses an available model that advertises JSON output:

```sh
AMD_LIVE_SMOKE_CONFIRM=RUN_SINGLE_REQUEST npm run smoke:amd
```

This script sends one synthetic request and no retry. It prints the model, latency, schema validity, and synthetic response; it never prints credentials. Do not run it before the offline completion gate.

## Try the interactive patient interview

The frontend intake page is currently a disconnected preview. The interactive interview runs with the local Qwen3-0.6B model as its only generation provider; it does not read AMD credentials or call AMD. Start it with:

```sh
LOCAL_INTAKE_CHAT_CONFIRM=START_INTERACTIVE_CHAT npm run chat:intake
```

The assistant opens with an intake question. A typed adaptive question bank covers eye/vision, respiratory, throat/nose/ear, general, headache/neurological, digestive, skin, musculoskeletal, urinary, and other concerns. The centralized planner gates questions against the patient's reported symptoms and conversation cues; it does not run the bank as a universal checklist. It extracts facts before selecting at most one relevant question, deduplicates by explicit target concept, avoids sufficiently answered fields, clarifies unclear/conflicting fields once, and caps routine follow-ups at eight. The provisional completeness engine tracks known, unknown, unclear, urgent, and workflow-covered criteria per concern, prioritizes open required documentation questions, and includes those states in the review brief. Its requirements are not clinician-defined or clinically validated. It stores individual onset details in symptom-scoped fields such as `symptom_onset_visual_changes`; different start times remain separate. A new symptom changes the candidate set. The planner discards model-generated questions before display. These prompts are prototype content requiring clinician review, not a clinical protocol. A finish request prints the current unconfirmed draft and exits; confirming the completion question proceeds to the draft review instead of reopening optional questions. `/summary` displays the current draft without advancing or ending the conversation; `/exit` exits. Process questions receive a deterministic explanation that this terminal demo displays a local draft and does not save or send it. The Qwen3-0.6B weights are Apache-2.0 licensed; this ONNX quantization runs locally in 4-bit mode on CPU and is downloaded/cached on first use. It uses no inference API or request credits. The first reply may take longer while the model loads. If local generation fails, deterministic intake prompts keep the chat moving. The local model is not a semantic memory system, so it can still miss paraphrases. Intake instructions prohibit interpreting reported temperatures or guessing a likely cause; application output filtering rejects several unsupported clinical inferences and treatment claims. Configured safety rules interrupt the interview for selected synthetic urgent phrases and record the rule, patient response references, and guidance in the in-memory state. These keyword rules are incomplete, conservative prototype triggers, not a comprehensive or clinically validated triage system. Intake responses stay in process memory and are not persisted by this CLI. The review flow presents a short narrative overview, a symptom list, timeline, patient-reported actions, compact source references, and a separately labeled general comfort-information note. The note uses limited, non-medication guidance from linked NHS and MedlinePlus pages, is omitted after an automated urgent flag, and is not part of the validated clinician evidence; it needs qualified clinical review before production. The brief lets the patient correct and locally confirm it. Confirmation does not transmit the brief; the CLI explicitly says clinician handoff has not happened. A host application must implement authorized delivery. Use synthetic information only; it does not print credentials.

See [the comprehensive intake engineering report](intake-engineering-report.md) for the root-cause audit, schema behavior, synthetic brief, RAG evaluation, exact verification results, and remaining limitations.
See [the frontend/backend AI integration guide](frontend-backend-integration.md) for the proposed route contract, server-side local AI setup, turn-state handling, and UI flow. Those routes are not implemented yet.
See [the gap audit](gap-audit.md) for the current completeness-engine status, product gaps, and follow-up roadmap.

Transformers.js emits a `dtype not specified for "model"` warning when loading the local MiniLM embedding pipeline if no dtype is supplied. The package now explicitly selects fp32 on CPU for this small embedding model, matching the library's prior CPU default. This removes ambiguity but does not improve embedding speed.

The local ignored `.env` is configured with an account-listed model and key. Do not commit that file. For safety, keys pasted into chats should normally be rotated before use.

## Known limitations and blockers

- This repository contains project guidance, not a verified clinical knowledge source. RAG must not supply diagnoses or treatment advice.
- Local embedding/retrieval quality requires evaluation on approved project queries; mock-vector unit tests do not establish semantic quality.
- User-initiated Qwen3.8-Flash-Next requests returned no answer content or timed out despite a no-reasoning setting. A GLM-5.3-Flash request then exhausted the 700-token response limit with low reasoning. The local model is now set to DeepSeek-V4-Flash with reasoning disabled based on AMD's published behavior; no live request has confirmed it works or is faster.
- No model comparison or real-model safety scenario is established by offline tests.
- Hackathon track eligibility and AMD account-specific model selection remain project-owner verification items.
- The urgent rules are narrow synthetic examples, not a complete triage mechanism.
- Scope and personal-advice checks are keyword heuristics. They can miss paraphrases and are not a safety guarantee; add adversarial and model evaluation before any real patient use.
- General health Q&A lacks curated clinical-source retrieval. A vetted, maintained source set and answer-grounding work are required before claiming evidence-based answers.
- The package does not implement application auth, database writes, or patient/clinician UI.
