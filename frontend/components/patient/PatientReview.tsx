import type {
  IntakeField,
  PatientResponse,
  StructuredConsultationBrief,
} from "../../../packages/ai/src/contracts";

export type ReviewData = {
  brief: StructuredConsultationBrief;
  responses: PatientResponse[];
  fields: IntakeField[];
  origin: "synthetic_fixture" | "validated_ai_result";
};

type ReviewState =
  | { kind: "ready"; data: ReviewData }
  | { kind: "missing" | "invalid" | "unavailable"; message: string };

const statusLabels: Record<IntakeField["status"], string> = {
  reported: "Reported",
  patient_denied: "Patient denied",
  patient_corrected: "Patient corrected",
  declined: "Declined",
  unknown: "Unknown",
  not_answered: "Not answered",
  not_asked: "Not asked",
  unclear: "Unclear",
  conflicting: "Conflicting",
};

type BriefFact = StructuredConsultationBrief["primaryConcern"][number];

const briefSections: Array<[string, keyof Pick<StructuredConsultationBrief,
  "primaryConcern" | "reportedSymptoms" | "onsetAndProgression" | "functionalImpact" |
  "additionalSymptoms" | "relevantBackground" | "patientConcernsAndQuestions">]> = [
  ["Main concern", "primaryConcern"],
  ["Reported symptoms", "reportedSymptoms"],
  ["Onset and changes", "onsetAndProgression"],
  ["Daily impact", "functionalImpact"],
  ["Additional symptoms", "additionalSymptoms"],
  ["Background and context", "relevantBackground"],
  ["Patient questions", "patientConcernsAndQuestions"],
];

