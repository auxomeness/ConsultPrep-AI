export type SymptomCategory =
  | "eye_vision"
  | "respiratory"
  | "throat_nose_ear"
  | "general"
  | "headache_neurological"
  | "digestive"
  | "skin"
  | "musculoskeletal"
  | "urinary"
  | "other";

export type QuestionAnswerType = "free_text" | "yes_no_detail" | "time_period" | "frequency" | "severity_description" | "patient_goal";
export type QuestionStatus = "not_selected" | "selected" | "asked" | "answered" | "partially_answered" | "skipped" | "declined" | "requires_clarification";

export interface QuestionDefinition {
  id: string;
  category: SymptomCategory | "universal";
  targetField: string;
  targetConcept: string;
  purpose: string;
  priority: number;
  safetyRelevant: boolean;
  required: boolean;
  answerType: QuestionAnswerType;
  question: string;
  relevanceTerms: string[];
  sufficiency: "any_response" | "recognized_fact";
  followUpQuestion?: string;
  clinicalReview: "prototype_wording_requires_clinician_review";
}

const review = "prototype_wording_requires_clinician_review" as const;
const universal = (id: string, field: string, purpose: string, priority: number, question: string, answerType: QuestionAnswerType = "free_text", required = false): QuestionDefinition => ({
  id, category: "universal", targetField: field, targetConcept: field, purpose, priority,
  safetyRelevant: false, required, answerType, question, relevanceTerms: [], sufficiency: "any_response", clinicalReview: review,
});
const categoryQuestion = (id: string, category: SymptomCategory, field: string, purpose: string, priority: number, question: string, terms: string[], answerType: QuestionAnswerType = "free_text", safetyRelevant = false): QuestionDefinition => ({
  id, category, targetField: field, targetConcept: ["symptom_location", "symptom_character", "symptom_severity"].includes(field) ? `${category}:${field}` : field, purpose, priority,
  safetyRelevant, required: false, answerType, question, relevanceTerms: terms, sufficiency: "any_response", clinicalReview: review,
});

