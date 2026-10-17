export type ConversationIntent = "finish" | "summary" | "workflow_question" | "guidance_request" | "personal_concern" | "correction" | "decline" | "unclear" | "identity_question" | "eye_care_navigation" | "care_service_request" | "frightened_about_dying" | "greeting" | "vague_opening" | "ambiguous_opening" | "continue";

const FINISH_PATTERNS = [
  /^\s*(?:please\s+)?(?:wrap(?:\s+it)?\s+up|let'?s\s+finish|finish(?:\s+the\s+interview)?|end\s+(?:the\s+)?interview|stop\s+asking(?:\s+questions)?|i'?m\s+done|i\s+am\s+done|submit\s+my\s+intake)\b[.!\s]*$/i,
  /\b(?:that'?s all|that is all|nothing else)\b[\s,.!?-]*(?:please\s+)?(?:finish|wrap up|stop(?: asking)?)\b/i,
  /^\s*(?:that'?s\s+all|that\s+is\s+all|nothing\s+else|no\s+more\s+questions)\b[.!\s]*$/i,
];

const WORKFLOW_QUESTION = /\b(what (?:happens|are the steps?) next|next steps?|after this|in the meantime|what (?:should|can) i do(?: with this)?|what do i do now|how does (?:this|the intake) work|who (?:will|can) review this)\b/i;
const GUIDANCE_REQUEST = /\b(?:what should i do(?: then)?|what can i do(?: to (?:ease|help|feel better))?|what do i do|what to do|how can i (?:ease|manage|help|look after)|how do i (?:ease|manage)|any (?:advice|tips|home remedies)|what can help|how can i feel better|should i see (?:a doctor|someone|a clinician)|do i need (?:medical help|to see)|is this serious|what does this mean)\b/i;
const CARE_SERVICE = /\b(cardi(?:o(?:log(?:y|ist))?)|x\s*[- ]?ray|radiology|imaging|scan|specialist|clinic|hospital|doctor|provider)\b/i;
const CARE_SERVICE_REQUEST = /\b(find|locate|look(?:ing)? for|help me (?:find|get|see)|need|want|book|schedule|arrange|refer me to|can i get|where can i get)\b/i;

export function classifyConversationIntent(input: {
  text: string;
  isFirstPatientTurn?: boolean;
}): ConversationIntent {
  const text = input.text.trim();
  if (/^\/summary$/i.test(text)) return "summary";
  if (FINISH_PATTERNS.some((pattern) => pattern.test(text))) return "finish";
  if (/^\s*(?:none|nothing|no|nope|nothing else|that's all|that is all|just what i said)[.!\s]*$/i.test(text)) return "continue";
  if (WORKFLOW_QUESTION.test(text) && /\b(?:with this|next steps?|after this|what happens|how does this intake work|who will review)\b/i.test(text)) return "workflow_question";
  if (GUIDANCE_REQUEST.test(text)) return "guidance_request";
  if (/\b(?:i was wrong|i meant|to clarify|correction|actually,? i|that should be|i need to correct|i already (?:said|told you|answered)|i told you)\b/i.test(text)
    || /\b(?:what do you mean|wtf do you mean|wdym)\b/i.test(text)
      && /\b(?:started|began|since|ago|today|yesterday|this morning|last night|woke up)\b/i.test(text)) return "correction";
  if (/^\s*(?:i(?:'m| am) not comfortable answering|i(?:'d| would) rather not say|skip(?: this)?|prefer not to answer)\b/i.test(text)) return "decline";
  if (/^\s*(?:i don'?t know|not sure|unsure|unclear|what do you mean|i can'?t tell)\b/i.test(text)) return "unclear";
  if (/^\s*(?:who are you|what are you|are you (?:a doctor|a real person|human)|what can you do|how can you help)(?:\s+for me)?[?!.\s]*$/i.test(text)) return "identity_question";
  if (/\b(?:sore|painful|hurting|irritated|red|itchy)\b[^.!?]{0,50}\b(?:eye|eyes|vision|sight)\b|\b(?:eye|eyes)\b[^.!?]{0,50}\b(?:sore|painful|hurting|irritated|red|itchy)\b/i.test(text)
    && /\b(where should i|where can i|where do i|where should i get help|what (?:kind of )?(?:doctor|clinic|specialist)|who should i see|which doctor|where to get help)\b/i.test(text)) return "eye_care_navigation";
  if (CARE_SERVICE.test(text) && CARE_SERVICE_REQUEST.test(text)) return "care_service_request";
  if (/\b(?:i feel|i think|i'?m afraid|i am afraid|i'?m scared|i am scared)\b[^.!?]{0,45}\b(?:going to die|gonna die|might die|will die|about to die)\b/i.test(text)) return "frightened_about_dying";
  if (input.isFirstPatientTurn && /^(?:hi|hello|hey|good morning|good afternoon|good evening|howdy)[!.\s]*$/i.test(text)) return "greeting";
  if (input.isFirstPatientTurn && /\b(?:i'?m|i am) going through something\b|\b(?:something'?s|something is) (?:wrong|going on|bothering me)\b|\bsomething feels? (?:off|different|wrong|not right)\b|\bi(?:'m| am) having a hard time\b|\bi (?:do not|don't) feel (?:right|like myself|like me)\b|\bi feel (?:weird|off|strange|unwell)\b|\bnot feeling (?:right|myself|well)\b|\bi'?m worried about my health\b|\bi(?:'m| am) not sure (?:what'?s wrong|what is wrong|how to explain it)\b/i.test(text)) return "vague_opening";
  if (input.isFirstPatientTurn && text.split(/\s+/).length <= 3 && !/\b(pain|ache|sick|symptom|feel|feeling|medical|doctor|health|concern|cough|fever|nause|headache|cold|weak|stomach|throat)\b/i.test(text)) {
    return "ambiguous_opening";
  }
  if (/\b(?:i am worried|i'?m worried|i am concerned|i'?m concerned|i feel scared|i'?m scared|i am scared|i feel anxious|i'?m anxious)\b/i.test(text)) return "personal_concern";
  return "continue";
}

export function isNoAdditionalInformation(text: string): boolean {
  return /^\s*(?:none|nothing|no|nope|nothing else|no more|that's all|that is all|that's everything|that is everything|just what i said|only that)\b[\s,.!?-]*(?:thank you|thanks)?[\s,.!?-]*$/i.test(text);
}

