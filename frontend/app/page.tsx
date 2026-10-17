<<<<<<< HEAD
<<<<<<< HEAD
"use client";

import { useState, type FormEvent } from "react";

type Stage = "intro" | "conversation" | "review" | "confirmation";
type AnswerKind = "reported" | "unknown" | "skipped";
type BriefKind = AnswerKind | "not_asked";

type Answer = {
  question: string;
  kind: AnswerKind;
  text: string;
  priorAnswers: string[];
};

type BriefField = {
  text: string;
  kind: BriefKind;
  patientCorrected: boolean;
};

const questions = [
  "What would you like the clinician to know about your main concern?",
  "When did you first notice this concern, if you know?",
  "What would you most like to discuss at your appointment?",
];

const fieldLabels = ["Main concern", "When it started", "Appointment priority"];
const steps = [
  { number: 1, label: "Share your concern" },
  { number: 2, label: "Review your information" },
  { number: 3, label: "Confirm and submit" },
] as const;

function answerSummary(answer: Answer): string {
  if (answer.kind === "unknown") return "Patient marked this as not sure.";
  if (answer.kind === "skipped") return "Skipped; no response was provided.";
  return answer.text;
}

function createBriefDraft(answers: Answer[]): Record<string, BriefField> {
  return Object.fromEntries(
    fieldLabels.map((label, index) => [
      label,
      {
        text: answers[index] ? answerSummary(answers[index]) : "Not asked.",
        kind: answers[index]?.kind ?? "not_asked",
        patientCorrected: (answers[index]?.priorAnswers.length ?? 0) > 0,
      },
    ]),
  );
}

