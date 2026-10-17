import type { QuestionAnswerResult } from "./contracts.js";

export type QuestionScope = QuestionAnswerResult["scope"];

// Deliberately conservative lexical gate. It rejects obvious unrelated topics before AMD is called.
// It is not a semantic classifier and cannot prove that every accepted question is safe.
const SYSTEM_TERMS = /\b(consultprep|pre.?consultation|consultation brief|intake (workflow|form|question|state)|patient response|clinician review|this (app|assistant|system)|our (app|assistant|system|chatbot)|rag|ai draft)\b/i;
const MEDICAL_TERMS = /\b(medical|medicine|health|healthcare|symptom|pain|ache|fever|cough|breath|breathing|headache|migraine|heart|chest|blood|pressure|diabetes|asthma|cancer|infection|disease|condition|disorder|syndrome|allerg(y|ies)|medication|medicine|drug|dose|pregnan|mental health|anxiety|depression|injur|wound|doctor|clinician|hospital|clinic|anatomy|diagnos|treatment|therapy|vaccine|nutrition|diet|sleep|surgery|stroke|seizure|rash|nausea|vomit|diarrh|constipat|kidney|liver|lung|skin|brain|muscle|bone|joint|throat|ear|eye|stomach|abdomen|urine|infection|virus|bacteria)\w*\b/i;

export function classifyQuestionScope(question: string): QuestionScope {
  if (SYSTEM_TERMS.test(question)) return "system";
  if (MEDICAL_TERMS.test(question)) return "medical";
  return "out_of_scope";
}

export function isContextualFollowUp(question: string): boolean {
  return /^(why\??|how so\??|tell me more\.?|can you explain (that|it)\??|what about (that|it)\??|is that (common|normal|serious)\??|what does that mean\??)$/i.test(question.trim());
}

export function isPersonalizedDiagnosisOrTreatmentRequest(question: string): boolean {
  return /\b(what (do|disease|condition|illness) (i|we) have|what could be wrong with me|what might be wrong with me|what is wrong with me|what is causing my|what does this (rash|pain|symptom|lump|swelling) mean|does this mean i have|is this a sign of|is that serious|am i (at risk|having)|will i be okay|will i die|do i have|diagnose me|what should i (take|do|use)|should i (take|stop|start|change)|can i take|which (medicine|medication|drug) should i|what (dose|dosage) should i|prescribe|can you diagnose|tell me if this is (cancer|a disease|serious))\b/i.test(question);
}

export const OUT_OF_SCOPE_ANSWER = "I can help with general medical information or questions about ConsultPrep. I can't help with that topic. What medical or ConsultPrep question can I help with?";
export const PERSONALIZED_MEDICAL_ANSWER = "I can share general medical information, but I can't diagnose you or recommend a personal treatment or medication. Please discuss your symptoms and care options with a qualified healthcare professional.";
