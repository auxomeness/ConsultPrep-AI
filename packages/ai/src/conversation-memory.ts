import type { IntakeState } from "./contracts.js";
import { isRecallRequest } from "./conversation.js";
import { extractPatientFacts, extractReportedTemperature } from "./intake-facts.js";

/** Read patient evidence, including older sessions created before a field was extracted. */
export function recallConversation(state: IntakeState): string | null {
  const latest = state.responses.at(-1)?.text ?? "";
  if (!isRecallRequest(latest)) return null;
  const previousResponses = state.responses.slice(0, -1);
  if (/\b(?:tell me|repeat back) (?:everything|all(?: of)? what) i (?:said|told you|shared)\b/i.test(latest)) {
    const messages = previousResponses.map((response) => response.text.trim()).filter(Boolean);
    if (!messages.length) return "You haven’t shared any earlier messages in this consultation yet.";
    const transcript = messages.map((message) => `• “${message}”`).join("\n");
    const maxTranscriptLength = 1_650;
    return `Here are your earlier messages, in your own words:\n${transcript.length > maxTranscriptLength ? `• ${messages.slice(-4).join("\n• ").slice(-maxTranscriptLength)}\n• (Earlier messages are omitted here because the chat reply has a length limit.)` : transcript}`;
  }
  const recentContext = [
    ...state.questionsAsked.slice(-4),
    ...previousResponses.slice(-6).map(response => response.text),
  ].join("\n");
  const isShortFollowUp = /^(?:what is it|what was it|what number|how much was it|tell me the numbers?)[?!.,\s]*$/i.test(latest.trim());
  const asksAboutTemperature = /temperature|temp(?:erature)?|reading|numbers?/i.test(latest)
    || isShortFollowUp && /temperature|temp(?:erature)?|thermometer/i.test(recentContext);
  if (asksAboutTemperature) {
    const readings = state.responses.flatMap(response => {
      const answeringTemperature = /temperature|temp(?:erature)?/i.test(response.questionId ?? "")
        || /temperature|temp(?:erature)?/i.test(response.questionBankId ?? "");
      const reading = extractReportedTemperature(response.text, answeringTemperature);
      return reading ? [{ response, reading }] : [];
    });
    const evidence = readings.at(-1);
    return evidence ? formatTemperatureRecall(evidence.reading)
      : "You haven’t given me a temperature reading in this consultation yet.";
  }
  const topic = /symptoms?|headache|pain|fever|cold|chills?|vomit|temperature/i.test(latest)
    ? latest
    : [...previousResponses].reverse().find(response => /symptoms?|headache|pain|fever|cold|chills?|vomit|temperature/i.test(response.text))?.text ?? latest;
  const facts = state.responses.flatMap(response => extractPatientFacts(
    response,
    response.questionId ?? "",
    response.questionBankId,
  ));
  const relevant = facts.filter(field => /when|timing|start|began/i.test(topic) ? field.fieldId.includes("onset")
    : /headache|head|pain/i.test(topic) ? field.fieldId.startsWith("headache") || field.fieldId === "primary_concern"
      : /cold|chills?|fever|vomit/i.test(topic) ? /^(?:cold|chills?|fever|vomiting|temperature_measurement|symptom_onset_)/.test(field.fieldId)
        : field.value !== null);
  const values = [...new Set(relevant.filter(field => field.value && ["reported", "patient_corrected"].includes(field.status)).map(field => field.value!))];
  return values.length ? `Here’s what you told me: ${values.join("; ")}.`
    : "I don’t have that detail recorded in this consultation. Which earlier detail would you like me to repeat?";
}

function formatTemperatureRecall(reading: string): string {
  const uncertain = /\(uncertain or approximate, as reported\)/i.test(reading);
  const value = reading.replace(/^Temperature reading:\s*/i, "")
    .replace(/\s*\(uncertain or approximate, as reported\)/i, "")
    .replace(/\s*\(unit not specified\)/i, " (unit not specified)")
    .trim();
  return `You said ${value}${uncertain ? ", and noted you weren’t sure of the reading" : ""}.`;
}
