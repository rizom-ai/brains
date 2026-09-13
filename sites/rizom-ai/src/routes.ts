import type { RouteDefinitionInput } from "@rizom/site";

/**
 * The consolidated Rizom site routes. The home page composes the living-memory
 * content namespace; the layout owns navigation (the
 * two-tier faces strip), so routes stay out of the entity nav.
 */
export const aiRoutes: RouteDefinitionInput[] = [
  {
    // The Living Memory position, told with the site's own chrome and its two
    // live maps. The hero is the proximity map — the network as it actually
    // stands, not a drawing of one — carrying this page's copy through the
    // content overlay. After the system and its brain → practice → network
    // sequence, the knowledge map provides working proof from this brain's
    // live memory. Copy for every section belongs to the separate content repo
    // under site-content/living-memory/. Keep that content identity stable;
    // this is the homepage, with no duplicate route or redirect.
    id: "living-memory",
    path: "/",
    title: "Rizom",
    description:
      "Living memory for hybrid human–AI teams — memory that works, from one team to an economy",
    layout: "default",
    navigation: { show: false },
    sections: [
      {
        id: "hero",
        template: "agent-discovery:proximity-map",
        dataQuery: {},
      },
      { id: "problem", template: "living-memory:problem" },
      { id: "science", template: "living-memory:science" },
      { id: "turn", template: "living-memory:turn" },
      { id: "system", template: "living-memory:system" },
      { id: "growth", template: "living-memory:growth" },
      { id: "proof", template: "topics:knowledge-map", dataQuery: {} },
      { id: "arc", template: "living-memory:arc" },
      { id: "doors", template: "living-memory:doors" },
    ],
  },
  {
    // Product landing page. Preserve durable section IDs while changing the
    // composition; /ask integration is separate and the hero is a placeholder.
    id: "brain",
    path: "/brain",
    title: "Rizom Brain",
    description: "Build the agent that represents you",
    layout: "default",
    navigation: { show: false },
    sections: [
      { id: "hero", template: "brain:hero" },
      { id: "capture", template: "brain:capture" },
      { id: "ask", template: "brain:ask" },
      { id: "connect", template: "brain-network:connect", dataQuery: {} },
      { id: "run", template: "brain:run" },
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