/** Reviewed only for prototype relevance and wording shape; clinical content still requires qualified review. */
export const QUESTION_BANK: readonly QuestionDefinition[] = [
  universal("onset", "onset", "establish_timeline", 10, "When did this first begin?", "time_period", true),
  universal("onset_pattern", "onset_pattern", "clarify_onset", 15, "Did it begin suddenly or gradually?", "free_text"),
  universal("previous_episodes", "previous_episodes", "establish_history", 26, "Have you experienced something similar before?", "yes_no_detail"),
  universal("episode_pattern", "episode_pattern", "establish_pattern", 28, "Has it been continuous, or does it come and go? If it comes and goes, how often and for how long?", "frequency"),
  universal("progression", "progression", "establish_course", 20, "Since it began, has it been getting better, worse, or staying about the same?", "free_text", true),
  universal("triggers_relief", "triggers_relief", "identify_patient_observed_factors", 45, "Have you noticed anything that seems to make it better or worse?", "free_text"),
  universal("additional_symptoms", "additional_symptoms", "check_associated_symptoms", 30, "Have you noticed any other symptoms along with this?", "free_text", true),
  { ...universal("daily_impact", "daily_impact", "establish_impact", 40, "How has this affected your usual activities, if at all?", "free_text", true), followUpQuestion: "Could you tell me which usual activities, if any, have been harder because of this?" },
  universal("relevant_context", "relevant_context", "collect_patient_context", 70, "Is there any recent event or other context you think may be relevant?", "free_text"),
  universal("actions_taken", "actions_taken", "record_actions_taken", 75, "Have you already tried anything or sought advice for this?", "free_text"),
  universal("patient_goal", "patient_goal", "establish_patient_goal", 80, "What would you most like the clinician to help you understand or address?", "patient_goal"),

  categoryQuestion("eye_side", "eye_vision", "affected_eyes", "clarify_distribution", 13, "Does this affect one eye or both?", ["eye", "eyes", "vision"]),
  categoryQuestion("eye_visual_description", "eye_vision", "visual_change_description", "describe_visual_change", 18, "How would you describe the change in your vision?", ["eye", "eyes", "vision", "sight"]),
  categoryQuestion("eye_visual_timing", "eye_vision", "visual_change_timing", "clarify_visual_timeline", 14, "Did the vision change begin suddenly or gradually, and is it constant or does it come and go?", ["eye", "eyes", "vision", "sight"]),
  categoryQuestion("eye_features", "eye_vision", "eye_associated_features", "check_eye_features", 42, "Have you noticed other eye changes, such as redness, swelling, discharge, irritation, or sensitivity to light?", ["eye", "eyes", "vision"], "yes_no_detail"),
  categoryQuestion("eye_exposure", "eye_vision", "eye_injury_or_exposure", "clarify_exposure", 43, "Was there an injury or anything that may have got into or splashed into the eye?", ["eye", "eyes", "vision"], "yes_no_detail", true),
  categoryQuestion("eye_contact_lenses", "eye_vision", "contact_lens_use", "relevant_eye_context", 72, "Do you use contact lenses?", ["eye", "eyes", "vision"]),
  categoryQuestion("eye_prior_advice", "eye_vision", "prior_eye_advice", "prior_consultation", 76, "Have you already spoken with an eye-care professional about this?", ["eye", "eyes", "vision"]),

  categoryQuestion("respiratory_cough", "respiratory", "cough_description", "describe_cough", 18, "If you are coughing, how would you describe it and when does it happen?", ["cough", "breathing", "breath", "chest"]),
  categoryQuestion("respiratory_breathing", "respiratory", "breathing_concern", "clarify_breathing", 8, "Are you having any difficulty breathing right now?", ["cough", "breathing", "breath", "chest"], "yes_no_detail", true),
  categoryQuestion("respiratory_intake", "respiratory", "food_fluids", "check_intake", 55, "Have you been able to eat and drink as usual?", ["cough", "breathing", "fever", "weak"]),
  categoryQuestion("respiratory_temperature", "respiratory", "temperature_measurement", "separate_reported_from_measured_temperature", 35, "Have you measured your temperature? If so, what was the reading and when did you take it?", ["cough", "breathing", "fever", "cold", "chills"], "free_text"),

  categoryQuestion("ent_location", "throat_nose_ear", "ent_location", "clarify_ent_concern", 18, "Which area is bothering you most, and what does it feel like?", ["throat", "nose", "ear", "sinus"]),
  categoryQuestion("ent_related", "throat_nose_ear", "ent_associated_features", "check_ent_features", 42, "Have you noticed any other changes around your throat, nose, or ears?", ["throat", "nose", "ear", "sinus"]),
  categoryQuestion("general_temperature", "general", "temperature_measurement", "separate_reported_from_measured_temperature", 35, "Have you measured your temperature? If so, what was the reading and when did you take it?", ["fever", "feverish", "cold", "chills", "weak", "fatigue"]),
  categoryQuestion("general_energy", "general", "energy_and_self_care", "clarify_general_impact", 38, "How has your energy affected getting up or taking care of your usual needs?", ["weak", "fatigue", "tired", "low energy", "sleepy"]),
  categoryQuestion("general_weakness_type", "general", "weakness_description", "distinguish_energy_from_strength", 12, "When you say you feel weak, do you mean unusually tired or low on energy, or that your muscles feel weak and moving is difficult?", ["weak", "weakness"]),

  categoryQuestion("headache_location", "headache_neurological", "headache_location", "clarify_location", 17, "Where do you feel the headache, and does it stay there or move?", ["headache", "head pain", "migraine"]),
  categoryQuestion("headache_character", "headache_neurological", "headache_character", "describe_character", 19, "How would you describe the headache in your own words?", ["headache", "head pain", "migraine"]),
  categoryQuestion("headache_severity", "headache_neurological", "headache_severity", "describe_severity", 34, "How severe does it feel to you, and what does that prevent you from doing?", ["headache", "head pain", "migraine"], "severity_description"),
  categoryQuestion("headache_associated", "headache_neurological", "headache_associated_changes", "check_related_changes", 41, "Have you noticed any other changes along with the headache?", ["headache", "head pain", "migraine"], "free_text", true),

  categoryQuestion("digestive_location", "digestive", "symptom_location", "clarify_location", 17, "Where do you feel the discomfort, and does it stay in one place or move?", ["stomach", "abdominal", "belly", "nausea", "vomit", "diarrhea", "bowel"]),
  categoryQuestion("digestive_pattern", "digestive", "digestive_pattern", "describe_digestive_pattern", 20, "When does it tend to happen, and how often has it occurred?", ["stomach", "abdominal", "belly", "nausea", "vomit", "diarrhea", "bowel"], "frequency"),
  categoryQuestion("digestive_intake", "digestive", "food_fluids", "check_intake", 37, "Have you been able to keep food and fluids down and drink as usual?", ["stomach", "abdominal", "belly", "nausea", "vomit", "diarrhea", "bowel"]),

  categoryQuestion("skin_location", "skin", "skin_location", "clarify_skin_location", 17, "Where on your body is the skin concern, and what does it look or feel like?", ["rash", "skin", "itch", "swelling", "spot", "lesion"]),
  categoryQuestion("skin_change", "skin", "skin_progression", "describe_skin_change", 35, "Has the area changed in size, appearance, or sensation since it began?", ["rash", "skin", "itch", "swelling", "spot", "lesion"]),

  categoryQuestion("musculoskeletal_location", "musculoskeletal", "symptom_location", "clarify_location", 17, "Where is the discomfort, and does it affect one side or both?", ["joint", "muscle", "back", "neck", "limb", "shoulder", "knee", "ankle"]),
  categoryQuestion("musculoskeletal_movement", "musculoskeletal", "movement_effect", "clarify_movement_effect", 36, "Does movement or a particular activity seem to change the discomfort?", ["joint", "muscle", "back", "neck", "limb", "shoulder", "knee", "ankle"]),

  categoryQuestion("urinary_detail", "urinary", "urinary_description", "clarify_urinary_concern", 18, "What change or discomfort have you noticed when urinating?", ["urine", "urinary", "urinating", "bladder"]),
  categoryQuestion("urinary_pattern", "urinary", "urinary_pattern", "clarify_urinary_pattern", 35, "When did you first notice that change, and has it been constant or come and go?", ["urine", "urinary", "urinating", "bladder"]),
  categoryQuestion("other_description", "other", "symptom_character", "clarify_concern", 18, "How would you describe the concern in your own words?", []),
];

