import type { IntakeField, IntakeState, PatientResponse } from "./contracts.js";
import { getQuestionDefinition, QUESTION_BANK } from "./question-bank.js";

export type IntakeTarget = string;

export function targetForQuestion(question: string): IntakeTarget {
  const normalized = question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const bankQuestion = QUESTION_BANK.find((candidate) => candidate.question.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() === normalized);
  if (bankQuestion) return bankQuestion.targetField;
  if (/\btemperature\b/i.test(question)) return "temperature_measurement";
  if (/onset|timeline|began|start(ed)? suddenly|gradually/i.test(question)) return "onset";
  if (/\b(when did|how long|when have|what day|since when|start|began)\b/i.test(question)) return "onset";
  if (/\b(better|worse|changed|changing|improv|worsen|staying about the same|getting worse|course)\b/i.test(question)) return "progression";
  if (/\b(affect|impact|usual activities|daily activities|interfere|manage|function)\b/i.test(question)) return "daily_impact";
  if (/\b(other symptoms?|anything else|any other|along with|noticed any|symptoms? like)\b/i.test(question)) return "additional_symptoms";
  return "other";
}

/** Extract only a small allowlist of explicit facts. The original response remains immutable evidence. */
export function extractPatientFacts(response: PatientResponse, activeQuestion: string, activeQuestionId?: string): IntakeField[] {
  const text = response.text.trim();
  const fields: IntakeField[] = [];
  const target: string = getQuestionDefinition(activeQuestionId ?? response.questionBankId ?? "")?.targetField ?? targetForQuestion(activeQuestion);
  const source = [response.id];
  const factStatus = response.correctsResponseId ? "patient_corrected" as const : "reported" as const;

  if (activeQuestionId === "main_concern" && text.length >= 2) {
    fields.push({ fieldId: "primary_concern", value: normalizeLabel(text), status: factStatus, sourceResponseIds: source });
  }

  const symptomPatterns: Array<[string, string, RegExp]> = [
    ["headache", "Headache", /\bheadaches?\b/i],
    ["nausea", "Nausea", /\bnauseous?\b|\bnausea\b/i],
    ["cough", "Cough", /\bcough(?:ing)?\b/i],
    ["sore_throat", "Sore throat", /\bsore throat\b/i],
    ["runny_nose", "Runny nose", /\brunny nose\b/i],
    ["cold_like_symptoms", "Cold-like symptoms (patient-described)", /\b(?:common cold|cold symptoms|colds|a cold)\b/i],
    ["fever", "Feeling hot or feverish (patient-reported; no measurement stated)", /\b(?:i feel like i have (?:a )?fever|i have (?:a )?fever|fever|feverish|i feel hot|i am hot|i'm hot|feeling hot)\b/i],
    ["weakness", "Weakness", /\bweak(?:ness)?\b/i],
    ["body_aches", "Body aches", /\bbody aches?\b|\bmuscle aches?\b/i],
    ["chills", "Feeling cold or chills", /\b(?:chills?|shivering|feeling cold|feel cold)\b/i],
    ["stomach_pain", "Stomach or abdominal discomfort", /\b(?:stomach|abdominal|belly)\s+(?:ache|pain|cramp)s?\b|\b(?:my\s+)?(?:stomach|belly)\s+hurts\b/i],
    ["diarrhea", "Diarrhea or loose stools", /\b(?:diarrh?ea|loose stools?)\b/i],
    ["vomiting", "Vomiting", /\b(?:vomit(?:ed|ing)?|threw up)\b/i],
    ["skin_concern", "Skin change or rash", /\b(?:rash|itchy skin|hives|skin changes?)\b/i],
    ["urinary_concern", "Urinary change or discomfort", /\b(?:urine|urinary|urinating|urinate|bladder|pain when i pee)\b/i],
    ["musculoskeletal_concern", "Muscle, joint, or back discomfort", /\b(?:joint|muscle|back|neck|shoulder|knee|ankle)\s+(?:pain|ache|sore|stiff)?\b/i],
    ["chest_discomfort", "Chest discomfort", /\bchest\s+(?:pain|discomfort|tightness|pressure)\b/i],
  ];
  for (const [fieldId, value, pattern] of symptomPatterns) {
    if (!pattern.test(text)) continue;
    fields.push({ fieldId, value: isNegatedSymptom(text, pattern) ? `Patient denied ${value.toLowerCase()}` : value,
      status: isNegatedSymptom(text, pattern) ? "patient_denied" : factStatus, sourceResponseIds: source });
  }
  if (/\b(?:lost|low|less|reduced|no) energy\b|\b(?:tired|fatigued|exhausted)\b/i.test(text)) {
    fields.push({ fieldId: "energy_level", value: normalizeLabel(text.match(/\b(?:lost|low|less|reduced|no) energy\b|\b(?:tired|fatigued|exhausted)\b/i)![0]), status: factStatus, sourceResponseIds: source });
  }
  if (/\bweak(?:ness)?\b/i.test(text)) {
    const lowEnergy = /\b(?:low|lost|less|reduced|no) energy|tired|fatigued|exhausted\b/i.test(text);
    const muscleDifficulty = /\b(?:muscles? (?:feel|are) weak|weakness in (?:my )?(?:arms?|legs?|hands?|feet)|hard to move|difficulty moving)\b/i.test(text);
    const value = lowEnergy && !muscleDifficulty ? "Patient describes low energy; muscle weakness not established"
      : muscleDifficulty ? "Patient describes muscle weakness or difficulty moving"
        : null;
    fields.push({ fieldId: "weakness_description", value, status: value ? factStatus : "unclear", sourceResponseIds: source });
  }
  if ((activeQuestionId ?? response.questionBankId) === "general_weakness_type") {
    const lowEnergyAnswer = /\b(?:energy|tired|fatigued|exhausted|sleepy|worn out)\b/i.test(text);
    const muscleAnswer = /\b(?:muscles?|strength|moving|move|stand|walk|arms?|legs?)\b/i.test(text);
    fields.push({
      fieldId: "weakness_description",
      value: lowEnergyAnswer && !muscleAnswer ? "Patient describes low energy; muscle weakness not established"
        : muscleAnswer ? normalizeLabel(text) : null,
      status: lowEnergyAnswer || muscleAnswer ? factStatus : "unclear",
      sourceResponseIds: source,
    });
  }

  const eyeSorenessPattern = /\b(?:sore|painful|hurting|ache|aching)\s+(?:in\s+)?(?:my\s+)?eyes?\b|\b(?:my\s+)?eyes?\s+(?:are\s+)?(?:sore|painful|hurting|achey?)\b/i;
  if (eyeSorenessPattern.test(text)) {
    fields.push({ fieldId: "eye_soreness", value: isNegatedSymptom(text, eyeSorenessPattern) ? "Patient denied eye soreness" : "Eye soreness", status: isNegatedSymptom(text, eyeSorenessPattern) ? "patient_denied" : factStatus, sourceResponseIds: source });
  }
  if (/\b(one eye|left eye|right eye|both eyes|both of my eyes)\b/i.test(text)) fields.push({ fieldId: "affected_eyes", value: normalizeLabel(text.match(/\b(one eye|left eye|right eye|both eyes|both of my eyes)\b/i)![0]), status: factStatus, sourceResponseIds: source });
  const blurryPattern = /\b(blurry|blurred|blurring)\s+(?:vision|sight)\b|\b(?:vision|sight)\s+(?:is\s+)?(?:blurry|blurred)\b|\bseeing\s+blurry\b/i;
  if (blurryPattern.test(text)) {
    fields.push({ fieldId: "visual_changes", value: isNegatedSymptom(text, blurryPattern) ? "Patient denied blurry vision" : "Blurry vision", status: isNegatedSymptom(text, blurryPattern) ? "patient_denied" : factStatus, sourceResponseIds: source });
  }
  if (/\b(double vision|loss of vision|vision loss|cannot see|can't see|flashes? of light|floaters?)\b/i.test(text)) {
    const value = text.match(/\b(double vision|loss of vision|vision loss|cannot see|can't see|flashes? of light|floaters?)\b/i)?.[0];
    if (value) fields.push({ fieldId: "visual_changes", value: normalizeLabel(value), status: factStatus, sourceResponseIds: source });
  }
  if (/\b(?:eye|eyes|sight|vision)\b[^.!?]{0,70}\b(?:where should i|where can i|where do i|what (?:kind of )?(?:doctor|clinic|specialist)|who should i see|where to get help)\b/i.test(text)
    || /\b(?:where should i|where can i|where do i|what (?:kind of )?(?:doctor|clinic|specialist)|who should i see|where to get help)\b[^.!?]{0,70}\b(?:eye|eyes|sight|vision)\b/i.test(text)) {
    fields.push({ fieldId: "patient_question", value: "Asks where to seek eye care", status: factStatus, sourceResponseIds: source });
  }
  if (!fields.some((field) => field.fieldId === "patient_question") && /\?|\b(i want to know|i'm concerned about|i am concerned about|i'd like help understanding|i would like help understanding)\b/i.test(text)) {
    fields.push({ fieldId: "patient_question", value: normalizeLabel(text), status: factStatus, sourceResponseIds: source });
  }

  const onset = extractOnset(text, target);
  const symptomOnsetQuestion = (activeQuestionId ?? response.questionBankId ?? "").match(/^symptom_onset__(.+)$/);
  if (onset && !symptomOnsetQuestion) fields.push({ fieldId: "onset", value: onset, status: factStatus, sourceResponseIds: source });
  if (symptomOnsetQuestion) {
    const symptomIds = symptomOnsetQuestion[1]!.split(",").filter(Boolean);
    const specificOnsets = extractNamedSymptomOnsets(text, symptomIds);
    const sharedOnset = extractOnset(text, "onset") ?? normalizeShortOnset(text);
    for (const symptomId of symptomIds) {
      const symptomOnset = specificOnsets.get(symptomId) ?? (symptomIds.length === 1 || specificOnsets.size === 0 ? sharedOnset : null);
      if (symptomOnset) fields.push({ fieldId: `symptom_onset_${symptomId}`, value: symptomOnset, status: factStatus, sourceResponseIds: source });
      else if (isDecline(text)) fields.push({ fieldId: `symptom_onset_${symptomId}`, value: null, status: "declined", sourceResponseIds: source });
      else if (isUnknown(text) || isDenial(text)) fields.push({ fieldId: `symptom_onset_${symptomId}`, value: null, status: "unknown", sourceResponseIds: source });
      else if (text.length < 3) fields.push({ fieldId: `symptom_onset_${symptomId}`, value: null, status: "unclear", sourceResponseIds: source });
    }
  }
  // A volunteered, symptom-specific timeline is recorded against that symptom. A broad
  // onset statement remains a general patient report and is never copied to every symptom.
  if (onset) {
    const symptomIds = symptomIdsInText(text);
    for (const symptomId of symptomIds) {
      const named = extractNamedSymptomOnsets(text, [symptomId]).get(symptomId);
      if (named) fields.push({ fieldId: `symptom_onset_${symptomId}`, value: named, status: factStatus, sourceResponseIds: source });
    }
    if (/\b(?:(?:these|my|the)\s+)?symptoms?\s+(?:started|began)|\bthey\s+(?:started|began)\b/i.test(text)) {
      for (const symptomId of symptomIds) {
        if (!fields.some((field) => field.fieldId === `symptom_onset_${symptomId}`)) {
          fields.push({ fieldId: `symptom_onset_${symptomId}`, value: onset, status: factStatus, sourceResponseIds: source });
        }
      }
    }
  }
  if (target === "onset_pattern" && /\b(sudden(?:ly)?|gradual(?:ly)?)\b/i.test(text)) fields.push({ fieldId: target, value: normalizeLabel(text.match(/\b(sudden(?:ly)?|gradual(?:ly)?)\b/i)![0]), status: factStatus, sourceResponseIds: source });
  if (target === "previous_episodes" && /\b(before|previously|in the past|first time|never had this|happened before|similar before)\b/i.test(text)) fields.push({ fieldId: target, value: normalizeLabel(text), status: factStatus, sourceResponseIds: source });
  if (target === "episode_pattern" && /\b(continuous|constant|comes and goes|come and go|intermittent|occasionally|every day|daily|once a day|twice a day)\b/i.test(text)) fields.push({ fieldId: target, value: normalizeLabel(text), status: factStatus, sourceResponseIds: source });

  if (/\b(find|locate|look(?:ing)? for|help me (?:find|get|see)|need|want|book|schedule|arrange)\b/i.test(text)
    && /\b(cardi(?:o(?:log(?:y|ist))?)|x\s*[- ]?ray|radiology|imaging|scan|specialist|clinic|hospital|doctor|provider)\b/i.test(text)) {
    fields.push({ fieldId: "patient_goal", value: normalizeLabel(text), status: factStatus, sourceResponseIds: source });
  }

  const progression = extractProgression(text, target);
  if (progression) fields.push({ fieldId: "progression", value: progression, status: factStatus, sourceResponseIds: source });

  const impact = extractImpact(text, target);
  if (impact) fields.push({ fieldId: "daily_impact", value: impact, status: factStatus, sourceResponseIds: source });
  else if (target === "daily_impact" && isUnclear(text)) {
    fields.push({ fieldId: "daily_impact", value: null, status: "unclear", sourceResponseIds: source });
  }

  const genericTargets = new Set([
    "triggers_relief", "relevant_context", "actions_taken", "patient_goal", "visual_change_description",
    "visual_change_timing", "eye_associated_features", "eye_injury_or_exposure", "contact_lens_use", "prior_eye_advice",
    "cough_description", "breathing_concern", "food_fluids", "temperature_measurement", "ent_location",
    "ent_associated_features", "energy_and_self_care", "symptom_location", "symptom_character", "symptom_severity",
    "headache_associated_changes", "digestive_pattern", "skin_location", "skin_progression", "movement_effect",
    "urinary_description", "urinary_pattern",
  ]);
  if (genericTargets.has(target) && !isUnknown(text) && !isDecline(text) && !isDenial(text) && text.length >= 2) {
    const measurement = target === "temperature_measurement" ? text.match(/\b\d{2}(?:\.\d+)?\s*°?\s*[cCfF]?\b/)?.[0] : undefined;
    const value = measurement ? `Patient-reported temperature reading: ${measurement.trim()} (unit not stated if omitted)` : normalizeLabel(text);
    fields.push({ fieldId: target, value, status: factStatus, sourceResponseIds: source });
  }

  if (target === "visual_change_timing" && /\b(constant|all the time|comes and goes|intermittent|sudden(?:ly)?|gradual(?:ly)?)\b/i.test(text)) {
    fields.push({ fieldId: target, value: normalizeLabel(text), status: factStatus, sourceResponseIds: source });
  }

  if (isDenial(text) && (target === "additional_symptoms" || target === "daily_impact" || getQuestionDefinition(activeQuestionId ?? response.questionBankId ?? "")?.answerType === "yes_no_detail")) {
    fields.push({ fieldId: "additional_symptoms", value: "No additional symptoms reported", status: "patient_denied", sourceResponseIds: source });
    if (target !== "additional_symptoms") {
      fields.pop();
      fields.push({ fieldId: target, value: `Patient reports no ${target.replace(/_/g, " ")}`, status: "patient_denied", sourceResponseIds: source });
    }
  } else if (isDenial(text) && target !== "other") {
    fields.push({ fieldId: target, value: null, status: "unknown", sourceResponseIds: source });
  } else if (target !== "other" && isDecline(text)) {
    fields.push({ fieldId: target, value: null, status: "declined", sourceResponseIds: source });
  } else if (target !== "other" && isUnknown(text)) {
    fields.push({ fieldId: target, value: null, status: "unknown", sourceResponseIds: source });
  }

  return mergeFieldUpdates([], fields);
}

export function mergeFieldUpdates(existing: IntakeField[], updates: IntakeField[]): IntakeField[] {
  const fields = new Map(existing.map((field) => [field.fieldId, field]));
  for (const update of updates) {
    const prior = fields.get(update.fieldId);
    if (update.status === "patient_corrected") {
      fields.set(update.fieldId, update);
      continue;
    }
    if (prior && prior.status === "reported" && update.status === "reported" && prior.value && update.value && prior.value !== update.value) {
      fields.set(update.fieldId, {
        fieldId: update.fieldId,
        value: "Conflicting patient reports",
        status: "conflicting",
        sourceResponseIds: [...new Set([...prior.sourceResponseIds, ...update.sourceResponseIds])],
      });
      continue;
    }
    if (prior?.status === "conflicting" && update.status === "reported") {
      fields.set(update.fieldId, { ...prior, sourceResponseIds: [...new Set([...prior.sourceResponseIds, ...update.sourceResponseIds])] });
      continue;
    }
    fields.set(update.fieldId, update);
  }
  return [...fields.values()];
}

export function factIsSufficient(field: IntakeField | undefined): boolean {
  return Boolean(field && ["reported", "patient_denied", "declined", "unknown", "not_answered", "not_asked"].includes(field.status));
}

function extractOnset(text: string, target: string): string | null {
  if (/\b(?:since|when) i (?:first )?(?:woke up|got up)(?: today)?\b/i.test(text)) return /\btoday\b/i.test(text) ? "Today, when patient woke up" : "When patient woke up";
  const explicit = text.match(/\b(?:started|began|beginning|since)\s+(today|yesterday|this morning|last night|on\s+[a-z]+|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hours?|days?|weeks?)\s+ago)\b/i);
  if (explicit) return normalizeLabel(explicit[1]!);
  const duration = text.match(/\b(?:for|over|in the past)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(hours?|days?|weeks?|months?)\b/i);
  if (duration) return `For ${normalizeLabel(duration[1]!)} ${duration[2]!.toLowerCase()}`;
  if (target === "onset" && /^\s*(today|yesterday|this morning|last night|\d+\s+(?:hours?|days?|weeks?))\s*[.!]?\s*$/i.test(text)) return normalizeLabel(text.replace(/[.!]/g, ""));
  if (/\b(?:today|this morning|last night|yesterday)\b[^.!?]{0,40}\b(?:started|began|woke up)\b/i.test(text)) {
    return normalizeLabel(text.match(/\b(today|this morning|last night|yesterday)\b/i)![1]!);
  }
  return null;
}

function normalizeShortOnset(text: string): string | null {
  if (/\b(?:today|this morning|last night|yesterday|this afternoon|this evening|\d+\s+(?:hours?|days?|weeks?)\s+ago|(?:a|one)\s+(?:few\s+)?(?:hours?|days?|weeks?)\s+ago|when i woke up(?: today)?)\b/i.test(text)) return normalizeLabel(text);
  return null;
}

const SYMPTOM_TEXT_PATTERNS: Array<[string, RegExp]> = [
  ["headache", /\bheadaches?\b/i], ["nausea", /\bnause(?:a|ous)\b/i], ["cough", /\bcough(?:ing)?\b/i],
  ["sore_throat", /\bsore throat\b/i], ["runny_nose", /\brunny nose\b/i], ["cold_like_symptoms", /\b(?:common cold|cold symptoms|colds|a cold)\b/i], ["fever", /\b(?:feverish|fever|feeling hot|feel hot|i am hot|i'm hot)\b/i],
  ["weakness", /\bweak(?:ness)?\b|\bno energy\b/i], ["body_aches", /\bbody aches?\b|\bmuscle aches?\b/i],
  ["chills", /\b(?:chills?|shivering|feeling cold|feel cold)\b/i], ["stomach_pain", /\b(?:stomach|abdominal|belly)\s+(?:ache|pain|cramp)s?\b|\b(?:my\s+)?(?:stomach|belly)\s+hurts\b/i],
  ["diarrhea", /\b(?:diarrh?ea|loose stools?)\b/i], ["eye_soreness", /\b(?:sore|painful|hurting|aching)\s+(?:my\s+)?eyes?\b|\beyes?\s+(?:are\s+)?(?:sore|painful|hurting)\b|\beye soreness\b/i],
  ["visual_changes", /\b(?:blurry|blurred|double|loss of)\s+(?:vision|sight)\b|\bseeing blurry\b/i],
];

function symptomIdsInText(text: string): string[] {
  return SYMPTOM_TEXT_PATTERNS.filter(([, pattern]) => pattern.test(text) && !isNegatedSymptom(text, pattern)).map(([id]) => id);
}

function isNegatedSymptom(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return false;
  const prefix = text.slice(Math.max(0, match.index - 45), match.index);
  const suffix = text.slice(match.index + match[0].length, match.index + match[0].length + 25);
  return /\b(?:no|not|never|without|denies?|don't have|do not have|doesn't have|does not have)\s+(?:(?:any|a|an|the|my)\s+)?$/i.test(prefix)
    || /^\s*(?:isn't present|is not present|is absent|was absent)\b/i.test(suffix);
}

function extractNamedSymptomOnsets(text: string, symptomIds: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const labels = new Map<string, RegExp>(SYMPTOM_TEXT_PATTERNS);
  for (const id of symptomIds) {
    const pattern = labels.get(id);
    const match = pattern?.exec(text);
    if (!match || match.index === undefined) continue;
    const marker = /\b(?:(?:started|began|since)\s+(?:today|yesterday|this morning|last night|this afternoon|this evening|on\s+[a-z]+|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hours?|days?|weeks?)\s+ago|(?:a|one)\s+(?:few\s+)?(?:hours?|days?|weeks?)\s+ago)|for\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hours?|days?|weeks?|months?))\b/gi;
    const markers: Array<{ value: string; distance: number }> = [];
    let markerMatch: RegExpExecArray | null;
    while ((markerMatch = marker.exec(text)) !== null) {
      const date = markerMatch[0].replace(/^(?:started|began|since)\s+/i, "");
      const center = match.index + Math.floor(match[0].length / 2);
      markers.push({ value: normalizeLabel(date), distance: Math.abs(markerMatch.index - center) });
    }
    const onset = markers.sort((left, right) => left.distance - right.distance)[0]?.value
      ?? (() => {
        const before = text.slice(Math.max(0, match.index - 45), match.index);
        const after = text.slice(match.index + match[0].length, Math.min(text.length, match.index + match[0].length + 45));
        return extractOnset(`${match[0]} ${after}`, "onset") ?? extractOnset(before, "onset");
      })();
    if (onset) result.set(id, onset);
  }
  return result;
}

function extractProgression(text: string, target: string): string | null {
  if (/\b(worse|worsening|getting worse)\b/i.test(text)) return "Worsening";
  if (/\b(better|improving|getting better)\b/i.test(text)) return "Improving";
  if (/\b(about the same|staying the same|unchanged|no change)\b/i.test(text)) return "Unchanged";
  if (target === "progression" && isUnknown(text)) return null;
  return null;
}

function extractImpact(text: string, target: string): string | null {
  if (target === "daily_impact" && /\b(?:chores|housework|household tasks?|usual activities|daily activities)\b/i.test(text)) return normalizeLabel(text);
  const householdTask = text.match(/\b(?:doing|do)\s+(?:the\s+)?(?:chores|housework|household tasks?)\b[^.!?]{0,45}\b(?:harder|difficult|hard|struggle|tiring)\b|\b(?:chores|housework|household tasks?)\b[^.!?]{0,45}\b(?:harder|difficult|hard|struggle|tiring)\b/i);
  if (householdTask) return normalizeLabel(householdTask[0]);
  const activity = text.match(/\b(?:difficulty|hard|unable|can't|cannot|not able to|struggle to)\s+(?:with\s+|to\s+)?(read|walk|stand|work|sleep|eat|drive|see|move|get up)\b|\b(?:can't|cannot|unable to|not able to)\s+(?:do|manage)\s+(?:my\s+)?(?:usual\s+)?activities\b/i);
  if (activity) return normalizeLabel(activity[0]);
  if (target === "daily_impact" && /\b(?:affects? my activities|interferes? with my|stops? me from|prevents? me from)\b/i.test(text)) return normalizeLabel(text);
  return null;
}

function isDenial(text: string): boolean {
  return /^\s*(?:none|nothing|nope|no|no other symptoms?|nothing else|that's all|that is all|just what i said)\b(?:[\s,.!?-]*(?:just what i said|as i said))?[\s,.!?-]*$/i.test(text);
}

function isDecline(text: string): boolean {
  return /^\s*(?:skip(?: this)?|prefer not to say|i(?:'d| would) rather not (?:say|answer)|i don't want to answer|i do not want to answer|i'm not comfortable answering)\b/i.test(text);
}

function isUnknown(text: string): boolean {
  return /^\s*(?:i don't know|i do not know|not sure|unsure|i'm not sure|i am not sure)\b/i.test(text);
}

function isUnclear(text: string): boolean {
  return isUnknown(text) || /\b(?:worse|better|same)\b/i.test(text) || text.length < 3;
}

function normalizeLabel(value: string): string {
  return value.trim().replace(/\s+/g, " ").replace(/^[a-z]/, (letter) => letter.toUpperCase()).replace(/[.!?]+$/g, "");
}

export function sourceResponse(state: IntakeState, responseId: string): string | undefined {
  return state.responses.find((response) => response.id === responseId)?.text;
}
