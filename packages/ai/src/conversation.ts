export type ConversationIntent = "recall_request" | "format_preference" | "clarification_request" | "off_topic" | "finish" | "summary" | "workflow_question" | "guidance_request" | "personal_concern" | "correction" | "repetition_complaint" | "decline" | "unclear" | "identity_question" | "eye_care_navigation" | "care_service_request" | "frightened_about_dying" | "greeting" | "vague_opening" | "ambiguous_opening" | "continue";

export type CommunicationPreferences = {
  questionFormat?: "plain" | "bullets";
  questionPacing?: "one_at_a_time" | "grouped";
};

export function communicationPreferencesFromText(text: string): CommunicationPreferences | null {
  const preferences: CommunicationPreferences = {};
  if (/\b(?:bullet(?:s|ed)?|list format|numbered list)\b/i.test(text)
    && /\b(?:ask|questions?|format|list)\b/i.test(text)) preferences.questionFormat = "bullets";
  if (/\b(?:one question at a time|one at a time|just one question|ask singly)\b/i.test(text)) {
    preferences.questionPacing = "one_at_a_time";
  } else if (/\b(?:everything important at once|all (?:the )?questions at once|group (?:the )?questions|fewer questions|faster|more quickly|in one go)\b/i.test(text)) {
    preferences.questionPacing = "grouped";
  } else if (preferences.questionFormat === "bullets" && /\b(?:i will answer|i'll answer|then i can answer|answer them)\b/i.test(text)) {
    preferences.questionPacing = "grouped";
  }
  return Object.keys(preferences).length ? preferences : null;
}

const FINISH_PATTERNS = [
  /^\s*(?:please\s+)?(?:wrap(?:\s+it)?\s+up|let'?s\s+finish|finish(?:\s+the\s+interview)?|end\s+(?:the\s+)?interview|stop\s+asking(?:\s+questions)?|i'?m\s+done|i\s+am\s+done|submit\s+my\s+intake)\b[.!\s]*$/i,
  /\b(?:that'?s all|that is all|nothing else)\b[\s,.!?-]*(?:please\s+)?(?:finish|wrap up|stop(?: asking)?)\b/i,
  /^\s*(?:that'?s\s+all|that\s+is\s+all|nothing\s+else|no\s+more\s+questions)\b[.!\s]*$/i,
];

const WORKFLOW_QUESTION = /\b(?:what (?:happens|are the steps?) next|what(?:['’]s| is) next(?: then)?|next steps?|after this|in the meantime|what now|then what|what are you (?:going to|gonna) do next|how does (?:this|the intake) work|who (?:will|can) review this)\b/i;
const GUIDANCE_REQUEST = /\b(?:what should i do(?: then)?|what can i do(?: instead)?(?: to (?:ease|help|feel better|relieve)(?: the pain)?)?|what do i do|what to do|how can i (?:ease|manage|help|look after|relieve)|how do i (?:ease|manage)|any (?:advice|tips|home remedies)|(?:any|some) tips? before i (?:go|see) (?:to )?(?:the )?(?:doct(?:or|r)|clinician)|what can help|how can i feel better|should i see (?:a doctor|someone|a clinician)|do i need (?:medical help|to see)|is this serious|what does this mean)\b/i;
const CARE_SERVICE = /\b(cardi(?:o(?:log(?:y|ist))?)|x\s*[- ]?ray|radiology|imaging|scan|specialist|clinic|hospital|doctor|provider)\b/i;
const CARE_SERVICE_REQUEST = /\b(find|locate|look(?:ing)? for|help me (?:find|get|see)|need|want|book|schedule|arrange|refer me to|can i get|where can i get)\b/i;

export function classifyConversationIntent(input: {
  text: string;
  isFirstPatientTurn?: boolean;
}): ConversationIntent {
  const text = input.text.trim();
  if (isRecallRequest(text)) return "recall_request";
  if (isStandaloneRepetitionComplaint(text)) return "repetition_complaint";
  if (/^\/summary$/i.test(text)
    || /\b(?:summari[sz]e|organize|put together|combine).{0,70}\b(?:now|this|what i (?:said|shared)|doctor|clinician|report|summary|notes?)\b/i.test(text)
    || /\b(?:report|summary)\b.{0,70}\b(?:doctor|clinician|what i (?:said|shared)|this)\b/i.test(text)) return "summary";
  if (FINISH_PATTERNS.some((pattern) => pattern.test(text))) return "finish";
  if (communicationPreferencesFromText(text)) return "format_preference";
  if (/^\s*(?:huh\??|wdym\??|what do you mean\??|can you explain(?: that| the question)?\??|i don't understand\??|i do not understand\??)[.!\s]*$/i.test(text)) return "clarification_request";
  if (/^\s*(?:none|nothing|no|nope|nothing else|that's all|that is all|just what i said)[.!\s]*$/i.test(text)) return "continue";
  if (WORKFLOW_QUESTION.test(text)) return "workflow_question";
  if (GUIDANCE_REQUEST.test(text)) return "guidance_request";
  if (isBareMisattributionCorrection(text)) return "correction";
  if (/\b(?:i was wrong|i meant|to clarify|correction|actually,? i|that should be|i need to correct|i already (?:said|told you|answered)|i told you)\b/i.test(text)
    || /\b(?:what do you mean|wtf do you mean|wdym)\b/i.test(text)
      && /\b(?:started|began|since|ago|today|yesterday|this morning|last night|woke up)\b/i.test(text)) return "correction";
  if (/^\s*(?:i(?:'m| am) not comfortable answering|i(?:'m| am) not comfortable with that|i(?:'d| would) rather not(?: say| answer| do that)?|skip(?: this)?|can we skip(?: this)?|let'?s not do that|prefer not to (?:say|answer))\b/i.test(text)) return "decline";
  if (/^\s*(?:idk\b|i don'?t know|not sure|unsure|unclear|what do you mean|i can'?t tell|i cannot tell|no idea)\b/i.test(text)) return "unclear";
  if (/^\s*(?:who are you|what are you|are you (?:a doctor|a real person|human)|what can you do|how can you help)(?:\s+for me)?[?!.\s]*$/i.test(text)) return "identity_question";
  if (/\b(?:sore|painful|hurting|irritated|red|itchy)\b[^.!?]{0,50}\b(?:eye|eyes|vision|sight)\b|\b(?:eye|eyes)\b[^.!?]{0,50}\b(?:sore|painful|hurting|irritated|red|itchy)\b/i.test(text)
    && /\b(where should i|where can i|where do i|where should i get help|what (?:kind of )?(?:doctor|clinic|specialist)|who should i see|which doctor|where to get help)\b/i.test(text)) return "eye_care_navigation";
  if (CARE_SERVICE.test(text) && CARE_SERVICE_REQUEST.test(text)) return "care_service_request";
  if (/\b(?:i feel|i think|i'?m afraid|i am afraid|i'?m scared|i am scared)\b[^.!?]{0,45}\b(?:going to die|gonna die|might die|will die|about to die)\b/i.test(text)) return "frightened_about_dying";
  if (/^(?:hi|hello|hey|good morning|good afternoon|good evening|howdy)[!.\s]*$/i.test(text)) return "greeting";
  if (input.isFirstPatientTurn && /\b(?:i'?m|i am) going through something\b|\b(?:something'?s|something is) (?:wrong|going on|bothering me)\b|\bsomething feels? (?:off|different|wrong|not right)\b|\bi(?:'m| am) having a hard time\b|\bi (?:do not|don't) feel (?:right|like myself|like me)\b|\bi feel (?:weird|off|strange|unwell)\b|\bnot feeling (?:right|myself|well)\b|\bi'?m worried about my health\b|\bi(?:'m| am) not sure (?:what'?s wrong|what is wrong|how to explain it)\b/i.test(text)) return "vague_opening";
  if (input.isFirstPatientTurn && text.split(/\s+/).length <= 3 && !/\b(pain|ache|sick|symptom|feel|feeling|medical|doctor|health|concern|cough|fever|nause|headache|cold|weak|stomach|throat)\b/i.test(text)) {
    return "ambiguous_opening";
  }
  if (!/\b(?:headache|pain|ache|dizz|fever|cold|cough|sore|nause|vomit|symptom|feel|feeling|weak|rash|breath|vision|eye|stomach|throat|urine|concern|doctor|clinician|health)\b/i.test(text)
    && /\b(?:fuck you|you bitch|bitch|asshole|idiot|shut up|die|wtf|what the fuck)\b/i.test(text)) return "off_topic";
  if (/\b(?:i am worried|i'?m worried|i am concerned|i'?m concerned|i feel scared|i'?m scared|i am scared|i feel anxious|i'?m anxious)\b/i.test(text)) return "personal_concern";
  return "continue";
}

/** A short dispute of something the assistant attributed to the patient. */
export function isBareMisattributionCorrection(text: string): boolean {
  return /^\s*(?:(?:i\s+)?(?:never|didn'?t|did not)\s+(?:say|said|mention|mentioned)\s+that|that'?s\s+not\s+what\s+i\s+said|you\s+made\s+that\s+up)[.!?\s]*$/i.test(text);
}

/** A repetition complaint contains no answer to extract as a clinical fact. */
export function isStandaloneRepetitionComplaint(text: string): boolean {
  return /^\s*(?:i\s+(?:(?:already|have already)\s+)?(?:said|answered|told you)(?:\s+(?:that|it|this))?|i(?:'ve| have) already answered(?:\s+(?:that|it|this))?|i told you already|you(?:'ve| have)? asked(?: me)?(?:\s+(?:that|this))? already|asked(?: me)? that already)(?:[\s,!.]+(?:already|before|guess what|obviously|come on|again))?[.!?\s]*$/i.test(text);
}

export function isNoAdditionalInformation(text: string): boolean {
  return /^\s*(?:none|nothing|no|nope|nothing else|no more|that's all|that is all|that's everything|that is everything|just what i said|only that)\b[\s,.!?-]*(?:thank you|thanks)?[\s,.!?-]*$/i.test(text);
}


/** Requests about the conversation are not new clinical answers. */
export function isRecallRequest(text: string): boolean {
  if (/\b(?:tell me|repeat back) (?:everything|all(?: of)? what) i (?:said|told you|shared)\b/i.test(text)) return true;
  return /\b(?:what (?:did|have) i (?:say|tell|mention|report)|what (?:was|is) my (?:temperature|reading|symptoms?|headache)|remind me|repeat (?:my|what i)|tell me (?:the )?(?:numbers?|reading|temperature)|do you remember|i already (?:said|told you) my temperature)\b/i.test(text)
    || /^\s*(?:what is it|what was it|what number|how much was it)[?!.\s]*$/i.test(text);
}
