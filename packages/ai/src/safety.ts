import type { IntakeState, SafetyEvent } from "./contracts.js";
import { extractReportedTemperature } from "./intake-facts.js";

/**
 * Prototype safety routing for the explicitly documented high-risk triggers.
 * Headache urgency follows MedlinePlus danger signs: sudden/worst-ever severe
 * headache, neurologic changes, fever with stiff neck, or repeated vomiting.
 * The inability-to-move message is informed by MedlinePlus emergency guidance:
 * https://www.medlineplus.gov/ency/patientinstructions/000593.htm
 * Breathlessness with palpitations routing follows NHS and MedlinePlus emergency guidance:
 * https://www.nhs.uk/symptoms/heart-palpitations/
 * https://medlineplus.gov/ency/article/003081.htm
 * Eye pain with vision changes and emergency eye warning signs follow NHS and NEI guidance:
 * https://www.nhs.uk/symptoms/eye-pain/
 * https://www.nhs.uk/conditions/eye-injuries/
 * https://www.nei.nih.gov/eye-health-information/healthy-vision/finding-eye-doctor
 * Sudden confusion, loss of consciousness, and serious breathing difficulty follow MedlinePlus:
 * https://medlineplus.gov/ency/article/001927.htm
 * https://www.medlineplus.gov/ency/article/000007.htm
 * This is not a clinical triage system and must never be used to rule out emergencies.
 */
