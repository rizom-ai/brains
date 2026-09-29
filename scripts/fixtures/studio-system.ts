import type { z } from "@brains/utils/zod";
import { styleGuideFrontmatterSchema } from "@brains/contracts";
import { siteInfoBodySchema } from "@brains/site-composition";
import {
  anchorProfileBodySchema,
  brainCharacterBodySchema,
} from "@brains/plugins";
import { agentFrontmatterSchema } from "../../entities/agent-discovery/src/schemas/agent";
import { skillFrontmatterSchema } from "../../entities/agent-discovery/src/schemas/skill";
import { promptFrontmatterSchema } from "../../entities/prompt/src/schemas/prompt";
import { swotFrontmatterSchema } from "../../entities/assessment/src/schemas/swot";
import { playbookFrontmatterSchema } from "../../plugins/playbooks/src/entity/schemas/playbook";
import { zodFieldToStudioWidget } from "../../plugins/studio/src/config";
import type { FieldDescriptor } from "../../plugins/studio/ui-react/src/api";

interface SystemFixture {
  entityType: string;
  label: string;
  isSingleton: boolean;
  hasBody: boolean;
  readOnly: boolean;
  fields: FieldDescriptor[];
  entity: {
    id: string;
    entityType: string;
    frontmatter: Record<string, unknown>;
    body: string;
    contentHash: string;
    created: string;
    updated: string;
  };
}
function fixture(
  entityType: string,
  label: string,
  schema: z.ZodObject,
  values: Record<string, unknown>,
  body: string,
  options: { singleton?: boolean; body?: boolean; readOnly?: boolean } = {},
): SystemFixture {
  return {
    entityType,
    label,
    isSingleton: options.singleton ?? false,
    hasBody: options.body ?? true,
    readOnly: options.readOnly ?? false,
    fields: Object.entries(schema.shape).map(([name, field]) =>
      zodFieldToStudioWidget(name, field),
    ),
    entity: {
      id: entityType,
      entityType,
      frontmatter: schema.parse(values),
      body,
      contentHash: "system-fixture-hash",
      created: "2026-06-18T09:00:00.000Z",
      updated: "2026-07-10T10:32:00.000Z",
    },
  };
}
// These records use production schemas. Mockup example fields are not contracts.
export const systemFixtures: Map<string, SystemFixture> = new Map(
  [
    fixture(
      "anchor-profile",
      "Anchor Profiles",
      anchorProfileBodySchema,
      {
        name: "Rover Collective",
        organization: "Rizom",
        description:
          "A collective exploring knowledge, agency and the systems between them.",
        website: "https://example.org",
        email: "hello@example.org",
        socialLinks: [
          {
            platform: "github",
            url: "https://github.com/example",
            label: "Our work",
          },
        ],
      },
      "# Where we started\n\nWe began with a shared question: how can knowledge stay useful as it moves between people?\n\nOur work brings research, tools and practical experience together.",
      { singleton: true },
    ),
    fixture(
      "brain-character",
      "Brain Characters",
      brainCharacterBodySchema,
      {
        name: "Rover",
        role: "Research collaborator",
        purpose:
          "Help the collective turn scattered knowledge into clear, useful next steps.",
        values: ["Clarity", "Care", "Intellectual honesty"],
      },
      "",
      { singleton: true, body: false },
    ),
    fixture(
      "style-guide",
      "Style Guides",
      styleGuideFrontmatterSchema,
      {
        name: "Rover Collective voice",
        messaging: {
          positioning: "Useful knowledge, held in common.",
          audiences: ["Independent researchers", "Small creative teams"],
        },
        voice: {
          summary:
            "Warm, precise and candid. Prefer useful language over performance.",
          traits: ["Clear", "Generous", "Grounded"],
          preferredTerms: ["Research", "Practice"],
          avoid: ["Jargon"],
        },
        visual: {
          artDirection: "Editorial clarity with a human hand",
          composition: "Space to think; structure to follow",
          preferred: ["Natural light", "Quiet detail"],
        },
      },
      "# A working voice\n\nWrite as a capable collaborator: direct enough to act on, generous enough to understand.\n\n> The interface should feel authored, but never compete with the work.\n\nUse structure to make complex systems legible.\n\n[Writing reference](https://example.org/reference).",
      { singleton: true },
    ),
    fixture(
      "prompt",
      "Prompts",
      promptFrontmatterSchema,
      { title: "Research synthesis", target: "research" },
      "# Research synthesis\n\nTurn the supplied material into a concise, evidence-led brief.\n\n## Approach\n\n1. Identify the central question.\n2. Separate evidence from interpretation.\n3. Name uncertainties and useful next steps.",
    ),
    fixture(
      "skill",
      "Skills",
      skillFrontmatterSchema,
      {
        name: "Research synthesis",
        description: "Synthesize supplied research into a useful brief.",
        tags: ["research", "synthesis"],
        examples: ["Summarize these field notes."],
      },
      "",
    ),
    fixture(
      "playbook",
      "Playbooks",
      playbookFrontmatterSchema,
      {
        title: "A thoughtful introduction",
        description: "Prepare and review an introduction before sharing it.",
        status: "active",
        audience: "admin",
      },
      "# A thoughtful introduction\n\n## Purpose\n\nConnect people around a shared question.\n\n## Steps\n\n1. Understand the context.\n2. Draft an introduction.\n3. Ask for approval before sending.",
    ),
    fixture(
      "swot",
      "SWOT analyses",
      swotFrontmatterSchema,
      {
        strengths: [
          {
            title: "Shared knowledge",
            detail: "Strong connections between disciplines.",
          },
        ],
        weaknesses: [],
        opportunities: [{ title: "New collaborators" }],
        threats: [],
        derivedAt: "2026-07-10T10:32:00.000Z",
      },
      "# Strategic context\n\nFocus on opportunities that build on the collective's existing strengths.\n\nReview assumptions with the people closest to the work.",
    ),
    fixture(
      "agent",
      "Agents",
      agentFrontmatterSchema,
      {
        name: "Fieldwork Collective",
        kind: "organization",
        organization: "Fieldwork",
        brainName: "Fieldwork Brain",
        url: "https://example.org",
        status: "approved",
        discoveredAt: "2026-07-10T10:32:00.000Z",
      },
      "# Fieldwork Collective\n\nA research partner working at the intersection of communities and technology.\n\n## Capabilities\n\n- Research synthesis\n- Community mapping\n- Thoughtful introductions",
      { readOnly: true },
    ),
    fixture(
      "site-info",
      "Site Info",
      siteInfoBodySchema,
      {
        title: "Rover Collective",
        description: "Notes, research and connections from the collective.",
      },
      "",
      { singleton: true, body: false },
    ),
  ].map((item) => [item.entityType, item]),
);
