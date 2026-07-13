import type { RouteDefinitionInput } from "@rizom/site";

/**
 * The consolidated Rizom site routes. The home page composes the rev-5 section
 * set from the "home" content namespace; the layout owns navigation (the
 * two-tier faces strip), so routes stay out of the entity nav.
 */
export const aiRoutes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Rizom",
    description: "Build the agent that represents you",
    layout: "default",
    navigation: { show: false },
    sections: [
      { id: "hero", template: "home:hero" },
      { id: "growth", template: "home:growth" },
      { id: "problem", template: "home:problem" },
      { id: "mission", template: "home:mission" },
      { id: "faces", template: "home:faces" },
      { id: "alive", template: "home:alive" },
    ],
  },
  {
    // The product's own room: the platform story that used to run down the
    // homepage now lives here. Phase 1 carries the two pure-product sections
    // over unchanged (your-data, quickstart); the four-chapter product
    // narrative lands in a later phase.
    id: "brain",
    path: "/brain",
    title: "Rizom Brain",
    description: "Build the agent that represents you",
    layout: "default",
    navigation: { show: false },
    sections: [
      { id: "your-data", template: "brain:your-data" },
      { id: "quickstart", template: "brain:quickstart" },
    ],
  },
  {
    // Everything published, in one index — essays (post) + talks (deck),
    // rendered by the blog and decks plugins' own list templates. This custom
    // path stands alongside the auto-generated /essays and /talks indexes.
    id: "writing",
    path: "/writing",
    title: "Writing — Rizom",
    description: "Everything published, in one index",
    layout: "default",
    navigation: { show: false },
    sections: [
      {
        id: "essays",
        template: "blog:post-list",
        dataQuery: { entityType: "post", query: { limit: 100 } },
      },
      {
        id: "talks",
        template: "decks:deck-list",
        dataQuery: { entityType: "deck", query: { limit: 100 } },
      },
    ],
  },
  {
    // The Rizom agent directory, rendered by agent-discovery's list template.
    id: "network",
    path: "/network",
    title: "Network — Rizom",
    description: "The Rizom agent directory",
    layout: "default",
    navigation: { show: false },
    sections: [
      {
        id: "directory",
        template: "agent-discovery:agent-list",
        dataQuery: {
          entityType: "agent",
          query: { status: "approved", limit: 100 },
        },
      },
    ],
  },
  {
    id: "work",
    path: "/work",
    title: "Rizom Work",
    description: "Coordination for the AI era",
    layout: "default",
    navigation: { show: false },
    sections: [
      { id: "hero", template: "work:hero" },
      { id: "problem", template: "work:problem" },
      { id: "workshop", template: "work:workshop" },
      { id: "personas", template: "work:personas" },
      { id: "quotes", template: "work:quotes" },
      { id: "roster", template: "work:roster" },
      { id: "closer", template: "work:closer" },
    ],
  },
  {
    id: "foundation",
    path: "/foundation",
    title: "Rizom Foundation",
    description:
      "Essays, gatherings, and stewardship of open AI infrastructure",
    layout: "default",
    navigation: { show: false },
    sections: [
      { id: "hero", template: "foundation:hero" },
      { id: "research", template: "foundation:research" },
      { id: "pullquote", template: "foundation:pullquote" },
      { id: "chapters", template: "foundation:chapters" },
      { id: "support", template: "foundation:support" },
      { id: "follow", template: "foundation:follow" },
    ],
  },
];
