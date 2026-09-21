export interface SystemEditorCopy {
  title?: string;
  intro: string;
  fieldsTitle: string;
  bodyTitle: string;
  bodyDescription: string;
}

const profiles: Record<string, SystemEditorCopy> = {
  "grouping-vocabulary": {
    title: "Groupings",
    intro:
      "Define the values editors can choose, and whether each entry may carry one or several. Lists apply to future saves; existing content is never rewritten.",
    fieldsTitle: "Access",
    bodyTitle: "Written content",
    bodyDescription: "",
  },
  "anchor-profile": {
    intro:
      "Who this Brain represents. Profile details and the longer story belong to the same record.",
    fieldsTitle: "Profile details",
    bodyTitle: "Story",
    bodyDescription:
      "Longer background, kept as Markdown alongside the structured profile.",
  },
  "brain-character": {
    intro:
      "The Brain’s name, role, purpose, and values. Everything is in this form.",
    fieldsTitle: "Character",
    bodyTitle: "Written content",
    bodyDescription: "Additional content supported by this record.",
  },
  "style-guide": {
    intro:
      "Shared direction for writing and visual work. Detailed guidance remains part of the same record.",
    fieldsTitle: "Style details",
    bodyTitle: "Guidance",
    bodyDescription:
      "Examples, exceptions, and longer instructions. Structured direction stays above.",
  },
  "site-info": {
    intro: "Shared site details. Update the existing settings in one place.",
    fieldsTitle: "Site details",
    bodyTitle: "Written content",
    bodyDescription: "Additional content supported by this record.",
  },
  prompt: {
    intro: "Reusable instructions that guide the Brain in specific contexts.",
    fieldsTitle: "Properties",
    bodyTitle: "Instructions",
    bodyDescription: "Instructions, examples, and constraints for this prompt.",
  },
  skill: {
    intro: "Capabilities advertised by the Brain and its collaborators.",
    fieldsTitle: "Properties",
    bodyTitle: "Capability notes",
    bodyDescription: "Additional details recorded for this capability.",
  },
  playbook: {
    intro: "Operational instructions, kept together as a document.",
    fieldsTitle: "Properties",
    bodyTitle: "Procedure",
    bodyDescription: "Steps and guidance for a repeatable process.",
  },
  swot: {
    intro:
      "Strengths, weaknesses, opportunities, and threats that inform your next steps.",
    fieldsTitle: "Properties",
    bodyTitle: "Analysis",
    bodyDescription: "Context, evidence, and implications of this assessment.",
  },
  agent: {
    intro: "A connected agent’s identity, relationship, and capabilities.",
    fieldsTitle: "Agent details",
    bodyTitle: "Profile and capabilities",
    bodyDescription:
      "The description and capabilities recorded for this agent.",
  },
};
const aliases: Record<string, string> = {
  prompts: "prompt",
  skills: "skill",
  playbooks: "playbook",
  swots: "swot",
  agents: "agent",
  siteInfo: "site-info",
  settings: "site-info",
  profile: "site-info",
};

/** Copy and layout hints only; schemas, supported bodies and access remain authoritative. */
export function systemEditorCopy(
  entityType: string,
): SystemEditorCopy | undefined {
  const key =
    (Object.hasOwn(aliases, entityType) ? aliases[entityType] : undefined) ??
    entityType;
  return Object.hasOwn(profiles, key) ? profiles[key] : undefined;
}
