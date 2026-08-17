import type { BundleConfigContribution } from "@brains/app";

/**
 * Content a vouched-for collaborator may capture and revise, but not remove or
 * republish. The platform baseline is `"*": admin`, so every such type has to
 * be granted explicitly — a type left unlisted is Admin-only no matter which
 * tool offers it.
 */
export const trustedContentEntityActions = {
  create: "trusted",
  update: "trusted",
  delete: "admin",
  extract: "admin",
  publish: "admin",
} as const;

export const publishingBundleConfig: BundleConfigContribution[] = [
  {
    member: "content-pipeline",
    value: {
      generationSchedules: {
        newsletter: "0 9 * * 1",
        "social-post": "0 10 * * *",
      },
      generationConditions: {
        newsletter: {
          skipIfDraftExists: true,
          minSourceEntities: 1,
          sourceEntityType: "post",
        },
        "social-post": {
          skipIfDraftExists: true,
          maxUnpublishedDrafts: 5,
        },
      },
    },
  },
  {
    member: "newsletter",
    value: { doubleOptIn: true },
  },
];

export const publishingAgentInstructions: string[] = [
  `Use the installed publishing capabilities for professional website content, essays, projects, decks, newsletters, and social distribution workflows. Treat publishing requests as production and distribution work rather than generic shared-memory capture.`,
  `When answering questions like "what have I written about X" or "which posts relate to this deck/source", search first and use semantic search results as candidates, not proof. Summarize only clearly relevant entities whose title or content directly matches the asked topic or has substantial overlap with the source's main themes; omit weak/tangential candidates rather than presenting them as definite matches. A match based on only an isolated shared term or pattern is not enough; when one candidate is clearly stronger than the rest, list only the strongest clear match and say the others were tangential rather than naming them as matches.`,
  `Draft blog posts are only post entities with status draft. If the user asks whether draft blog posts exist, call only system_list for entityType post with status draft; do not also list social-post, newsletter, deck, or other draft entity types. After telling the user there are no draft blog posts, treat follow-ups like "make one draft" or "make one a draft" as requests to change an existing published post back to draft: ask which existing published post they want changed; do not offer to create a brand-new post and do not call system_generate to create a fresh draft from that ambiguous follow-up.`,
];

export const teamBundleConfig: BundleConfigContribution[] = [
  {
    member: "topics",
    value: { extractableStatuses: ["published", "draft"] },
  },
  {
    member: "conversation-memory",
    value: { memoryVisibility: "shared" },
  },
];

export const teamAgentInstructions: string[] = [
  `This is a collaborative team-memory and synthesis posture. Optimize for capturing shared context, finding what the team already knows, summarizing cross-source evidence with attribution, and coordinating with peer brains.`,
  `Do not default to personal publishing, personal branding, blog, newsletter, social-media, portfolio, or marketing workflows unless the installed capabilities and the user's request explicitly support them.`,
];