const CATEGORY_PATTERNS: Array<[SymptomCategory, RegExp]> = [
  ["eye_vision", /\b(eye|eyes|vision|sight|blurry|blurred|floaters?|flashes?)\b/i],
  ["respiratory", /\b(cough|breath|breathing|chest|wheez|short of breath)\b/i],
  ["throat_nose_ear", /\b(throat|nose|ear|sinus|runny nose|congestion|cold symptoms|common cold|colds)\b/i],
  ["general", /\b(fever|feverish|temperature|chills?|cold|hot|weak|fatigue|tired|low energy|sleepy)\b/i],
  ["headache_neurological", /\b(headache|head pain|migraine|numbness|tingling|dizz|balance)\b/i],
  ["digestive", /\b(stomach|abdominal|belly|nausea|nauseous|vomit|diarrh|bowel|constipat|bloat)\b/i],
  ["skin", /\b(skin|rash|itch|itchy|hives|swelling|spot|lesion)\b/i],
  ["musculoskeletal", /\b(joint|muscle|back|neck|shoulder|knee|ankle|limb|sprain|strain)\b/i],
  ["urinary", /\b(urine|urinary|urinating|urinate|urination|bladder|pee|blood in (?:my )?urine)\b/i],
];

export function detectSymptomCategories(text: string): SymptomCategory[] {
  const found = CATEGORY_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([category]) => category);
  return found.length ? found : ["other"];
}

export function questionIsRelevant(question: QuestionDefinition, categories: SymptomCategory[]): boolean {
  if (question.category === "universal") return true;
  if (question.category === "other") return categories.includes("other");
  return categories.includes(question.category);
}

export const SYMPTOM_FIELD_LABELS: Readonly<Record<string, string>> = {
  headache: "headache", nausea: "nausea", cough: "cough", sore_throat: "sore throat", runny_nose: "runny nose", cold_like_symptoms: "cold-like symptoms (patient-described)",
  fever: "feeling hot or feverish", weakness: "weakness", body_aches: "body aches", chills: "feeling cold or chills",
  stomach_pain: "stomach discomfort", diarrhea: "diarrhea", vomiting: "vomiting", eye_soreness: "eye soreness", visual_changes: "vision changes",
  skin_concern: "skin concern", urinary_concern: "urinary concern", musculoskeletal_concern: "muscle, joint, or back discomfort", chest_discomfort: "chest discomfort",
};

export function isSymptomReportField(fieldId: string): boolean {
  return Object.hasOwn(SYMPTOM_FIELD_LABELS, fieldId);
}

export function getSymptomLabel(fieldId: string): string | undefined {
  return SYMPTOM_FIELD_LABELS[fieldId];
}

