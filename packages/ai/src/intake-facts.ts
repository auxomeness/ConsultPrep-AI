import { isRecallRequest } from "./conversation.js";
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
  if (isRecallRequest(text)) return fields;
  const target: string = getQuestionDefinition(activeQuestionId ?? response.questionBankId ?? "")?.targetField ?? targetForQuestion(activeQuestion);
  const source = [response.id];
  const factStatus = response.correctsResponseId ? "patient_corrected" as const : "reported" as const;

  // Keep details attached to the symptom that was actually being discussed.
  // The patient's own wording remains the stored value and source evidence.
  const detailTarget = activeQuestionId === "headache_location" ? "headache_location"
    : activeQuestionId === "headache_character" ? "headache_character"
      : activeQuestionId === "headache_severity" ? "headache_severity"
        : activeQuestionId === "symptom_location" && detectHeadacheContext(response, activeQuestion) ? "headache_location"
          : activeQuestionId === "symptom_character" && detectHeadacheContext(response, activeQuestion) ? "headache_character"
            : activeQuestionId === "symptom_severity" && detectHeadacheContext(response, activeQuestion) ? "headache_severity" : null;
  const isBareAffirmative = /^\s*(?:yes|yeah|yep|yup|correct|right|it does|it stays|it stays there)[.!\s]*$/i.test(text);
  const isBareNegative = /^\s*(?:no|nope|nah|not really|it doesn'?t|it moves)[.!\s]*$/i.test(text);
  const hasMovementDetail = /\b(?:stays?|staying|does not move|doesn'?t move|moves?|moving|shifts?)\b/i.test(text);
  const hasLocationDetail = /\b(?:front|forehead|back|left|right|both sides|one side|all over|temples?|behind (?:my |the )?eyes|toward(?:s)? (?:my |the )?eyes?)\b/i.test(text);
  if (detailTarget && detailTarget === "headache_location" && (isBareAffirmative || isBareNegative) && !hasMovementDetail) {
    // The question combines two ideas (where it hurts and whether it moves).
    // A bare yes/no does not establish the location or movement direction.
    fields.push({ fieldId: detailTarget, value: null, status: "unclear", sourceResponseIds: source });
  } else if (detailTarget && text.length >= 2 && !isUnknown(text) && !isDecline(text)) {
    const value = extractDetailValue(text, detailTarget);
    const incompleteCombinedLocation = detailTarget === "headache_location" && !(hasLocationDetail && hasMovementDetail);
    fields.push({ fieldId: detailTarget, value, status: incompleteCombinedLocation ? "unclear" : factStatus, sourceResponseIds: source });
  }

  // Capture volunteered details even when they answer more than the active question.
  const temperature = extractReportedTemperature(text, target === "temperature_measurement");
  if (temperature) fields.push({ fieldId: "temperature_measurement", value: temperature, status: factStatus, sourceResponseIds: source });
  const headacheContext = /\b(?:headaches?|migraine|my head)\b/i.test(text) || /headache/.test(activeQuestionId ?? "") || /headache/i.test(activeQuestion);
  const character = text.match(/\b(?:crushing|squeezing|throbbing|pounding|pressure|sharp|dull|aching|burning|tingling|stabbing)\b/i)?.[0];
  if (headacheContext && character && !isNegatedSymptom(text, new RegExp(`\\b${character}\\b`, "i"))) {
    const existing = fields.findIndex(field => field.fieldId === "headache_character");
    if (existing >= 0) fields.splice(existing, 1);
    fields.push({ fieldId: "headache_character", value: normalizeLabel(character), status: factStatus, sourceResponseIds: source });
  }
  if (headacheContext && detailTarget !== "headache_location" && /\b(?:front|back|left|right|temples?|forehead|behind (?:my |the )?eyes)\b/i.test(text)) {
    const value = extractDetailValue(text, "headache_location");
    const completeCombinedLocation = hasHeadacheLocationDetail(text) && hasHeadacheMovementDetail(text);
    fields.push({ fieldId: "headache_location", value, status: completeCombinedLocation ? factStatus : "unclear", sourceResponseIds: source });
  }

  if (activeQuestionId === "main_concern" && text.length >= 2 && !isUnknown(text) && !isDecline(text) && !isDenial(text)) {
    fields.push({ fieldId: "primary_concern", value: normalizeLabel(text), status: factStatus, sourceResponseIds: source });
  }

  const symptomPatterns: Array<[string, string, RegExp]> = [
    ["headache", "Headache", /\b(?:headaches?|migraines?)\b/i],
    ["dizziness", "Dizziness or feeling unsteady", /\b(?:dizz(?:y|iness)|lightheaded|unsteady|room spinning|spinning sensation)\b/i],
    ["nausea", "Nausea", /\bnauseous?\b|\bnausea\b/i],
    ["cough", "Cough", /\bcough(?:ing)?\b/i],
    ["sore_throat", "Sore throat", /\bsore throat\b/i],
    ["runny_nose", "Runny nose", /\brunny nose\b/i],
    ["cold_like_symptoms", "Cold-like symptoms (patient-described)", /\b(?:common cold|cold symptoms|colds|a cold)\b/i],
    ["fever", "Feeling hot or feverish (patient-reported; no measurement stated)", /\b(?:i feel like i have (?:a )?fever|i have (?:a )?fever|fever|feverish|i feel hot|i am hot|i'm hot|feeling hot)\b/i],
    ["weakness", "Weakness", /\bweak(?:ness)?\b/i],
    ["body_aches", "Body aches", /\bbody\s*aches?\b|\bmuscle aches?\b/i],
    ["chills", "Feeling cold or chills", /\b(?:chills?|shivering|feeling cold|feel cold)\b/i],
    ["stomach_pain", "Stomach or abdominal discomfort", /\b(?:stomach|abdominal|belly)\s+(?:ache|pain|cramp)s?\b|\b(?:my\s+)?(?:stomach|belly)\s+hurts\b/i],
    ["cramping", "Cramping (location not specified)", /\bcramp(?:ing)?\b/i],
    ["diarrhea", "Diarrhea or loose stools", /\b(?:diarrh?ea|loose stools?)\b/i],
    ["vomiting", "Vomiting", /\b(?:vomit(?:ed|ing)?|threw up)\b/i],
    ["skin_concern", "Skin change or rash", /\b(?:rash|itchy skin|hives|skin changes?)\b/i],
    ["urinary_concern", "Urinary change or discomfort", /\b(?:urine|urinary|urinating|urinate|bladder|pain when i pee)\b/i],
    ["musculoskeletal_concern", "Muscle, joint, or back discomfort", /\b(?:joint|muscle|back|neck|shoulder|knee|ankle)\s+(?:pain|ache|sore|stiff)?\b/i],
    ["chest_discomfort", "Chest discomfort", /\bchest\s+(?:pain|discomfort|tightness|pressure)\b/i],
  ];
  for (const [fieldId, value, pattern] of symptomPatterns) {
    if (!pattern.test(text)) continue;
    if (fieldId === "cramping" && /\b(?:stomach|abdominal|belly)\s+(?:ache|pain|cramp)s?\b/i.test(text)) continue;
    fields.push({ fieldId, value: isNegatedSymptom(text, pattern) ? `Patient denied ${value.toLowerCase()}` : value,
      status: isNegatedSymptom(text, pattern) ? "patient_denied" : factStatus, sourceResponseIds: source });
  }
  if (/\bcramp(?:ing)?\b/i.test(text)
    && /\b(?:can(?:not|'t)|unable to)\s+(?:really\s+)?describe\s+(?:it|the cramp(?:ing)?)?(?:\s+(?:very\s+)?(?:well|clearly|properly))?\b/i.test(text)) {
    fields.push({ fieldId: "cramping_character", value: "Hard to describe clearly", status: factStatus, sourceResponseIds: source });
  }
  const explicitlyDeniesOtherSymptoms = /\b(?:no|not|haven't|have not)\s+(?:any\s+)?(?:other|additional)\s+symptoms?\b/i.test(text)
    || /\bno symptoms? (?:besides|other than)\b/i.test(text);
  if (explicitlyDeniesOtherSymptoms) {
    fields.push({ fieldId: "additional_symptoms", value: "No additional symptoms reported", status: "patient_denied", sourceResponseIds: source });
  } else if (target === "additional_symptoms" && !isDenial(text) && !isDecline(text) && !isUnknown(text)) {
    const reportedSymptoms = fields.filter((field) => field.status === "reported" && symptomPatterns.some(([fieldId]) => fieldId === field.fieldId));
    if (reportedSymptoms.length) {
      fields.push({
        fieldId: "additional_symptoms",
        value: reportedSymptoms.map((field) => field.value).filter((value): value is string => Boolean(value)).join(", "),
        status: factStatus,
        sourceResponseIds: source,
      });
    }
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
  if (!fields.some((field) => field.fieldId === "patient_question")) {
    const expressedWorry = text.match(/\b(?:i(?:'m| am)|i feel)\s+(?:really\s+)?(?:worried|concerned|scared|afraid|anxious)[^.!?]*/i);
    if (expressedWorry) {
      fields.push({ fieldId: "patient_question", value: normalizeLabel(expressedWorry[0]), status: factStatus, sourceResponseIds: source });
    } else if (/\?|\b(i want to know|i'd like help understanding|i would like help understanding)\b/i.test(text)) {
      const lastQuestion = text.match(/[^.!?]*\?/g)?.at(-1)?.trim();
      fields.push({ fieldId: "patient_question", value: normalizeLabel(lastQuestion ?? text), status: factStatus, sourceResponseIds: source });
    }
  }

  const onset = extractOnset(text, target);
  const symptomOnsetQuestion = (activeQuestionId ?? response.questionBankId ?? "").match(/^symptom_onset__(.+)$/);
  // A symptom-specific timing answer must not overwrite or conflict with a
  // general onset. The symptom-specific field below is the precise evidence.
  if (onset && !symptomOnsetQuestion) fields.push({ fieldId: "onset", value: onset, status: factStatus, sourceResponseIds: source });
  if (symptomOnsetQuestion) {
    const symptomIds = symptomOnsetQuestion[1]!.split(",").filter(Boolean);
    const specificOnsets = extractNamedSymptomOnsets(text, symptomIds);
    const sharedOnset = extractOnset(text, "onset") ?? normalizeShortOnset(text);
    const symptomsNamedInAnswer = symptomIdsInText(text);
    for (const symptomId of symptomIds) {
      const explicitlyShared = /\b(?:all|both|they|these symptoms)\b[^.!?]{0,45}\b(?:started|began|at the same time|together)\b|\b(?:started|began)\b[^.!?]{0,35}\b(?:all together|at the same time)\b/i.test(text);
      // When one combined onset question is followed by “it began 3 days ago,”
      // treat that singular, unqualified time as applying to the grouped symptoms.
      // If the answer names one symptom, keep the timing specific to that symptom.
      const impliedShared = symptomIds.length > 1 && symptomsNamedInAnswer.length === 0;
      const symptomOnset = specificOnsets.get(symptomId) ?? (symptomIds.length === 1 || explicitlyShared || impliedShared ? sharedOnset : null);
      if (symptomOnset) fields.push({ fieldId: `symptom_onset_${symptomId}`, value: symptomOnset, status: factStatus, sourceResponseIds: source });
      else if (isDecline(text)) fields.push({ fieldId: `symptom_onset_${symptomId}`, value: null, status: "declined", sourceResponseIds: source });
      else if (isUnknown(text) || isDenial(text)) fields.push({ fieldId: `symptom_onset_${symptomId}`, value: null, status: "unknown", sourceResponseIds: source });
      else if (text.length < 3) fields.push({ fieldId: `symptom_onset_${symptomId}`, value: null, status: "unclear", sourceResponseIds: source });
    }
  }
  // A volunteered symptom-specific timeline stays attached to that symptom. A shared
  // timeline is copied across symptoms only when the wording refers to them together.
  if (onset) {
    const symptomIds = symptomIdsInText(text);
    const hasSeparateSymptomTimelines = extractNamedSymptomOnsets(text, symptomIds).size > 0;
    const singularSharedTimeline = symptomIds.length > 1
      && !hasSeparateSymptomTimelines
      && /\b(?:it|this)\s+(?:started|began)\b/i.test(text);
    const explicitlyShared = /\b(?:all|both|they|these symptoms)\b[^.!?]{0,60}\b(?:started|began|at the same time|together)\b|\b(?:started|began)\b[^.!?]{0,45}\b(?:all together|at the same time)\b|\b(?:i\s+)?(?:felt|noticed|started experiencing|have been having)\s+(?:this|them|these symptoms)\b/i.test(text)
      || singularSharedTimeline;
    if (explicitlyShared) {
      for (const symptomId of symptomIds) {
        fields.push({ fieldId: `symptom_onset_${symptomId}`, value: onset, status: factStatus, sourceResponseIds: source });
      }
    } else {
      for (const symptomId of symptomIds) {
        const named = extractNamedSymptomOnsets(text, [symptomId]).get(symptomId);
        if (named) fields.push({ fieldId: `symptom_onset_${symptomId}`, value: named, status: factStatus, sourceResponseIds: source });
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
  if (genericTargets.has(target) && target !== "temperature_measurement" && !isUnknown(text) && !isDecline(text) && !isDenial(text) && text.length >= 2) {
    const measurement = target === "temperature_measurement" ? text.match(/\b\d{2}(?:\.\d+)?\s*°?\s*[cCfF]?\b/)?.[0] : undefined;
    const value = measurement ? `Temperature reading: ${measurement.trim()}${/[°]\s*[cf]|\b[cf]\b/i.test(text) ? "" : " (unit not specified)"}` : normalizeLabel(text);
    fields.push({ fieldId: target, value, status: factStatus, sourceResponseIds: source });
  }

  if (target === "visual_change_timing" && /\b(constant|all the time|comes and goes|intermittent|sudden(?:ly)?|gradual(?:ly)?)\b/i.test(text)) {
    fields.push({ fieldId: target, value: normalizeLabel(text), status: factStatus, sourceResponseIds: source });
  }

  if (isDenial(text) && (target === "additional_symptoms" || target === "daily_impact" || target === "headache_associated_changes" || getQuestionDefinition(activeQuestionId ?? response.questionBankId ?? "")?.answerType === "yes_no_detail")) {
    fields.push({ fieldId: "additional_symptoms", value: "No additional symptoms reported", status: "patient_denied", sourceResponseIds: source });
    if (target !== "additional_symptoms") {
      fields.pop();
      fields.push({ fieldId: target, value: target === "headache_associated_changes"
        ? "No other changes reported; headache remains"
        : `Patient reports no ${target.replace(/_/g, " ")}`, status: "patient_denied", sourceResponseIds: source });
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
    if (update.fieldId === "headache_location" && prior?.value && update.value
      && ["reported", "unclear"].includes(prior.status) && ["reported", "unclear"].includes(update.status)
    ) {
      const combinedValues = [...new Set([...prior.value.split("; ").map((value) => value.trim()), update.value.trim()].filter(Boolean))];
      const combinedValue = combinedValues.join("; ");
      const conflict = hasContradictoryLocation(prior.value, update.value);
      const hasLocation = hasHeadacheLocationDetail(combinedValue);
      const hasMovement = hasHeadacheMovementDetail(combinedValue);
      fields.set(update.fieldId, {
        fieldId: update.fieldId,
        value: combinedValue,
        status: conflict ? "conflicting" : hasLocation && hasMovement ? "reported" : "unclear",
        sourceResponseIds: [...new Set([...prior.sourceResponseIds, ...update.sourceResponseIds])],
      });
      continue;
    }
    if (prior && prior.status === "reported" && update.status === "reported" && prior.value && update.value && prior.value !== update.value) {
      if (isAdditiveDetailField(update.fieldId) && !hasContradictoryLocation(prior.value, update.value)) {
        const combinedValues = [...new Set([...prior.value.split("; ").map((value) => value.trim()), update.value.trim()].filter(Boolean))];
        fields.set(update.fieldId, {
          fieldId: update.fieldId,
          value: combinedValues.join("; "),
          status: "reported",
          sourceResponseIds: [...new Set([...prior.sourceResponseIds, ...update.sourceResponseIds])],
        });
        continue;
      }
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

function hasHeadacheLocationDetail(text: string): boolean {
  return /\b(?:front|forehead|back|left|right|both sides|one side|all over|temples?|behind (?:my |the )?eyes|toward(?:s)? (?:my |the )?eyes?)\b/i.test(text);
}

function hasHeadacheMovementDetail(text: string): boolean {
  return /\b(?:stays?|staying|does not move|doesn'?t move|moves?|moving|shifts?)\b/i.test(text);
}

function isAdditiveDetailField(fieldId: string): boolean {
  return ["headache_location", "headache_character", "symptom_location", "symptom_character", "headache_associated_changes", "additional_symptoms", "patient_question", "relevant_context"].includes(fieldId);
}

function hasContradictoryLocation(first: string, second: string): boolean {
  const pairs: Array<[RegExp, RegExp]> = [
    [/\b(left|left side|left-sided)\b/i, /\b(right|right side|right-sided)\b/i],
    [/\b(front|forehead|in front)\b/i, /\b(back|back of (?:my )?head)\b/i],
    [/\b(stays?|staying|does not move|doesn'?t move)\b/i, /\b(moves?|moving|shifts?)\b/i],
  ];
  return pairs.some(([a, b]) => a.test(first) && b.test(second) || b.test(first) && a.test(second));
}

function extractDetailValue(text: string, fieldId: string): string {
  if (fieldId === "headache_character" || fieldId === "symptom_character") {
    const character = text.match(/\b(?:crushing|squeezing|throbbing|pounding|pressure|sharp|dull|aching|burning|tingling|stabbing|numb|pins and needles)\b/i)?.[0];
    if (character) return normalizeLabel(character);
  }
  if (fieldId === "headache_location" || fieldId === "symptom_location") {
    const locations = [
      /\b(?:front|forehead|back|left|right|both sides|one side|all over|temples?|behind (?:my |the )?eyes|toward(?:s)? (?:my |the )?eyes?)\b(?:[^.!?]{0,18}\b(?:head|temple|eye|side)\b)?/i,
    ].flatMap((pattern) => [...text.matchAll(new RegExp(pattern.source, "gi"))].map((match) => match[0]));
    const movement = /\b(?:stays? (?:in|at) (?:the )?same place|stays? there|does not move|doesn't move|moves? around|moves? to another (?:area|place)|shifts? around)\b/i.exec(text)?.[0];
    const pieces = [...locations, ...(movement ? [movement] : [])].map((piece) => normalizeLabel(piece));
    if (pieces.length) return [...new Set(pieces)].join("; ");
  }
  return normalizeLabel(text);
}

export function factIsSufficient(field: IntakeField | undefined): boolean {
  return Boolean(field && ["reported", "patient_corrected", "patient_denied", "declined", "unknown", "not_answered", "not_asked"].includes(field.status));
}

function extractOnset(text: string, target: string): string | null {
  if (isUnknown(text) || isDecline(text) || isDenial(text)) return null;
  // Prefer the time attached to an explicit onset marker when a sentence also
  // mentions another time (for example, "felt bad today, started yesterday").
  const explicitDateAndTime = findUnnegatedTime(text, /\b(?:started|began|first felt|first noticed|came on)\s+(today|yesterday)\s+(?:at|around)\s+(midnight|noon|(?:(?:12|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?))|(?:[01]?\d|2[0-3]):[0-5]\d)\b/i);
  if (explicitDateAndTime) return normalizeTimeLabel(`${explicitDateAndTime[1]} at ${explicitDateAndTime[2]}`);
  const explicitTime = findUnnegatedTime(text, /\b(?:started|began|first felt|first noticed|came on|since)\s+(?:at\s+|on\s+)?(earlier in the morning|earlier this morning|early this morning|this morning|in the morning|early morning|earlier today|early today|this afternoon|earlier this afternoon|this evening|earlier this evening|tonight|last night|overnight|yesterday morning|yesterday afternoon|yesterday evening|yesterday|today|around midnight|at midnight|midnight|at dawn|at sunrise|last week|this week|(?:last|this)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(?:around|about|at)\s+(?:12|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)|\d{4}-\d{2}-\d{2})\b/i);
  if (explicitTime) return normalizeLabel(explicitTime[1]!);
  const conversationalDateAndTime = findUnnegatedTime(text, /\b(today|yesterday)\s+(?:at|around)\s+(midnight|noon|(?:12|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)|(?:[01]?\d|2[0-3]):[0-5]\d)\b/i);
  if (conversationalDateAndTime && isOnsetTarget(target)) {
    return normalizeTimeLabel(`${conversationalDateAndTime[1]} at ${conversationalDateAndTime[2]}`);
  }
  const twelveHourWordTime = findUnnegatedTime(text, /\b(?:(?:around|about|at)\s+)?12\s+(midnight|noon)\b/i);
  if (twelveHourWordTime && isOnsetTarget(target)) return normalizeLabel(twelveHourWordTime[1]!);
  // Patients often answer a direct onset question with a short time phrase,
  // rather than repeating "it started". Treat these as valid timelines too.
  const conversationalTime = findUnnegatedTime(text, /\b(earlier in the morning|earlier this morning|early this morning|this morning|in the morning|early morning|earlier today|early today|this afternoon|earlier this afternoon|this evening|earlier this evening|tonight|last night|overnight|yesterday morning|yesterday afternoon|yesterday evening|yesterday|today|around midnight|at midnight|midnight|at dawn|at sunrise|last week|this week|(?:last|this)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(?:around|about|at)\s+(?:12|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)|\d{4}-\d{2}-\d{2})\b/i);
  if (conversationalTime && isOnsetTarget(target)) return normalizeLabel(conversationalTime[1]!);
  const clockTime = findUnnegatedTime(text, /\b(?:(?:around|about|at)\s+)?(12|0?[1-9])(?::[0-5]\d)?\s*(a\.?m\.?|p\.?m\.?)\b/i);
  if (clockTime && isOnsetTarget(target)) return normalizeTimeLabel(clockTime[0]!);
  const conversational24HourTime = findUnnegatedTime(text, /\b(?:(?:around|about|at)\s+)?((?:[01]?\d|2[0-3]):[0-5]\d)\b/i);
  if (conversational24HourTime && isOnsetTarget(target)) return normalizeLabel(conversational24HourTime[0]!);
  const noonTime = findUnnegatedTime(text, /\b(?:(?:around|about|at)\s+)?(noon)\b/i);
  if (noonTime && isOnsetTarget(target)) return normalizeLabel(noonTime[0]!);
  if (/\b(?:since|when) i (?:first )?(?:woke up|got up)(?: today)?\b/i.test(text)) return /\btoday\b/i.test(text) ? "Today, when patient woke up" : "When patient woke up";
  const amount = "(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a few|half an)";
  const units = "(?:seconds?|secs?|minutes?|mins?|hours?|days?|weeks?|months?|years?)";
  const vagueRecent = text.match(/\b(?:just\s+)?(?:a\s+)?(?:little\s+)?while\s+a\s*go\b|\b(?:just\s+now|very\s+recently|recently)\b/i);
  if (vagueRecent && isOnsetTarget(target)) {
    const phrase = vagueRecent[0].toLowerCase().replace(/\s+/g, " ").trim();
    return /recently/.test(phrase) ? "Recently" : /just now/.test(phrase) ? "Just now" : "A little while ago";
  }
  const explicit = text.match(new RegExp(`\\b(?:started|began|beginning|since)\\s+(today|yesterday|this morning|last night|on\\s+[a-z]+|${amount}\\s*${units}\\s+ago)\\b`, "i"));
  if (explicit) return normalizeOnsetValue(explicit[1]!);
  const volunteered = text.match(new RegExp(`\\b(?:(?:around|about|approximately|roughly)\\s+)?(?:just\\s+)?(${amount})\\s*(${units})\\s+ago\\b`, "i"));
  if (volunteered) return `About ${formatDuration(volunteered[1]!, volunteered[2]!)} ago`;
  const duration = text.match(new RegExp(`\\b(?:for|over|in the past)\\s+(${amount})\\s+(${units})\\b`, "i"));
  if (duration) return `For ${formatDuration(duration[1]!, duration[2]!)}`;
  const bareDuration = text.match(new RegExp(`^\\s*(${amount})\\s*(${units})\\s*[.!]?\\s*$`, "i"));
  if (isOnsetTarget(target) && bareDuration) return `For ${formatDuration(bareDuration[1]!, bareDuration[2]!)}`;
  if (target === "onset" && /^\s*(today|yesterday|this morning|last night|\d+\s+(?:hours?|days?|weeks?))\s*[.!]?\s*$/i.test(text)) return normalizeLabel(text.replace(/[.!]/g, ""));
  if (/\b(?:today|this morning|last night|yesterday)\b[^.!?]{0,40}\b(?:started|began|woke up)\b/i.test(text)) {
    return normalizeLabel(text.match(/\b(today|this morning|last night|yesterday)\b/i)![1]!);
  }
  return null;
}

function normalizeOnsetValue(value: string): string {
  const duration = value.match(/^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a few|half an)\s*(seconds?|secs?|minutes?|mins?|hours?|days?|weeks?|months?|years?)\s+ago$/i);
  return duration ? `About ${formatDuration(duration[1]!, duration[2]!)} ago` : normalizeLabel(value);
}

function formatDuration(amount: string, unit: string): string {
  const normalizedAmount = amount.toLowerCase();
  const normalizedUnit = normalizeDurationUnit(unit);
  const singular = /^(?:1|one|a|an|half an)$/i.test(normalizedAmount);
  return `${normalizedAmount} ${singular ? normalizedUnit.replace(/s$/, "") : normalizedUnit}`;
}

function normalizeDurationUnit(unit: string): string {
  const normalized = unit.toLowerCase();
  if (/^(?:sec|second)/.test(normalized)) return "seconds";
  if (/^(?:min|minute)/.test(normalized)) return "minutes";
  if (/^hour/.test(normalized)) return "hours";
  if (/^day/.test(normalized)) return "days";
  if (/^week/.test(normalized)) return "weeks";
  if (/^month/.test(normalized)) return "months";
  if (/^year/.test(normalized)) return "years";
  return normalized.replace(/s$/, "");
}

function isOnsetTarget(target: string): boolean {
  return /onset|timeline|duration/i.test(target);
}

function normalizeTimeLabel(value: string): string {
  return normalizeLabel(value.replace(/\b([ap])\.?m\.?/gi, "$1m"));
}

function findUnnegatedTime(text: string, pattern: RegExp): RegExpMatchArray | null {
  const globalPattern = new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`);
  for (const match of text.matchAll(globalPattern)) {
    const prefix = text.slice(Math.max(0, match.index - 32), match.index);
    const negatesBareTime = /\b(?:not|never)\s+(?:(?:at|around|about|on|in|the)\s+)*$/i.test(prefix)
      || /\bno\s*[, ]*$/i.test(prefix)
      || /\b(?:don't|do not|didn't|did not|wasn't|was not|isn't|is not)\s+(?:think\s+)?(?:it\s+)?$/i.test(prefix);
    // “not until midnight” affirms midnight as the start, so exclude “until”
    // from this negation check while still rejecting “didn't start at midnight”.
    const negatesOnset = /\b(?:do not|don't|did not|didn't|was not|wasn't|does not|doesn't|never)\s+(?:think\s+)?(?:it\s+)?(?:start(?:ed)?|begin|began)\s+(?:(?:at|around|on)\s+)?$/i.test(prefix);
    if (!negatesBareTime && !negatesOnset) return match;
  }
  return null;
}

function detectHeadacheContext(response: PatientResponse, activeQuestion: string): boolean {
  return /\b(headache|head pain|migraine|head)\b/i.test(`${response.text} ${activeQuestion}`);
}

function normalizeShortOnset(text: string): string | null {
  return extractOnset(text, "onset");
}

const SYMPTOM_TEXT_PATTERNS: Array<[string, RegExp]> = [
  ["headache", /\b(?:headaches?|migraines?)\b/i], ["nausea", /\bnause(?:a|ous)\b/i], ["cough", /\bcough(?:ing)?\b/i],
  ["sore_throat", /\bsore throat\b/i], ["runny_nose", /\brunny nose\b/i], ["cold_like_symptoms", /\b(?:common cold|cold symptoms|colds|a cold)\b/i], ["fever", /\b(?:feverish|fever|feeling hot|feel hot|i am hot|i'm hot)\b/i],
  ["weakness", /\bweak(?:ness)?\b|\bno energy\b/i], ["body_aches", /\bbody aches?\b|\bmuscle aches?\b/i],
  ["chills", /\b(?:chills?|shivering|feeling cold|feel cold)\b/i], ["stomach_pain", /\b(?:stomach|abdominal|belly)\s+(?:ache|pain|cramp)s?\b|\b(?:my\s+)?(?:stomach|belly)\s+hurts\b/i],
  ["cramping", /\bcramp(?:ing)?\b/i],
  ["diarrhea", /\b(?:diarrh?ea|loose stools?)\b/i], ["vomiting", /\b(?:vomit(?:ed|ing)?|threw up)\b/i], ["eye_soreness", /\b(?:sore|painful|hurting|aching)\s+(?:my\s+)?eyes?\b|\beyes?\s+(?:are\s+)?(?:sore|painful|hurting)\b|\beye soreness\b/i],
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
    const marker = /\b(?:(?:started|began|since)\s+(?:at\s+|on\s+)?(?:earlier in the morning|earlier this morning|early this morning|this morning|in the morning|early morning|earlier today|early today|this afternoon|earlier this afternoon|this evening|earlier this evening|tonight|last night|overnight|yesterday morning|yesterday afternoon|yesterday evening|yesterday|today|around midnight|at midnight|midnight|at dawn|at sunrise|last week|this week|(?:last|this)\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|(?:around|about|at)\s+(?:12|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)|(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s*(?:seconds?|secs?|minutes?|mins?|hours?|days?|weeks?|months?|years?)\s+ago)|for\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|a few|half an)\s*(?:seconds?|secs?|minutes?|mins?|hours?|days?|weeks?|months?|years?))\b/gi;
    const markers: Array<{ value: string; distance: number }> = [];
    const dateAndTime = /\b(?:started|began|first felt|first noticed)\s+(today|yesterday)\s+(?:at|around)\s+(midnight|noon|(?:12|0?[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?))\b/gi;
    let dateAndTimeMatch: RegExpExecArray | null;
    while ((dateAndTimeMatch = dateAndTime.exec(text)) !== null) {
      const center = match.index + Math.floor(match[0].length / 2);
      markers.push({
        value: normalizeLabel(`${dateAndTimeMatch[1]} at ${dateAndTimeMatch[2]}`),
        distance: Math.abs(dateAndTimeMatch.index - center),
      });
    }
    let markerMatch: RegExpExecArray | null;
    while ((markerMatch = marker.exec(text)) !== null) {
      const date = markerMatch[0].replace(/^(?:started|began|since)\s+/i, "");
      const center = match.index + Math.floor(match[0].length / 2);
      markers.push({ value: extractOnset(date, "onset") ?? normalizeLabel(date), distance: Math.abs(markerMatch.index - center) });
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
  return /^\s*(?:none|nothing|nope|no|no other symptoms?|nothing else|that's all|that is all|just what i said)(?:\s*,?\s*just\s+(?:the\s+)?(?:my\s+)?headache)?\b(?:[\s,.!?-]*(?:just what i said|as i said))?[\s,.!?-]*$/i.test(text);
}

function isDecline(text: string): boolean {
  return /^\s*(?:skip(?: this)?|can we skip(?: this)?|let'?s not do that|i(?:'d| would) rather not(?: (?:say|answer|do that))?|prefer not to (?:say|answer)|i don't want to answer|i do not want to answer|i'm not comfortable answering|i(?:'m| am) not comfortable with that)\b/i.test(text);
}

function isUnknown(text: string): boolean {
  return /^\s*(?:idk\b|i don't know|i do not know|don't know|do not know|not sure|unsure|i'm not sure|i am not sure|i can't tell|i cannot tell|no idea)\b/i.test(text);
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

/** Record a temperature only with measurement context; never treat age/duration as a reading. */
export function extractReportedTemperature(text: string, answeringTemperature = false): string | null {
  if (isRecallRequest(text)) return null;
  const match = text.match(/\b(\d{2,3}(?:\.\d+)?)\s*(°\s*[cCfF]?|degrees?(?:\s+(?:celsius|fahrenheit|[cCfF]\b))?|[cCfF]\b)/i)
    ?? text.match(/\b(?:temperature|temp|reading|thermometer|fever)(?:\s+(?:is|was|of|at|reads?|showed|about|around|i think))*\s*[:=]?\s*(\d{2,3}(?:\.\d+)?)/i)
    ?? (answeringTemperature ? text.match(/^\s*(?:yes[, ]+)?(\d{2,3}(?:\.\d+)?)(?![\d.]|\s*(?:hours?|days?|years?|minutes?)\b)/i) : null);
  if (!match || /\b(?:not|never)\s*$/i.test(text.slice(0, match.index))) return null;
  const unit = match[2]?.match(/celsius|fahrenheit|[cf]\b/i)?.[0];
  const readingStart = match.index ?? 0;
  const prefix = text.slice(0, readingStart);
  const sentenceStart = Math.max(prefix.lastIndexOf("."), prefix.lastIndexOf("!"), prefix.lastIndexOf("?"), prefix.lastIndexOf(";")) + 1;
  const sentencePrefix = prefix.slice(sentenceStart);
  const clauseStart = Math.max(sentencePrefix.lastIndexOf(","), sentencePrefix.toLowerCase().lastIndexOf(" and "), sentencePrefix.toLowerCase().lastIndexOf(" but "), sentencePrefix.toLowerCase().lastIndexOf(" while "));
  const nearbyPrefix = sentencePrefix.slice(clauseStart + 1);
  const tail = text.slice(readingStart + match[0].length);
  const nearbySuffix = tail.split(/[,;.!?]|\b(?:and|but|while)\b/i)[0] ?? "";
  const immediatelyQualifiedAfter = /^\s*(?:[,;:]\s*)?(?:(?:and|but)\s+)?(?:i think|maybe|not sure|approximately|about|around)\b/i.test(tail);
  const uncertain = /\b(?:i think|maybe|not sure|approximately|about|around)\b/i.test(nearbyPrefix)
    || /\b(?:i think|maybe|not sure|approximately|about|around)\b/i.test(nearbySuffix)
    || immediatelyQualifiedAfter;
  return `Temperature reading: ${match[1]}${unit ? /^(?:c|celsius)$/i.test(unit) ? " °C" : " °F" : " degrees (unit not specified)"}${uncertain ? " (uncertain or approximate, as reported)" : ""}`;
}

/** Backfill facts missed by an older extractor without discarding later corrections. */
export function restorePatientFacts(state: IntakeState): IntakeField[] {
  let recovered: IntakeField[] = [];
  for (const response of state.responses) {
    recovered = mergeFieldUpdates(recovered, extractPatientFacts(response, response.questionId ?? "", response.questionBankId));
  }
  const fields = new Map(recovered.map(field => [field.fieldId, field]));
  for (const field of state.fields) {
    const invalidTemperature = field.fieldId === "temperature_measurement" && field.status !== "conflicting"
      && field.value !== null && !/\d/.test(field.value);
    if (!invalidTemperature || !fields.has(field.fieldId)) fields.set(field.fieldId, field);
  }
  return [...fields.values()];
}
