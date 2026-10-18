"use client";

import { useState } from "react";

type ReviewField = {
  label: string;
  value: string;
  origin: "Synthetic AI draft example" | "Patient-corrected" | "Reported by patient" | "Clinician-edited";
  sourceIds: string[];
  state?: "unknown" | "unanswered" | "conflict";
};

const responseRows = [
  { id: "source-1", label: "Main concern", state: "Reported", text: "Synthetic demo: intermittent discomfort near my left shoulder." },
  { id: "source-2", label: "When it began", state: "Unknown", text: "The patient selected “I’m not sure.”" },
  { id: "source-3", label: "Timing", state: "Reported · earlier response", text: "Synthetic demo: it started about two days ago." },
  { id: "source-4", label: "Timing", state: "Patient-corrected", text: "Synthetic demo: correction says it may have started last week." },
];

const initialFields: ReviewField[] = [
  { label: "Main concern", value: "Intermittent discomfort near the left shoulder.", origin: "Synthetic AI draft example", sourceIds: ["source-1"] },
  { label: "When it began", value: "Patient is unsure.", origin: "Reported by patient", sourceIds: ["source-2"], state: "unknown" },
  { label: "Timing", value: "The patient gave different timeframes: about two days ago and possibly last week. Clarify during consultation.", origin: "Synthetic AI draft example", sourceIds: ["source-3", "source-4"], state: "conflict" },
  { label: "Related details", value: "Not answered in this intake.", origin: "Synthetic AI draft example", sourceIds: [], state: "unanswered" },
  { label: "Patient wording", value: "“I would like to ask about the discomfort.”", origin: "Patient-corrected", sourceIds: ["source-1"] },
];

