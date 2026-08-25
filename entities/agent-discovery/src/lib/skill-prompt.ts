import {
  formatVocabularyForPrompt,
  type TagVocabularyEntry,
} from "./tag-vocabulary";

export interface SkillDeriverInput {
  topicTitles: string[];
  toolDescriptions: string[];
  tagVocabulary: TagVocabularyEntry[];
}

export function buildSkillPrompt(input: SkillDeriverInput): string {
  const sections: string[] = [];

  if (input.topicTitles.length > 0) {
    sections.push(
      `The brain's knowledge domains (from content analysis):\n${input.topicTitles.map((t) => `- ${t}`).join("\n")}`,
    );
  }

  if (input.toolDescriptions.length > 0) {
    sections.push(
      `The brain has these capabilities:\n${input.toolDescriptions.map((t) => `- ${t}`).join("\n")}`,
    );
  }

  const primer = formatVocabularyForPrompt(input.tagVocabulary);
  if (primer) sections.push(primer);

  return `You are analyzing a brain's content to identify its high-level capabilities.

${sections.join("\n\n")}

CONSOLIDATION RULES (critical):
- Combine related knowledge domains into broader skills
- There should be FEWER skills than knowledge domains
- "Event Sourcing" + "Software Architecture" → one skill about software design
- "Urban Sensing" + "Distributed Systems" → one skill about technical infrastructure
- Never map topics 1:1 to skills — that defeats the purpose

TAGGING RULES (critical):
- Reuse an existing tag when one fits
- Propose a new tag only when nothing in the existing vocabulary fits
- Keep tags short, reusable, and lower-friction across multiple skills

For each skill, write an action-oriented description of what the brain
can DO (not just what it knows). Use verbs: "Create...", "Analyze...",
"Design...", "Write about...".

Return 4-8 consolidated skills. Never return as many skills as there are knowledge domains. Each skill needs:
- name: broad capability (max 50 chars, NOT a topic title copy)
- description: one action-oriented sentence
- tags: 3-5 keywords spanning multiple topics
- examples: 2-3 concrete user prompts`;
}