function Sources({ ids, expectedText, data }: {
  ids: string[];
  expectedText?: string[];
  data: ReviewData;
}) {
  if (ids.length === 0) {
    return <p className="mt-3 text-sm font-semibold text-error">Missing source: no patient response is linked.</p>;
  }

  return (
    <ul className="mt-3 space-y-2">
      {ids.map((id) => {
        const response = data.responses.find((item) => item.id === id);
        const trace = data.brief.sourceTraceability.find((item) => item.responseId === id);
        const supported = response && trace?.originalText === response.text &&
          (expectedText === undefined || expectedText.includes(response.text));
        return (
          <li key={id} className="min-w-0">
            {supported ? (
              <details className="rounded-xl border border-line bg-background px-4 py-3">
                <summary className="cursor-pointer font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-focus">
                  View original patient statement {id}
                </summary>
                <p className="mt-3 text-xs font-medium text-muted">Source response {id} · Original patient statement</p>
                <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-4 border-accent pl-4 leading-7 [overflow-wrap:anywhere]">{response.text}</blockquote>
                <p className="mt-3 text-sm text-muted">Close this source to return to the brief entry.</p>
              </details>
            ) : (
              <p className="text-sm font-semibold text-error">Missing or mismatched source {id}; this entry is unsupported.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function BriefEntry({ fact, data }: { fact: BriefFact; data: ReviewData }) {
  return (
    <li className="min-w-0 border-l-4 border-accent pl-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{data.origin === "synthetic_fixture" ? "Synthetic draft wording" : "AI-generated draft wording"} · {statusLabels[fact.status]}</p>
      <p className="mt-2 whitespace-pre-wrap break-words leading-7 [overflow-wrap:anywhere]">{fact.text}</p>
      <Sources ids={fact.sourceResponseIds} expectedText={fact.originalText} data={data} />
    </li>
  );
}

export default function PatientReview({ state }: { state: ReviewState }) {
  if (state.kind !== "ready") {
    return (
      <section aria-labelledby="review-unavailable" className="mt-8 rounded-2xl border border-line bg-surface p-6">
        <h2 id="review-unavailable" className="text-xl font-semibold">
          {state.kind === "missing" ? "No consultation brief is available" : state.kind === "invalid" ? "The consultation brief cannot be displayed" : "Review is unavailable"}
        </h2>
        <p className="mt-3 leading-7">{state.message}</p>
      </section>
    );
  }

  const { data } = state;
  if (data.brief.schemaVersion !== "1.0" || !Array.isArray(data.brief.sourceTraceability)) {
    return <PatientReview state={{ kind: "invalid", message: "The review data has an unsupported version or missing source list." }} />;
  }

  const visibleSections = briefSections.filter(([, key]) => data.brief[key].length > 0);

  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="consultation-brief" className="rounded-2xl border border-line bg-surface px-5 py-7 shadow-sm sm:px-9 sm:py-9">
        <div className="border-b border-line pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-accent">Unconfirmed example</p>
          <h2 id="consultation-brief" className="mt-2 text-2xl font-semibold">Consultation brief</h2>
          <p className="mt-3 max-w-2xl leading-7 text-muted">{data.origin === "synthetic_fixture" ? "Made-up draft wording for this preview. No AI generated this example." : "AI-generated draft wording from the review data."} It may contain errors or omissions and has not been reviewed by a clinician.</p>
          <p className="mt-3 text-sm font-semibold">{data.origin === "synthetic_fixture" ? "Synthetic draft · Not confirmed" : data.brief.status === "patient_confirmed" ? "Patient confirmed in supplied data; clinician review remains separate" : "AI-generated draft · Not confirmed"}</p>
        </div>
        <div className="divide-y divide-line">
          {visibleSections.map(([title, key]) => (
            <section key={key} aria-labelledby={`brief-${key}`} className="py-6">
              <h3 id={`brief-${key}`} className="text-lg font-semibold">{title}</h3>
              <ul className="mt-4 space-y-5">{data.brief[key].map((fact, index) => <BriefEntry key={`${key}-${index}`} fact={fact} data={data} />)}</ul>
            </section>
          ))}
          <section aria-labelledby="brief-unresolved" className="py-6">
            <h3 id="brief-unresolved" className="text-lg font-semibold">Information not established</h3>
            {data.brief.informationNotEstablished.length === 0 ? <p className="mt-2 text-muted">No unresolved items are listed in this draft.</p> : (
              <ul className="mt-3 list-disc space-y-2 pl-5 leading-7">{data.brief.informationNotEstablished.map((item, index) => <li key={`${index}-${item}`} className="break-words [overflow-wrap:anywhere]">{item}</li>)}</ul>
            )}
          </section>
        </div>
      </section>

      <section aria-labelledby="original-responses" className="rounded-2xl border border-line bg-surface p-5 sm:p-8">
        <h2 id="original-responses" className="text-xl font-semibold">Patient statements</h2>
        <p className="mt-2 leading-7 text-muted">Original wording is kept here. A correction does not erase the earlier statement.</p>
        {data.responses.length === 0 ? <p className="mt-5">No patient statements are available.</p> : (
          <ol className="mt-5 divide-y divide-line">
            {[...data.responses].sort((a, b) => a.sequence - b.sequence).map((response) => (
              <li key={response.id} className="min-w-0 py-4 first:pt-0 last:pb-0">
                <p className="text-sm font-semibold text-muted">{response.correctsResponseId ? "Patient correction" : "Patient reported"} · Response {response.id}</p>
                {response.correctsResponseId && <p className="mt-1 text-sm text-muted">Corrects response {response.correctsResponseId}; the original remains above.</p>}
                <blockquote className="mt-2 whitespace-pre-wrap break-words border-l-4 border-accent pl-4 leading-7 [overflow-wrap:anywhere]">{response.text}</blockquote>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="information-states" className="rounded-2xl border border-line bg-surface p-5 sm:p-8">
        <h2 id="information-states" className="text-xl font-semibold">Current information states</h2>
        <p className="mt-2 leading-7 text-muted">These labels describe the example intake; they are not medical findings.</p>
        {data.fields.length === 0 ? <p className="mt-5">No information states are available.</p> : (
          <ul className="mt-5 divide-y divide-line">
            {data.fields.map((field, index) => (
              <li key={`${field.fieldId}-${index}`} className="min-w-0 py-4 first:pt-0 last:pb-0">
                <p className="font-semibold">{field.fieldId.replaceAll("_", " ")} · {statusLabels[field.status]}</p>
                {field.value && <p className="mt-2 whitespace-pre-wrap break-words leading-7 [overflow-wrap:anywhere]">{field.value}</p>}
                {field.status === "unknown" && <p className="mt-2 text-sm text-muted">The patient expressed uncertainty; this is not a denial.</p>}
                {field.status === "not_answered" && <p className="mt-2 text-sm text-muted">A question was asked but no answer was recorded.</p>}
                {field.status === "unclear" && <p className="mt-2 text-sm text-muted">The original wording needs clarification.</p>}
                {field.status === "conflicting" && <p className="mt-2 text-sm text-muted">All related statements remain visible; no version has been selected.</p>}
                {field.sourceResponseIds.length > 0 && <Sources ids={field.sourceResponseIds} data={data} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="review-actions" className="rounded-2xl border border-line bg-preview p-5 sm:p-8">
        <h2 id="review-actions" className="text-xl font-semibold">Correction and confirmation</h2>
        <p className="mt-2 leading-7">Corrections cannot be saved from this preview. Patient confirmation and submission are not connected. The original statements above remain visible.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" disabled className="cursor-not-allowed rounded-xl border border-line bg-surface px-5 py-3 font-semibold opacity-70">Correct information — unavailable</button>
          <button type="button" disabled className="cursor-not-allowed rounded-xl border border-line bg-surface px-5 py-3 font-semibold opacity-70">Confirm — unavailable</button>
        </div>
      </section>
    </div>
  );
}