const URGENT_RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: "emergency_eye_warning_sign", pattern: /\b(?:sudden(?:ly)?\s+(?:loss|change)\s+of\s+vision|sudden(?:ly)?\s+(?:blurry|blurred)\s+vision|lost\s+(?:my\s+)?vision|cannot\s+see|can't\s+see|severe\s+eye\s+pain|intense\s+eye\s+pain|(?:injured|pierced|punctured)\s+(?:my\s+)?eye|(?:strong\s+)?chemical\s+(?:got\s+in|in|splash(?:ed)?\s+into|splash(?:ed)?\s+in)\s+(?:my\s+)?eye|something\s+(?:is\s+)?stuck\s+in\s+(?:my\s+)?eye)\b/i },
  { id: "shortness_of_breath_with_palpitations", pattern: /\b(shortness of breath|difficulty breathing|trouble breathing|can't breathe|cannot breathe)\b[\s\S]{0,80}\b(palpitations?|palpitating|heart (?:is )?(?:racing|pounding|fluttering)|racing heart)\b|\b(palpitations?|palpitating|heart (?:is )?(?:racing|pounding|fluttering)|racing heart)\b[\s\S]{0,80}\b(shortness of breath|difficulty breathing|trouble breathing|can't breathe|cannot breathe)\b/i },
  { id: "synthetic_severe_chest_pain", pattern: /\b(severe|crushing|intense)\s+chest\s+pain\b/i },
  { id: "synthetic_difficulty_breathing", pattern: /\b(difficulty breathing|trouble breathing|can't breathe|cannot breathe|shortness of breath)\b/i },
  { id: "reported_inability_to_move", pattern: /\b(?:can'?t|cannot|unable to|can barely|can hardly)\s+(?:move|stand|walk|get up)\b/i },
  { id: "new_confusion_or_loss_of_consciousness", pattern: /\b(?:sudden(?:ly)? confused|sudden(?:ly)? (?:became|become) confused|new confusion|confused all of a sudden|lost consciousness|passed out|unconscious|not waking up)\b/i },
  { id: "severe_or_sudden_weakness", pattern: /\b(?:sudden(?:ly)? severe weakness|severe sudden weakness|suddenly weak on one side|sudden(?:ly)? (?:have|had) severe weakness(?: on one side)?|one[- ]sided weakness)\b/i },
  { id: "synthetic_possible_heart_attack_or_stroke", pattern: /\b(am i having|i think i'?m having|having symptoms of)\s+(a\s+)?(heart attack|stroke)\b/i },
];

export interface EmergencyContactConfig {
  number: string;
  region: string;
}

/** Philippine demo default; deployments should pass their verified local configuration. */
export const DEFAULT_EMERGENCY_CONTACT: EmergencyContactConfig = { number: "911", region: "in the Philippines" };

export function emergencyContactFromEnvironment(env: Record<string, string | undefined> = process.env): EmergencyContactConfig {
  const number = env.CONSULTPREP_EMERGENCY_NUMBER?.trim() || DEFAULT_EMERGENCY_CONTACT.number;
  const region = env.CONSULTPREP_EMERGENCY_REGION?.trim() || DEFAULT_EMERGENCY_CONTACT.region;
  if (!/^[\d+*#()\s.-]{2,40}$/.test(number) || !/^[\p{L}\p{M}\d\s,.'()/-]{2,80}$/u.test(region)) {
    return DEFAULT_EMERGENCY_CONTACT;
  }
  return { number, region };
}

function isNegatedOrHypothetical(text: string, matchIndex: number): boolean {
  const preceding = text.slice(Math.max(0, matchIndex - 45), matchIndex);
  return /\b(?:do not|don't|not|never|no|without)\b[^.!?]{0,25}$/i.test(preceding)
    || /\b(?:if|what if|suppose|imagine)\b[^.!?]{0,35}$/i.test(preceding);
}

function findUrgentRule(text: string): string | null {
  for (const rule of URGENT_RULES) {
    rule.pattern.lastIndex = 0;
    const match = rule.pattern.exec(text);
    if (match && !isNegatedOrHypothetical(text, match.index)) return rule.id;
  }
  const painfulEye = /\b(eye|eyes)\b[^.!?]{0,70}\b(sore|pain|painful|hurting|ache|red)\b|\b(sore|painful|hurting|ache|red)\b[^.!?]{0,70}\b(eye|eyes)\b/i;
  const visualChange = /\b(blurry|blurred|blurring|double vision|vision change|changes to (?:my )?vision|vision is changing|flashes? of light|floaters?)\b|\bseeing blurry\b/i;
  if (hasUnnegatedMatch(text, painfulEye) && hasUnnegatedMatch(text, visualChange)) return "eye_symptoms_with_visual_change_requires_urgent_assessment";
  return null;
}

function hasUnnegatedMatch(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (!isNegatedOrHypothetical(text, match.index)) return true;
    if (!pattern.global) break;
  }
  return false;
}

export function assessSafety(state: Pick<IntakeState, "responses">, emergencyContact: EmergencyContactConfig = DEFAULT_EMERGENCY_CONTACT): SafetyEvent {
  for (const response of state.responses) {
    const ruleId = findUrgentRule(response.text);
    if (ruleId) {
      const guidance = urgentGuidanceForRule(ruleId, emergencyContact);
      return { routed: true, ruleId, guidance, matchedResponseIds: [response.id] };
    }
  }
  const combined = state.responses.map((response) => response.text).join("\n");
  const combinedRuleId = findUrgentRule(combined);
  if (combinedRuleId) {
    return { routed: true, ruleId: combinedRuleId, guidance: urgentGuidanceForRule(combinedRuleId, emergencyContact), matchedResponseIds: state.responses.map((response) => response.id) };
  }
  const headacheRisk = headacheEmergencyEvidence(state.responses);
  if (headacheRisk) {
    return { routed: true, ruleId: headacheRisk.ruleId, guidance: urgentGuidanceForRule(headacheRisk.ruleId, emergencyContact), matchedResponseIds: headacheRisk.matchedResponseIds };
  }
  return { routed: false, ruleId: null, guidance: null, matchedResponseIds: [] };
}

function headacheEmergencyEvidence(responses: IntakeState["responses"]): { ruleId: string; matchedResponseIds: string[] } | null {
  const findSources = (pattern: RegExp, associateWithHeadache = false) => new Set(responses.flatMap((response) => {
    pattern.lastIndex = 0;
    const match = pattern.exec(response.text);
    if (!match || isNegatedOrHypothetical(response.text, match.index)) return [];
    if (associateWithHeadache && !/\b(?:headache|head pain|migraine|crushing\s+(?:my\s+)?skull)\b/i.test(response.text)
      && !/^headache_(?:character|severity)$/.test(response.questionBankId ?? "")
      && !(response.questionBankId?.startsWith("symptom_onset__") && response.questionBankId.includes("headache"))) return [];
    return [response.id];
  }));
  const headache = findSources(/\b(?:headache|head pain|migraine)\b/i);
  const severe = new Set(responses.flatMap((response) => {
    const text = response.text;
    const namesHeadache = /\b(?:headache|head pain|migraine)\b/i.test(text)
      || /^headache_(?:character|severity)$/.test(response.questionBankId ?? "")
      || (response.questionBankId?.startsWith("symptom_onset__") && response.questionBankId.includes("headache"));
    const severityPattern = /\b(?:worst(?:\s+ever)?\s+headache|(?:headache|head pain|migraine)\s+(?:is|was|feels|felt|became|got|has been|has become)\s+(?:the\s+)?worst(?:\s+ever)?|(?:severe|extreme(?:ly)?|unbearable|intense)\s+(?:headache|head pain|migraine)|(?:headache|head pain|migraine)\s+(?:is|was|feels|felt|became|got|has been|has become)\s+(?:(?:very|really)\s+)?(?:severe|extreme(?:ly)?|unbearable|intense))\b/i;
    const severityScalePattern = /\b(?:severe|extreme|unbearable|intense|worst|10\s*\/\s*10|9\s*\/\s*10)\b/i;
    const explicitSeverity = hasUnnegatedMatch(text, severityPattern)
      || (/^headache_severity$/.test(response.questionBankId ?? "") && hasUnnegatedMatch(text, severityScalePattern));
    return namesHeadache && explicitSeverity ? [response.id] : [];
  }));
  const focalNeurologic = findSources(/\b(?:weakness|numbness|loss of feeling)\s+(?:on|in)\s+(?:my\s+)?(?:one|left|right)\s+side\b|\b(?:one-sided|left-sided|right-sided)\s+(?:weakness|numbness)\b|\b(?:slurred speech|trouble speaking|difficulty speaking|loss of balance|new vision loss|confusion)\b/i);
  const repeatedVomiting = findSources(/\b(?:repeated(?:ly)?|multiple times|several times|over and over|nonstop|non-stop|kept)\s+(?:vomit(?:ing|ed)?|throwing up)\b|\b(?:vomit(?:ed|ing)?|threw up)\s+(?:again|repeatedly|multiple times|several times|more than once|twice|\d+\s+times)\b/i);
  const sudden = findSources(/\b(?:sudden(?:ly)?|abrupt(?:ly)?)\b/i, true);
  if (!headache.size) return null;
  const feverAndStiffNeck = findSources(/\b(?:fever|feverish|high temperature|high fever)\b/i).size > 0
    && findSources(/\b(?:stiff neck|neck stiffness|cannot bend my neck|can't bend my neck)\b/i).size > 0;
  const hasSuddenSevere = severe.size > 0 && sudden.size > 0;
  const hasSevereNeurologic = severe.size > 0 && focalNeurologic.size > 0;
  const hasSevereRepeatedVomiting = severe.size > 0 && repeatedVomiting.size > 0;
  if (!hasSuddenSevere && !hasSevereNeurologic && !hasSevereRepeatedVomiting && !feverAndStiffNeck) return null;
  const ruleId = hasSuddenSevere ? "sudden_severe_headache"
    : hasSevereNeurologic ? "severe_headache_with_focal_neurologic_symptom"
      : hasSevereRepeatedVomiting ? "severe_headache_with_repeated_vomiting"
        : "headache_with_fever_and_stiff_neck";
  const relevant = [headache, ...(severe.size ? [severe] : []), ...(focalNeurologic.size ? [focalNeurologic] : []), ...(repeatedVomiting.size ? [repeatedVomiting] : [])];
  if (feverAndStiffNeck) {
    relevant.push(findSources(/\b(?:fever|feverish|high temperature|high fever)\b/i));
    relevant.push(findSources(/\b(?:stiff neck|neck stiffness|cannot bend my neck|can't bend my neck)\b/i));
  }
  return { ruleId, matchedResponseIds: [...new Set(relevant.flatMap((sources) => [...sources]))] };
}

/** A non-diagnostic prompt-assessment signal; it never labels the case an emergency. */
export function assessPromptAssessmentNeed(state: Pick<IntakeState, "responses" | "fields">): boolean {
  const text = `${state.responses.map((response) => response.text).join("\n")}\n${state.fields.map((field) => field.value ?? "").join("\n")}`;
  const worsening = /\b(worsening|getting worse|worse|declining)\b/i.test(text);
  const weakness = /\b(weak(?:ness)?|low energy|lost energy|fatigue|exhausted|tired)\b/i.test(text);
  const impact = /\b(chores|usual activities|daily activities|harder to|can't do|cannot do|affect(?:s|ed|ing)? my|lost energy|need to lie down)\b/i.test(text);
  const explicitMuscleDifficulty = /\b(muscles? (?:feel|are) weak|loss of muscle strength|difficulty moving|hard to move)\b/i.test(text);
  const measuredTemperatures = state.responses
    .map((response) => extractReportedTemperature(response.text, /temperature/i.test(response.questionId ?? "")))
    .filter((value): value is string => Boolean(value));
  const highTemperature = measuredTemperatures.some((value) => {
    const match = value.match(/(\d{2,3}(?:\.\d+)?)(?:\s*°?\s*([cf]))?/i);
    if (!match) return false;
    const reading = Number(match[1]);
    const fahrenheit = match[2]?.toLowerCase() === "f";
    return fahrenheit ? reading >= 101.3 : reading >= 38.5;
  });
  return worsening && weakness && (impact || explicitMuscleDifficulty)
    || highTemperature && weakness && impact;
}

export function urgentGuidanceForText(text: string, emergencyContact: EmergencyContactConfig = DEFAULT_EMERGENCY_CONTACT): string | null {
  const ruleId = findUrgentRule(text);
  if (!ruleId) return null;
  return urgentGuidanceForRule(ruleId, emergencyContact);
}

function urgentGuidanceForRule(ruleId: string, emergencyContact: EmergencyContactConfig = DEFAULT_EMERGENCY_CONTACT): string {
  if (ruleId === "sudden_severe_headache" || ruleId === "severe_headache_with_focal_neurologic_symptom" || ruleId === "severe_headache_with_repeated_vomiting" || ruleId === "headache_with_fever_and_stiff_neck") {
    return `I’m concerned because you described a headache with a warning sign that needs urgent medical assessment. Please call ${emergencyContact.number} ${emergencyContact.region} now, or ask someone nearby to call. You can also have someone help you get to the nearest hospital emergency department immediately. Do not drive yourself if you feel unwell. Please don’t wait to finish this questionnaire before getting help. This tool cannot assess or rule out an emergency.`;
  }
  if (ruleId === "eye_symptoms_with_visual_change_requires_urgent_assessment") {
    return "I’m sorry you’re dealing with this. Eye soreness together with a change in vision should be assessed urgently by an eye-care professional today. If you have sudden vision loss, severe eye pain, or an eye injury, seek emergency medical care now. I’m stopping the intake so you can focus on getting help.";
  }
  if (ruleId === "emergency_eye_warning_sign") {
    return "I’m sorry you’re experiencing this. Sudden vision loss, severe eye pain, or an eye injury needs immediate medical attention. Please seek emergency care now or ask someone nearby to help you. I’m stopping the intake so you can focus on getting help.";
  }
  if (ruleId === "shortness_of_breath_with_palpitations") {
    return `I’m sorry you’re experiencing this. Shortness of breath together with a racing or fluttering heartbeat needs urgent medical attention. Please call ${emergencyContact.number} ${emergencyContact.region} now, or ask someone nearby to call and stay with you. Don’t drive yourself. I’m stopping the intake so you can focus on getting help.`;
  }
  if (ruleId === "new_confusion_or_loss_of_consciousness" || ruleId === "severe_or_sudden_weakness") {
    return `I’m sorry this is happening. Sudden confusion, loss of consciousness, or sudden severe weakness needs immediate medical attention. Please call ${emergencyContact.number} ${emergencyContact.region} now or ask someone nearby to help. I’m stopping the intake so you can focus on getting help.`;
  }
  if (ruleId === "reported_inability_to_move") {
    return `I’m sorry you’re feeling this unwell. If you are physically unable to move, especially if this began suddenly, ask someone nearby to call ${emergencyContact.number} ${emergencyContact.region} now. If you mean you feel too weak to get up, seek urgent medical help now. I’m stopping the intake so you can focus on getting help.`;
  }
  return `I’m sorry you’re dealing with this. What you’ve described may need urgent medical attention. Please contact local emergency services by calling ${emergencyContact.number} ${emergencyContact.region}, or seek urgent medical help now; don’t wait to finish this chat. I’m stopping the intake so you can focus on getting help. This tool can’t assess or rule out an emergency.`;
}
