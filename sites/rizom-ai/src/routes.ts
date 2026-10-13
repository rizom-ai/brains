import type { RouteDefinitionInput } from "@rizom/site";

/**
 * The consolidated Rizom site routes. The home page composes the living-memory
 * content namespace; the layout owns navigation (the one bar), so routes stay out of the entity nav.
 */
export const aiRoutes: RouteDefinitionInput[] = [
  {
    // The homepage, told as a story: the opening is the live network under the
    // authored words with the Ask box, then the science, the shift, the
    // organism, where this goes, what was asked before and the two ways in. The problem, the system
    // and the proof are told on /work, /brain and by the opening itself. Copy
    // for every section belongs to the separate content repo under
    // site-content/living-memory/; keep that content identity stable.
    id: "living-memory",
    path: "/",
    title: "Rizom",
    description:
      "Distributed living memory for hybrid human–AI teams: brains each team owns, connected from one team to an economy.",
    layout: "default",
    navigation: { show: false },
    sections: [
      { id: "hero", template: "rizom:opening", dataQuery: {} },
      { id: "science", template: "living-memory:science" },
      { id: "turn", template: "living-memory:turn" },
      { id: "growth", template: "living-memory:growth" },
      { id: "arc", template: "living-memory:arc" },
      { id: "doors", template: "living-memory:doors" },
    ],
  },
  {
    // The Brain room, told as a story beside its drawing. The section ids
    // are content identity; the order follows the drawing's stages.
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
      { id: "run", template: "brain:run" },
      { id: "connect", template: "brain:connect" },
      { id: "your-data", template: "brain:your-data" },
      { id: "quickstart", template: "brain:quickstart" },
    ],
  },
  {
    // The Ask room: the guest box beside the live network, and what
    // visitors asked before, answered and kept by the owner, read live from
    // the published FAQs (see ./ask-room, ./asked-datasource).
    id: "public-ask",
    path: "/ask",
    title: "Ask the network",
    description: "Ask a question of Rizom's public Brain knowledge",
    layout: "default",
    navigation: { show: false },
    sections: [
      { id: "ask", template: "rizom:ask-room", dataQuery: {} },
      { id: "asked", template: "rizom:asked", dataQuery: {} },
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
    // The archive: essays and presentations on one thread, newest first.
    sections: [{ id: "archive", template: "rizom:writing", dataQuery: {} }],
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
