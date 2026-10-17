import type { IntakeState, SafetyEvent } from "./contracts.js";

/**
 * Prototype safety routing for the explicitly documented synthetic triggers.
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

export function assessSafety(state: Pick<IntakeState, "responses">): SafetyEvent {
  for (const response of state.responses) {
    const ruleId = findUrgentRule(response.text);
    if (ruleId) {
      const guidance = urgentGuidanceForRule(ruleId);
      return { routed: true, ruleId, guidance, matchedResponseIds: [response.id] };
    }
  }
  const combined = state.responses.map((response) => response.text).join("\n");
  const combinedRuleId = findUrgentRule(combined);
  if (combinedRuleId) {
    return { routed: true, ruleId: combinedRuleId, guidance: urgentGuidanceForRule(combinedRuleId), matchedResponseIds: state.responses.map((response) => response.id) };
  }
  return { routed: false, ruleId: null, guidance: null, matchedResponseIds: [] };
}

/** A non-diagnostic prompt-assessment signal; it never labels the case an emergency. */
export function assessPromptAssessmentNeed(state: Pick<IntakeState, "responses" | "fields">): boolean {
  const text = `${state.responses.map((response) => response.text).join("\n")}\n${state.fields.map((field) => field.value ?? "").join("\n")}`;
  const worsening = /\b(worsening|getting worse|worse|declining)\b/i.test(text);
  const weakness = /\b(weak(?:ness)?|low energy|lost energy|fatigue|exhausted|tired)\b/i.test(text);
  const impact = /\b(chores|usual activities|daily activities|harder to|can't do|cannot do|affect(?:s|ed|ing)? my|lost energy|need to lie down)\b/i.test(text);
  const explicitMuscleDifficulty = /\b(muscles? (?:feel|are) weak|loss of muscle strength|difficulty moving|hard to move)\b/i.test(text);
  return worsening && weakness && (impact || explicitMuscleDifficulty);
}

export function urgentGuidanceForText(text: string): string | null {
  const ruleId = findUrgentRule(text);
  if (!ruleId) return null;
  return urgentGuidanceForRule(ruleId);
}

function urgentGuidanceForRule(ruleId: string): string {
  if (ruleId === "eye_symptoms_with_visual_change_requires_urgent_assessment") {
    return "I’m sorry you’re dealing with this. Eye soreness together with a change in vision should be assessed urgently by an eye-care professional today. If you have sudden vision loss, severe eye pain, or an eye injury, seek emergency medical care now. I’m stopping the intake so you can focus on getting help.";
  }
  if (ruleId === "emergency_eye_warning_sign") {
    return "I’m sorry you’re experiencing this. Sudden vision loss, severe eye pain, or an eye injury needs immediate medical attention. Please seek emergency care now or ask someone nearby to help you. I’m stopping the intake so you can focus on getting help.";
  }
  if (ruleId === "shortness_of_breath_with_palpitations") {
    return "I’m sorry you’re experiencing this. Shortness of breath together with a racing or fluttering heartbeat needs urgent medical attention. Please call your local emergency number now, or ask someone nearby to call and stay with you. Don’t drive yourself. I’m stopping the intake so you can focus on getting help.";
  }
  if (ruleId === "new_confusion_or_loss_of_consciousness" || ruleId === "severe_or_sudden_weakness") {
    return "I’m sorry this is happening. Sudden confusion, loss of consciousness, or sudden severe weakness needs immediate medical attention. Please contact local emergency services now or ask someone nearby to help. I’m stopping the intake so you can focus on getting help.";
  }
  if (ruleId === "reported_inability_to_move") {
    return "I’m sorry you’re feeling this unwell. If you are physically unable to move, especially if this began suddenly, ask someone nearby to contact your local emergency service now. If you mean you feel too weak to get up, seek urgent medical help now. I’m stopping the intake so you can focus on getting help.";
  }
  return "I’m sorry you’re dealing with this. What you’ve described may need urgent medical attention. Please contact local emergency services or seek urgent medical help now; don’t wait to finish this chat. I’m stopping the intake so you can focus on getting help. This tool can’t assess or rule out an emergency.";
}
