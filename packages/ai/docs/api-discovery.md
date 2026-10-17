# AMD Token Factory API discovery report

Updated: 2026-10-17

## Findings

| Finding | Classification | Evidence / status |
|---|---|---|
| Public shared Model API base URL is `https://developer.amd.com.cn/radeon/api/v1`; chat endpoint is `POST /chat/completions`. | Confirmed by official documentation | [API overview](https://amd-aim.github.io/radeon-cloud-docs/api/overview/), [chat completions](https://amd-aim.github.io/radeon-cloud-docs/api/chat-completions/) |
| Shared Model API accepts a Bearer key and OpenAI-compatible `messages` request. | Confirmed by official documentation | [Authentication](https://amd-aim.github.io/radeon-cloud-docs/api/authentication/), [chat completions](https://amd-aim.github.io/radeon-cloud-docs/api/chat-completions/) |
| JSON object and JSON schema response formats are documented for models advertising `json_output`. | Confirmed by official documentation | [Chat completions](https://amd-aim.github.io/radeon-cloud-docs/api/chat-completions/), [model catalog](https://amd-aim.github.io/radeon-cloud-docs/api/models/) |
| Model catalog is dynamic; model IDs and `json_output` capabilities must be selected from the current catalog. | Confirmed by official documentation | [Model catalog](https://amd-aim.github.io/radeon-cloud-docs/api/models/) |
| Shared endpoint offers chat and model listing, not embeddings. A dedicated endpoint exposes its serving stack's endpoints and consumes instance credits. | Confirmed by official documentation | [API overview](https://amd-aim.github.io/radeon-cloud-docs/api/overview/), [FAQ](https://amd-aim.github.io/radeon-cloud-docs/resources/faq/) |
| Shared model service has rate/concurrency and daily allowance limits. | Confirmed by official documentation | [Rate limits](https://amd-aim.github.io/radeon-cloud-docs/api/rate-limits/), [FAQ](https://amd-aim.github.io/radeon-cloud-docs/resources/faq/) |
| Successful inference and structured response behavior. | Failed / not established | User-initiated Qwen3.8-Flash-Next requests returned no usable message content, including after configuring `reasoning_effort: none`; one other attempt timed out. No retry was made by the client. |
| Account model availability. | Confirmed by read-only catalog request and current docs | Catalog request returned `Qwen3.8-Flash-Next`; AMD's current docs list `GLM-5.3-Flash` with JSON output and support for low reasoning. Listings do not prove successful inference. |
| Observed latency. | Not recorded | The CLI did not capture per-turn timing. |
| Hackathon track eligibility for direct shared Model API usage. | Requires verification | The selected track's current official rules are not present in this repository. |

## Configuration decision

The AMD client uses `RADEON_BASE_URL`, `RADEON_API_KEY`, `RADEON_MODEL`, `RADEON_TIMEOUT_MS`, and optional `RADEON_REASONING_EFFORT`. The base URL defaults to the documented shared endpoint. The local ignored `.env` now selects `DeepSeek-V4-Flash` with `reasoning_effort: none`, based on AMD's published answer-only default and JSON capability. This is a configuration change, not a live-verified model selection or quality claim.

Selection criteria: choose a currently available text-in/text-out model whose catalog entry supports JSON output, and whose request parameters match the shared API. A model comparison is not claimed under the one-inference-request limit.

## Credit and usage policy

The project policy is stricter than the provider's published shared-endpoint credit model: do not make any live inference request until all offline work passes. The initial gate permits one synthetic chat completion and no retry. Record that one observation only; do not infer broader quality or safety performance from it.
