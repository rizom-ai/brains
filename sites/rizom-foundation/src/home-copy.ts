import type { JsonObject } from "@rizom/site";

/**
 * The words the home starts with, chapter by chapter. The brain keeps each
 * as site-content/home/<chapter>.md once edited there; until then these stand.
 */
export const homeCopy: Record<string, JsonObject> = {
  hero: {
    eyebrow: "Rizom Foundation",
    headline: "The case for *collective intelligence.*",
    lede: "A world in which intelligence is collective. People and organizations hold what they know, and why, so nothing depends on one indispensable person or one platform.",
    body: [
      "Memory without a home settles wherever it is cheapest to keep: with a few indispensable people, or in a model owned by one company. The Foundation builds the commons that gives it a home instead, and tests every assumption behind it in public.",
    ],
    doors: [
      { label: "Read Common Sense →", href: "/common-sense" },
      { label: "Become a founding supporter", href: "#support" },
    ],
  },
  writing: {
    cap: "Members' writing",
    headline: "The Foundation chooses; *the author keeps it.*",
    intro:
      "A curated selection from the people in the network. Every article stays published on its author's own Brain, and this page points to it there.",
    items: [
      {
        kicker: "Yeehaa · New Institutions · 10 November 2026",
        title: "Scale Without a Center",
        text: "Middle powers cannot win a race to concentrate. But concentration may not be where technology is going. The next phase is local and distributed, and it rewards the places that are good at being in the middle.",
        href: "https://yeehaa.io/essays/scale-without-a-center",
      },
      {
        kicker: "Yeehaa · New Institutions · 9 October 2026",
        title: "Infrastructure, Not Platforms",
        text: "Much of what an institution remembers no longer lives inside it. Its archive, its coordination and now its agents run on platforms it does not govern. New institutions need infrastructure they can stand on, not platforms they have to live in.",
        href: "https://yeehaa.io/essays/infrastructure-not-platforms",
      },
      {
        kicker: "Yeehaa · New Institutions · 5 October 2026",
        title: "The Machine Finds The Cracks",
        text: "AI systems that work with institutional memory reveal more than the quality of an archive. Their failures show whether an institution can preserve reasons, mark status, locate authority, and carry context into action.",
        href: "https://yeehaa.io/essays/the-machine-finds-the-cracks",
      },
      {
        kicker: "Yeehaa · New Institutions · 17 May 2026",
        title: "Heroics Are Not Infrastructure",
        text: "When institutions can no longer carry their own authority, memory, and coordination, they begin to lean on exceptional people. What appears as leadership or dedication is often a sign that form itself has started to decay.",
        href: "https://yeehaa.io/essays/heroics-are-not-infrastructure",
      },
    ],
  },
  mission: {
    claim:
      "The Rizom Foundation works to *decenter AI,* moving intelligence back to the people and organizations it comes from.",
    body: [
      "It gives them memory of their own and connections that no one in the middle owns, so that what they know depends neither on one company's model nor on a few indispensable people. The Foundation researches and builds that infrastructure, technical and social, and holds it as a commons that cannot be sold.",
    ],
  },
  events: {
    cap: "Events",
    headline: "Roundtables, sessions *and public programs.*",
    intro:
      "Where the people around the work meet, and where anyone can see it running before deciding to support it.",
    items: [
      {
        kicker: "In person or online",
        title: "Sessions where the work is shown live",
        text: "For anyone deciding whether to support the work: see it running first, then decide.",
        href: null,
      },
      {
        kicker: "Partners, researchers, hubs and supporters",
        title: "Roundtables and dinners",
        text: "The people around the work, together. A sponsor can host a roundtable of its own.",
        href: null,
      },
      {
        kicker: "At a hub",
        title: "Public programs",
        text: "A first public program at a hub, whose memory its participants still use six months later.",
        href: null,
      },
    ],
  },
  support: {
    cap: "Founding supporters",
    headline: "Start the first year, *with no say attached.*",
    intro:
      "The Foundation takes no investors, so that its work stays open for good and belongs to no one. Its first year is started by founding supporters instead. We ask €50,000 in founding support, and any amount is welcome, from individuals and from organizations.",
    options: [
      {
        name: "As a gift",
        note: "once, or yearly for five years",
        text: "A person or an organization gives once or commits to a fixed amount each year for five years. For Dutch taxpayers the five-year form is fully deductible; the Foundation is applying for recognition as a public-benefit institution (ANBI).",
      },
      {
        name: "As a sponsor",
        note: "for organizations",
        text: "Everything founding supporters get, plus the sponsor's name on this site, in the code repository and at public programs, and seats at the roundtables. No say over the research, the code or the name.",
      },
    ],
    aside:
      "A pledge buys no stake and no vote. Founding supporters get a quarterly founders' letter, a pledge they can trace to the work it paid for, their name among the founders if they want it, and a place in the network.",
    pledge: {
      label: "Pledge as a founding supporter",
      href: "mailto:yeehaa@rizom.ai?subject=Founding%20pledge",
    },
    onward: { label: "Read: Become a founding supporter", href: "/support" },
  },
  why: {
    cap: "Why a foundation",
    headline:
      "Infrastructure people depend on should not belong to *whoever happens to sell it.*",
    body: [
      "The Foundation owns the code, the method and the Rizom name, and holds them as a commons that cannot be sold. Anyone can read the code, run it for free and leave with their memory. An independent board majority decides on the license and the name, and the Foundation takes no investors.",
    ],
    figures: [
      {
        figure: "15+",
        label: "Brains in use",
        text: "Each owned by whoever runs it.",
      },
      {
        figure: "5",
        label: "Run without the founder",
        text: "Of those, so far.",
      },
      {
        figure: "10,000+",
        label: "Changes to the code",
        text: "Every line public at [github.com/rizom-ai/brains](https://github.com/rizom-ai/brains).",
      },
    ],
  },
  board: {
    cap: "The board",
    headline:
      "The license and the name *are decided by an independent majority.*",
    members: [
      { name: "Jan Hein Hoogstad", role: "Chair · founder" },
      { name: "Annebeth Wilton", role: "Secretary · independent" },
      { name: "Hans Hoogstad", role: "Treasurer · independent" },
      { name: "Henk de Jong", role: "Member · independent" },
      { name: "Ohad Gilad", role: "Member · independent" },
    ],
  },
  follow: {
    cap: "Follow",
    headline: "Essays and research, *as they are published.*",
    links: [
      {
        label: "@rizom.foundation on ATProto",
        href: "https://bsky.app/profile/rizom.foundation",
      },
    ],
  },
};