export default function ClinicianWorkspace() {
  const [fields, setFields] = useState(initialFields);
  const [confirmed, setConfirmed] = useState(false);
  const [operationMessage, setOperationMessage] = useState("");
  const hasLocalEdits = fields.some((field, index) => field.value !== initialFields[index]?.value);

  function updateField(index: number, value: string) {
    setFields((current) => current.map((field, itemIndex) => itemIndex === index ? { ...field, value, origin: "Clinician-edited" } : field));
    setOperationMessage("");
  }

  function reportNotConnected(action: "save" | "finalize") {
    setOperationMessage(action === "save"
      ? "Revision not saved. Secure clinician authentication and database persistence are not connected; your edits remain only in this open page."
      : "The case was not finalized. Secure clinician authentication and database persistence are not connected, so no status or record changed.");
  }

  return (
    <main className="clinician-page">
      <header className="site-header">
        <a className="brand" href="/" aria-label="ConsultPrep AI home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>ConsultPrep <span className="brand-light">AI</span></span>
        </a>
        <span className="prototype-pill"><span aria-hidden="true" /> Clinician demo</span>
      </header>

      <div className="clinician-container">
        <div className="clinician-heading">
          <div>
            <p className="eyebrow">CLINICIAN WORKSPACE</p>
            <h1>Case review</h1>
            <p className="page-subtitle">Review what the patient shared, compare the draft with its sources, and record your own clinical documentation.</p>
          </div>
          <span className="clinician-status">Synthetic case · not connected</span>
        </div>

        <div className="prototype-notice" role="note">
          <span className="notice-icon" aria-hidden="true">i</span>
          <p><strong>Demonstration workspace.</strong> This page uses synthetic sample information. Sign-in, assignment checks, revision saving, and finalization are not connected. Never enter real patient information here.</p>
        </div>

        <div className="clinician-layout">
          <aside className="content-card case-queue" aria-labelledby="queue-title">
            <div className="queue-heading">
              <div><p className="eyebrow">ASSIGNED TO YOU</p><h2 id="queue-title">Cases <span className="queue-count">1</span></h2></div>
              <span className="small-note">Demo</span>
            </div>
            <article className="case-list-item selected" aria-current="true">
              <span className="case-item-top"><strong>Demo case CP-001</strong><span className="case-status submitted">Submitted</span></span>
              <span className="case-item-patient">Synthetic patient · no real identity</span>
              <span className="case-item-date">Submitted 17 Oct 2026</span>
            </article>
            <p className="queue-footnote">Only cases assigned to the signed-in clinician should appear here. Assignment-based access is not active in this demo.</p>
          </aside>

          <section className="content-card case-review" aria-labelledby="case-title">
            <div className="case-detail-heading">
              <div><p className="eyebrow">SUBMITTED CONSULTATION</p><h2 id="case-title">Demo case CP-001</h2></div>
              <span className="case-status submitted">Submitted · awaiting clinician review</span>
            </div>

            <dl className="case-metadata">
              <div><dt>Patient</dt><dd>Synthetic patient</dd></div>
              <div><dt>Submitted</dt><dd>17 Oct 2026 · demo timestamp</dd></div>
              <div><dt>Source responses</dt><dd>{responseRows.length} preserved entries</dd></div>
            </dl>

            <section className="review-section" aria-labelledby="brief-title">
              <div className="section-title-row">
                <div><p className="eyebrow">CONSULTATION BRIEF</p><h3 id="brief-title">Draft for clinician review</h3></div>
                <span className="draft-pill">Not finalized</span>
              </div>
              <p className="clinician-helper">AI-generated content is an organizational draft. Compare it with the patient’s original statements before relying on or changing it.</p>

              <div className="clinician-fields">
                {fields.map((field, index) => (
                  <article className={`clinician-field ${field.state ? `state-${field.state}` : ""}`} key={field.label}>
                    <div className="clinician-field-heading">
                      <h4>{field.label}</h4>
                      <span className={`information-tag ${field.state === "unknown" || field.state === "conflict" ? "unknown" : field.state === "unanswered" ? "not_asked" : ""}`}>
                        {field.state === "unknown" ? "Unknown · patient-reported" : field.state === "unanswered" ? "Unanswered" : field.state === "conflict" ? "Conflicting responses" : field.origin}
                      </span>
                    </div>
                    {field.state === "conflict" && <p className="conflict-callout"><strong>Needs clarification.</strong> The patient provided two different timeframes. Both source statements remain available below.</p>}
                    <label className="visually-hidden" htmlFor={`clinician-field-${index}`}>Clinician draft: {field.label}</label>
                    <textarea id={`clinician-field-${index}`} value={field.value} onChange={(event) => updateField(index, event.target.value)} rows={field.value.length > 90 ? 3 : 2} aria-describedby={`field-origin-${index}`} />
                    <div className="field-provenance" id={`field-origin-${index}`}>
                      <span>{field.origin}</span>
                      {field.sourceIds.length > 0 ? <span>Sources: {field.sourceIds.map((sourceId, sourceIndex) => <span key={sourceId}>{sourceIndex > 0 ? ", " : ""}<a href={`#${sourceId}`}>{sourceRowsLabel(sourceId)}</a></span>)}</span> : <span>No supporting response was recorded.</span>}
                    </div>
                  </article>
                ))}
              </div>

              <div className="review-legend" aria-label="Information labels">
                <strong>Information labels:</strong> patient-reported, patient-corrected, synthetic AI-draft example, unknown, unanswered, conflicting, clinician-edited.
              </div>
            </section>

            <section className="review-section source-section" aria-labelledby="source-title">
              <div className="section-title-row"><div><p className="eyebrow">SOURCE RECORD</p><h3 id="source-title">Original patient responses</h3></div><span className="count-pill">{responseRows.length} entries</span></div>
              <p className="clinician-helper">These statements are shown as recorded. A later correction does not erase the earlier response.</p>
              <ol className="source-list">
                {responseRows.map((response, index) => (
                  <li id={response.id} className="source-entry" key={response.id}>
                    <span className="source-sequence">{index + 1}</span>
                    <div className="source-entry-content">
                      <div className="source-entry-heading"><strong>{response.label}</strong><span className={`information-tag ${response.state.includes("Unknown") ? "unknown" : response.state.includes("corrected") ? "" : "skipped"}`}>{response.state}</span></div>
                      <p>{response.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
              <div className="review-warning clinician-warning">
                <strong>Information states are preserved.</strong>
                <span>Unknown and unanswered items are not negative findings. Conflicting reports remain unresolved until a clinician reviews them.</span>
              </div>
            </section>

            {hasLocalEdits && <p className="unsaved-indicator" role="status">Unsaved local draft changes · visible only in this open page</p>}
            {operationMessage && <div className="error-box" role="alert"><strong>Action not completed</strong><p>{operationMessage}</p></div>}

            <div className="clinician-actions">
              <div>
                <button className="button button-secondary" onClick={() => reportNotConnected("save")}>Save revision</button>
                <p className="small-note">The original AI draft and patient responses remain unchanged in this preview.</p>
              </div>
              <div className="finalize-panel">
                <label className="confirm-checkbox clinician-confirm">
                  <input type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setOperationMessage(""); }} />
                  <span>I reviewed the source responses and intend to finalize this clinician record.</span>
                </label>
                <button className="button button-primary" onClick={() => reportNotConnected("finalize")} disabled={!confirmed}>Finalize case</button>
              </div>
            </div>
            <p className="finalization-note">Finalization is a separate, authenticated action. In this demo, the case remains <strong>Submitted</strong>; no revision or final timestamp is written.</p>
          </section>
        </div>

        <footer className="page-footer"><span>ConsultPrep AI · Synthetic demo only</span><span>AI documents. Clinicians decide.</span></footer>
      </div>
    </main>
  );
}

function sourceRowsLabel(sourceId: string): string {
  const index = responseRows.findIndex((row) => row.id === sourceId);
  return index >= 0 ? `response ${index + 1}` : "source";
}