const SYMPTOM_FIELD_PATTERNS: Readonly<Record<string, RegExp>> = {
  headache: /\bheadaches?\b/i, nausea: /\bnause(?:a|ous)\b/i, cough: /\bcough(?:ing)?\b/i,
  sore_throat: /\bsore throat\b/i, runny_nose: /\brunny nose\b/i, cold_like_symptoms: /\b(?:common cold|cold symptoms|colds|a cold)\b/i, fever: /\b(?:feverish|fever|feeling hot|feel hot|i am hot|i'm hot)\b/i,
  weakness: /\bweak(?:ness)?\b/i, body_aches: /\bbody aches?\b|\bmuscle aches?\b/i,
  chills: /\b(?:chills?|shivering|feeling cold|feel cold)\b/i, stomach_pain: /\b(?:stomach|abdominal|belly)\s+(?:ache|pain|cramp)s?\b|\b(?:my\s+)?(?:stomach|belly)\s+hurts\b/i,
  diarrhea: /\b(?:diarrh?ea|loose stools?)\b/i, vomiting: /\b(?:vomit(?:ed|ing)?|threw up)\b/i,
  skin_concern: /\b(?:rash|itchy skin|hives|skin changes?)\b/i, urinary_concern: /\b(?:urine|urinary|urinating|urinate|bladder|pain when i pee)\b/i,
  musculoskeletal_concern: /\b(?:joint|muscle|back|neck|shoulder|knee|ankle)\s+(?:pain|ache|sore|stiff)?\b/i,
  chest_discomfort: /\bchest\s+(?:pain|discomfort|tightness|pressure)\b/i,
  eye_soreness: /\b(?:sore|painful|hurting|aching)\s+(?:my\s+)?eyes?\b|\beyes?\s+(?:are\s+)?(?:sore|painful|hurting)\b/i,
  visual_changes: /\b(?:blurry|blurred|double|loss of)\s+(?:vision|sight)\b|\b(?:vision|sight)\s+(?:is\s+)?(?:blurry|blurred|double)\b|\bseeing blurry\b/i,
};

export function reportedSymptomFieldIds(input: { fields: Array<{ fieldId: string; status: string }>; concern: string; responses: Array<{ text: string }> }): string[] {
  const reported = new Set(input.fields.filter((field) => isSymptomReportField(field.fieldId)
    && !["patient_denied", "declined", "unknown", "not_asked", "not_answered"].includes(field.status)).map((field) => field.fieldId));
  const allText = `${input.concern}\n${input.responses.map((response) => response.text).join("\n")}`;
  for (const [id, pattern] of Object.entries(SYMPTOM_FIELD_PATTERNS)) {
    pattern.lastIndex = 0;
    const match = pattern.exec(allText);
    const prefix = match?.index === undefined ? "" : allText.slice(Math.max(0, match.index - 35), match.index);
    if (match && !/\b(?:no|not|never|without|don't have|do not have)\s+(?:(?:any|a)\s+)?$/i.test(prefix)) reported.add(id);
  }
  return [...reported];
}

export function isQuestionApplicable(question: QuestionDefinition, input: { concern: string; responses: Array<{ text: string }>; fields: Array<{ fieldId: string; status: string }> }): boolean {
  const text = `${input.concern}\n${input.responses.map((response) => response.text).join("\n")}`.toLowerCase();
  const fields = new Set(input.fields.filter((field) => !["patient_denied", "declined", "unknown", "not_asked", "not_answered"].includes(field.status)).map((field) => field.fieldId));
  const symptomIds = reportedSymptomFieldIds(input);
  const has = (...ids: string[]) => ids.some((id) => fields.has(id) || symptomIds.includes(id));
  if (question.category === "universal") {
    switch (question.id) {
      case "onset": case "onset_pattern": return false; // timeline is scoped per reported symptom by the planner
      case "progression": return /\b(worse|worsening|better|improving|changing|changed|fluctuat|same)\b/i.test(text);
      case "previous_episodes": return /\b(again|before|previously|in the past|recurring|recurrent|similar episode)\b/i.test(text);
      case "episode_pattern": return /\b(comes and goes|come and go|intermittent|every day|daily|repeatedly|recurring)\b/i.test(text);
      case "triggers_relief": return /\b(trigger|makes? it worse|makes? it better|relieves?|relieved by|after eating|when i move|when i walk)\b/i.test(text);
      case "relevant_context": return /\b(after an injury|after a fall|after starting|new medication|recent travel|exposed to|exposure|event before)\b/i.test(text);
      case "actions_taken": return /\b(i (?:have )?(?:tried|taken|used|called|visited|seen)|already (?:tried|taken|seen)|spoke to (?:a|the) (?:doctor|clinician))\b/i.test(text);
      case "patient_goal": return /\b(worried|concerned|what (?:is|could be|should)|would like to know|want to know|question for (?:the )?clinician)\b/i.test(text);
      case "daily_impact": return /\b(can't|cannot|unable|hard to|difficulty|affect(?:ed|ing)? my|interfere|prevent(?:s|ed)? me|can't do|cannot do|weak|no energy|blurry|blurred)\b/i.test(text);
      case "additional_symptoms": return symptomIds.length > 0 && !fields.has("additional_symptoms");
      default: return false;
    }
  }
  if (question.category === "eye_vision") {
    if (question.id === "eye_visual_description" || question.id === "eye_visual_timing") return has("visual_changes");
    if (question.id === "eye_side") return has("eye_soreness", "visual_changes");
    if (question.id === "eye_exposure") return /\b(injur(?:y|ed)|chemical|something (?:got|went) in|foreign object|splashed into)\b/i.test(text);
    if (question.id === "eye_contact_lenses") return /\b(contact lenses?|wear contacts?)\b/i.test(text) || /\b(red|irritat|discharge|sore)\b/i.test(text) && has("eye_soreness", "visual_changes");
    if (question.id === "eye_prior_advice") return /\b(already (?:seen|spoke to|called)|(?:seen|spoke to) (?:an? )?(?:eye doctor|optometrist|clinician|doctor))\b/i.test(text);
    return has("eye_soreness", "visual_changes");
  }
  if (question.id === "respiratory_cough") return has("cough");
  if (question.id === "respiratory_breathing") return has("cough", "chest_discomfort", "breathing_concern");
  if (question.id === "respiratory_temperature" || question.id === "general_temperature") return has("fever", "chills", "temperature_measurement");
  if (question.id === "respiratory_intake" || question.id === "digestive_intake") return has("nausea", "vomiting", "diarrhea", "food_fluids");
  if (question.id === "general_energy") return has("weakness", "body_aches", "chills");
  if (question.id === "general_weakness_type") return has("weakness");
  if (question.category === "headache_neurological") {
    if (!has("headache")) return false;
    if (question.id === "headache_location") return !/\b(left|right|front|back|temple|both sides|one side|all over)\b/i.test(text);
    if (question.id === "headache_character") return !/\b(throbbing|pounding|pressure|sharp|dull|aching|burning)\b/i.test(text);
    if (question.id === "headache_severity") return /\b(severe|very painful|worst|hard to function|cannot work|can't work)\b/i.test(text);
    if (question.id === "headache_associated") return /\b(headache|migraine)\b/i.test(text) && !fields.has("additional_symptoms");
    return false;
  }
  if (question.category === "throat_nose_ear") {
    if (question.id === "ent_location") return has("cold_like_symptoms") || has("sore_throat", "runny_nose") && (has("sore_throat") && has("runny_nose") || /\b(ear|sinus)\b/i.test(text));
    return question.id === "ent_related" && has("sore_throat", "runny_nose") && /\b(worse|changing|swallow|breath|ear|sinus)\b/i.test(text);
  }
  if (question.category === "digestive") {
    if (!has("stomach_pain", "nausea", "diarrhea", "vomiting")) return false;
    if (question.id === "digestive_pattern") return /\b(comes and goes|after eating|before eating|every day|daily|repeated|how often)\b/i.test(text);
    if (question.id === "digestive_location") return has("stomach_pain");
    return question.id === "digestive_intake" && has("nausea", "diarrhea", "vomiting");
  }
  if (question.category === "skin") return has("skin_concern") && (question.id === "skin_location" || /\b(spreading|changing|getting bigger|getting smaller|worse|improving)\b/i.test(text));
  if (question.category === "musculoskeletal") return has("musculoskeletal_concern", "body_aches") && (question.id === "musculoskeletal_location" || /\b(movement|moving|walking|lifting|exercise)\b/i.test(text));
  if (question.category === "urinary") return has("urinary_concern") && (question.id === "urinary_detail" || /\b(frequently|more often|less often|come and go|intermittent)\b/i.test(text));
  return question.category === "other" && symptomIds.length === 0 && text.trim().length > 0;
}

export function getQuestionDefinition(questionId: string): QuestionDefinition | undefined {
  return QUESTION_BANK.find((question) => question.id === questionId);
}