export default function Home() {
  const [stage, setStage] = useState<Stage>("intro");
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [responseText, setResponseText] = useState("");
  const [briefDraft, setBriefDraft] = useState<Record<string, BriefField>>({});
  const [editingAnswer, setEditingAnswer] = useState<number | null>(null);
  const [answerEditText, setAnswerEditText] = useState("");
  const [editingBriefField, setEditingBriefField] = useState<string | null>(null);
  const [briefEditText, setBriefEditText] = useState("");
  const [patientConfirmed, setPatientConfirmed] = useState(false);
  const [submissionUnavailable, setSubmissionUnavailable] = useState(false);

  const answeredCount = answers.length;
  const currentQuestion = questions[answeredCount];

  function startIntake() {
    setAnswers([]);
    setResponseText("");
    setBriefDraft({});
    setPatientConfirmed(false);
    setSubmissionUnavailable(false);
    setStage("conversation");
  }

  function addAnswer(kind: AnswerKind, text = "") {
    if (!currentQuestion) return;
    const nextAnswers = [
      ...answers,
      { question: currentQuestion, kind, text: text.trim(), priorAnswers: [] },
    ];
    setAnswers(nextAnswers);
    setResponseText("");

    if (nextAnswers.length === questions.length) {
      setBriefDraft(createBriefDraft(nextAnswers));
      setStage("review");
    }
  }

  function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!responseText.trim() || !currentQuestion) return;
    addAnswer("reported", responseText);
  }

  function saveAnswerCorrection(index: number) {
    const correctedText = answerEditText.trim();
    if (!correctedText) return;

    const prior = answers[index];
    const nextAnswers = answers.map((answer, answerIndex) =>
      answerIndex === index
        ? {
            ...answer,
            kind: "reported" as const,
            text: correctedText,
            priorAnswers: [...answer.priorAnswers, answerSummary(answer)],
          }
        : answer,
    );
    setAnswers(nextAnswers);
    setEditingAnswer(null);
    setAnswerEditText("");

    const label = fieldLabels[index];
    setBriefDraft((current) => ({
      ...current,
      [label]: current[label]?.patientCorrected
        ? current[label]
        : { text: correctedText, kind: "reported", patientCorrected: true },
    }));
    if (prior.kind !== "reported") setSubmissionUnavailable(false);
  }

  function saveBriefCorrection(label: string) {
    const correctedText = briefEditText.trim();
    if (!correctedText) return;

    setBriefDraft((current) => ({
      ...current,
      [label]: { text: correctedText, kind: "reported", patientCorrected: true },
    }));
    setEditingBriefField(null);
    setBriefEditText("");
  }

  function trySubmit() {
    if (!patientConfirmed) return;
    // No submission API is currently available, so this prototype must not claim success.
    setSubmissionUnavailable(true);
  }

  const stageNumber = stage === "intro" || stage === "conversation" ? 1 : stage === "review" ? 2 : 3;

  return (
    <main className="intake-page">
      <header className="site-header">
        <a className="brand" href="/" aria-label="ConsultPrep AI home">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>ConsultPrep <span className="brand-light">AI</span></span>
        </a>
        <span className="prototype-pill"><span aria-hidden="true" /> Prototype mode</span>
      </header>

      <div className="page-container">
        <div className="page-heading">
          <div>
            <p className="eyebrow">PATIENT INTAKE</p>
            <h1>Prepare for your conversation</h1>
            <p className="page-subtitle">Organize what you would like to discuss with a healthcare professional.</p>
          </div>
          <span className="privacy-note"><span aria-hidden="true">▣</span> Your entries stay in this page</span>
        </div>

        <ol className="stepper" aria-label="Intake steps">
          {steps.map((step) => (
            <li key={step.number} className={stageNumber === step.number ? "step active" : stageNumber > step.number ? "step complete" : "step"}>
              <span className="step-number">{stageNumber > step.number ? "✓" : step.number}</span>
              <span>{step.label}</span>
            </li>
          ))}
        </ol>

        <div className="prototype-notice" role="note">
          <span className="notice-icon" aria-hidden="true">i</span>
          <p><strong>Prototype mode.</strong> AI follow-up and secure saving are not connected yet. The example questions below are fixed, and your entries are held only in this open page.</p>
        </div>

        {stage === "intro" && (
          <section className="content-card intro-card" aria-labelledby="intro-title">
            <div className="intro-icon" aria-hidden="true">✳</div>
            <div className="intro-copy">
              <p className="eyebrow">BEFORE YOU BEGIN</p>
              <h2 id="intro-title">A clearer starting point for your appointment</h2>
              <p>Use this space to describe, in your own words, what you would like to talk about. You can skip a question or say when you are unsure.</p>

              <div className="disclaimer-box">
                <strong>What this tool can and cannot do</strong>
                <p>ConsultPrep AI helps organize information you choose to share. It does not diagnose, recommend treatment, or replace a healthcare professional. Any summary is a draft for you and a clinician to review.</p>
                <p>If you think you may need immediate help, contact local emergency services or a qualified healthcare professional.</p>
              </div>

              <button className="button button-primary" onClick={startIntake}>
                Begin intake <span aria-hidden="true">→</span>
              </button>
              <p className="small-note">You are in a demonstration. Do not enter real personal or health information.</p>
            </div>
          </section>
        )}

        {stage === "conversation" && (
          <section className="content-card conversation-card" aria-labelledby="conversation-title">
            <div className="conversation-topline">
              <div>
                <p className="eyebrow">YOUR INTAKE</p>
                <h2 id="conversation-title">A few questions, one at a time</h2>
              </div>
              <span className="count-pill">Question {Math.min(answeredCount + 1, questions.length)} of {questions.length}</span>
            </div>

            <div className="progress-track" aria-label={`${answeredCount} of ${questions.length} questions answered`}>
              <span style={{ width: `${(answeredCount / questions.length) * 100}%` }} />
            </div>

            <div className="conversation-list" aria-live="polite">
              {answers.map((answer, index) => (
                <div className="message-pair" key={`${index}-${answer.question}`}>
                  <div className="assistant-message">
                    <span className="message-avatar" aria-hidden="true">C</span>
                    <div>
                      <span className="message-label">Example question · not AI-generated</span>
                      <p>{answer.question}</p>
                    </div>
                  </div>
                  <div className="patient-message-wrap">
                    {editingAnswer === index ? (
                      <div className="edit-answer-panel">
                        <label htmlFor={`edit-answer-${index}`}>Correct your response</label>
                        <textarea id={`edit-answer-${index}`} value={answerEditText} onChange={(event) => setAnswerEditText(event.target.value)} rows={3} />
                        <div className="inline-actions">
                          <button className="button button-small button-primary" onClick={() => saveAnswerCorrection(index)}>Save correction</button>
                          <button className="text-button" onClick={() => setEditingAnswer(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="patient-message">
                        <span className="message-label">You · {answer.kind === "reported" ? "Reported" : answer.kind === "unknown" ? "Not sure" : "Skipped"}</span>
                        <p>{answerSummary(answer)}</p>
                        {answer.priorAnswers.length > 0 && <p className="history-note">Earlier response preserved: {answer.priorAnswers.at(-1)}</p>}
                        <button className="text-button edit-link" onClick={() => { setEditingAnswer(index); setAnswerEditText(answer.kind === "reported" ? answer.text : ""); }}>Edit response</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {currentQuestion && (
                <div className="assistant-message current-question">
                  <span className="message-avatar" aria-hidden="true">C</span>
                  <div>
                    <span className="message-label">Example question · not AI-generated</span>
                    <p>{currentQuestion}</p>
                  </div>
                </div>
              )}
            </div>

            {currentQuestion ? (
              <form className="response-form" onSubmit={submitResponse}>
                <label htmlFor="patient-response">Your response</label>
                <textarea
                  id="patient-response"
                  value={responseText}
                  onChange={(event) => setResponseText(event.target.value)}
                  placeholder="Write in your own words…"
                  rows={4}
                  maxLength={2000}
                />
                <div className="form-footer">
                  <span className="character-count">{responseText.length}/2000</span>
                  <div className="response-actions">
                    <button type="button" className="button button-secondary" onClick={() => addAnswer("unknown")}>I’m not sure</button>
                    <button type="button" className="text-button" onClick={() => addAnswer("skipped")}>Skip this question</button>
                    <button type="submit" className="button button-primary" disabled={!responseText.trim()}>
                      Continue <span aria-hidden="true">→</span>
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <div className="conversation-complete">
                <span aria-hidden="true">✓</span>
                <div><strong>You’ve reached the review step.</strong><p>These responses are still only in this page. Review them before deciding what to do next.</p></div>
              </div>
            )}

            <div className="card-bottom-row">
              <button className="text-button" onClick={() => setStage("intro")}>← Back to introduction</button>
              {answeredCount > 0 && <button className="text-button" onClick={() => { setBriefDraft(createBriefDraft(answers)); setStage("review"); }}>Review what I’ve shared →</button>}
            </div>
          </section>
        )}

        {stage === "review" && (
          <section className="content-card review-card" aria-labelledby="review-title">
            <div className="conversation-topline">
              <div>
                <p className="eyebrow">REVIEW BEFORE CONFIRMING</p>
                <h2 id="review-title">Check that this reflects what you shared</h2>
              </div>
              <span className="draft-pill">Patient review preview · not AI-generated</span>
            </div>
            <p className="review-intro">This preview organizes your answers without adding a medical interpretation. You can correct a response or edit the wording below. Your original entries remain visible in this page.</p>

            <div className="brief-fields">
              {fieldLabels.map((label, index) => {
                const field = briefDraft[label] ?? { text: "Not asked.", kind: "not_asked" as const, patientCorrected: false };
                return (
                  <article className="brief-field" key={label}>
                    <div className="field-heading">
                      <div>
                        <h3>{label}</h3>
                        <span className="source-label">{answers[index] ? `From your response ${index + 1}` : "Question not asked"}</span>
                      </div>
                      <span className={`information-tag ${field.kind}`}>{field.patientCorrected ? "Patient-corrected" : field.kind === "reported" ? "Reported" : field.kind === "unknown" ? "Unknown" : field.kind === "skipped" ? "Skipped" : "Not asked"}</span>
                    </div>
                    {editingBriefField === label ? (
                      <div className="brief-edit-form">
                        <label htmlFor={`brief-edit-${index}`}>Edit this wording</label>
                        <textarea id={`brief-edit-${index}`} value={briefEditText} onChange={(event) => setBriefEditText(event.target.value)} rows={3} maxLength={2000} />
                        <div className="inline-actions">
                          <button className="button button-small button-primary" onClick={() => saveBriefCorrection(label)}>Save correction</button>
                          <button className="text-button" onClick={() => setEditingBriefField(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <p className="field-value">{field.text}</p>
                        <button className="text-button" onClick={() => { setEditingBriefField(label); setBriefEditText(field.text); }}>Edit wording</button>
                      </>
                    )}
                  </article>
                );
              })}
            </div>

            <details className="response-history">
              <summary>View your original responses</summary>
              <ol>
                {answers.map((answer, index) => (
                  <li key={`${answer.question}-${index}`}>
                    <strong>{answer.question}</strong>
                    <p>{answerSummary(answer)}</p>
                    {answer.priorAnswers.map((prior, priorIndex) => <p className="history-note" key={priorIndex}>Earlier response preserved: {prior}</p>)}
                  </li>
                ))}
              </ol>
            </details>

            <div className="review-warning">
              <strong>This is not a submitted consultation brief.</strong>
              <span>The AI brief service and secure database are not connected in this prototype.</span>
            </div>

            <div className="card-bottom-row">
              <button className="text-button" onClick={() => setStage("conversation")}>← Back to responses</button>
              <button className="button button-primary" onClick={() => { setPatientConfirmed(false); setSubmissionUnavailable(false); setStage("confirmation"); }}>
                Continue to confirmation <span aria-hidden="true">→</span>
              </button>
            </div>
          </section>
        )}

        {stage === "confirmation" && (
          <section className="content-card confirmation-card" aria-labelledby="confirm-title">
            <p className="eyebrow">FINAL STEP</p>
            <h2 id="confirm-title">Confirm the information you reviewed</h2>
            <p className="review-intro">Confirmation is separate from clinician review. In this prototype, your confirmation cannot be saved or submitted because the backend is not connected.</p>

            <div className="confirmation-summary">
              <span className="summary-check" aria-hidden="true">✓</span>
              <div><strong>Your review preview</strong><p>{answers.filter((answer) => answer.kind === "reported").length} reported response{answers.filter((answer) => answer.kind === "reported").length === 1 ? "" : "s"} · {answers.filter((answer) => answer.kind === "unknown").length} marked not sure · {answers.filter((answer) => answer.kind === "skipped").length} skipped</p></div>
              <button className="text-button" onClick={() => setStage("review")}>Review again</button>
            </div>

            <label className="confirm-checkbox">
              <input type="checkbox" checked={patientConfirmed} onChange={(event) => { setPatientConfirmed(event.target.checked); setSubmissionUnavailable(false); }} />
              <span>I have reviewed this information and confirm it reflects what I shared.</span>
            </label>

            {submissionUnavailable && (
              <div className="error-box" role="alert">
                <strong>Your intake was not submitted.</strong>
                <p>Secure submission is not connected yet. Your confirmation was not recorded, and the information has not been saved to a database. Keep this page open if you want to retain the prototype preview.</p>
              </div>
            )}

            <div className="card-bottom-row">
              <button className="text-button" onClick={() => setStage("review")}>← Back to review</button>
              <button className="button button-primary" onClick={trySubmit} disabled={!patientConfirmed}>
                Confirm and submit <span aria-hidden="true">→</span>
              </button>
            </div>
            <p className="small-note centered-note">This confirmation does not finalize a clinician record. Clinician review and finalization are separate steps.</p>
          </section>
        )}

        <footer className="page-footer">
          <span>ConsultPrep AI</span>
          <a className="clinician-demo-link" href="/clinician">Open clinician review demo</a>
          <span>AI documents. Clinicians decide.</span>
        </footer>
      </div>
    </main>
  );
=======
=======
>>>>>>> 6b3f68ceb2e593539a7edac22d964767d4269e60
import ProductIntroduction from "@/components/patient/ProductIntroduction";

export default function Home() {
  return <ProductIntroduction />;
<<<<<<< HEAD
>>>>>>> 4dbf67034c24251e0552d9a76b7cbd3d49f1d0af
=======
>>>>>>> 6b3f68ceb2e593539a7edac22d964767d4269e60
}
