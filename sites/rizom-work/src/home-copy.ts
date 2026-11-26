import type { JsonObject } from "@rizom/site";

const HUB_TOPIC =
  "/contact?topic=A%20Brain%20for%20a%20hub.%20Which%20hub%2C%20and%20how%20many%20members%3A";
const TEAM_TOPIC =
  "/contact?topic=A%20team%20Brain.%20Team%20size%2C%20and%20what%20you'd%20like%20mapped%3A";

/**
 * The words the home starts with, chapter by chapter. The brain keeps each
 * as site-content/home/<chapter>.md once edited there; until then these stand.
 */
export const homeCopy: Record<string, JsonObject> = {
  hero: {
    eyebrow: "Rizom Work",
    headline: "Heroics are not *infrastructure.*",
    lede: "Most organizations run on what a few people know. It sits in their heads, their inboxes and their habits, and it leaks every time a project closes, a team changes or someone leaves.",
    doors: [
      { label: "For hubs →", href: "#hubs" },
      { label: "For teams and organizations", href: "#teams" },
      {
        label: "The essay behind it",
        href: "https://yeehaa.io/essays/heroics-are-not-infrastructure",
      },
    ],
  },
  science: {
    cap: "The science",
    headline: "A team's intelligence is *not the sum* of its members' talent.",
    body: [
      "Organizational psychology has one finding it keeps replicating. Intelligence lives in the team's *transactive memory system* — the shared, mostly invisible map of who knows what, whose judgment settles which questions, and how knowledge moves. Strong-memory teams outperform equally talented ones, and the gap is structural rather than personal.",
    ],
    dimensions: [
      {
        name: "Specialization",
        text: "Who knows what, and who is the only one who knows it — the expertise that leaves when they do.",
      },
      {
        name: "Credibility",
        text: "Which questions end with which person, without anyone calling a meeting.",
      },
      {
        name: "Coordination",
        text: "What reaches the right person before they have to think to ask for it.",
      },
    ],
  },
  problem: {
    cap: "Why now",
    headline: "The first thing AI runs into is *everything nobody wrote down.*",
    body: [
      "An agent cannot ask the colleague who has always known how a decision gets made, so the knowledge that used to live in a few people's heads becomes the bottleneck the moment work is handed to software. AI makes that visible faster than any reorganization did.",
    ],
  },
  hubs: {
    cap: "For hubs",
    headline: "A Brain for the hub, and one for *every member who wants it.*",
    intro:
      "Hubs lose most of what passes through them. A program ends and its lessons leave with the cohort, staff move on with the introductions that worked, and the evidence a funder asks for has to be written up afterwards.",
    steps: [
      {
        title: "A sponsor and a Brain for the hub.",
        text: "The hub itself, a network of hubs or a funder pays for the hub's Brain, seeded from what the hub already keeps: its programs, its members and the introductions that worked.",
      },
      {
        title: "Members use it from the first week.",
        text: "They ask it who knows what and tell it what happened, in the chat they already use, so the hub's memory grows without anyone writing a report.",
      },
      {
        title: "Members take a Brain of their own.",
        text: "A professional Brain for an independent, a team Brain for a startup or company in the hub: their memory, their site and an agent that works for them, theirs wherever they go next.",
      },
      {
        title: "Work routed through the network.",
        text: "Service partners offer their work to members through the network: 25% to the commons, a share to the hub that brought the work in, the rest to whoever delivers.",
      },
    ],
    cta: { label: "Talk to us about a hub", href: HUB_TOPIC },
  },
  teams: {
    cap: "For teams and organizations",
    headline: "Every team Brain starts *with a setup.*",
    intro:
      "A team Brain holds what the organization knows, why it decided what it did and whom to ask, and keeps that knowledge when people move on.",
    steps: [
      {
        title: "A setup at a fixed price.",
        text: "The first weeks map where the organization's knowledge sits, who knows what and where it leaks, and seed the Brain with what that turns up.",
      },
      {
        title: "Then the organization chooses.",
        text: "Continue on a monthly fee for hosting and upkeep, run the Brain itself, or stop and keep what the setup produced.",
      },
    ],
    cta: { label: "Talk to us about a team Brain", href: TEAM_TOPIC },
  },
  public: {
    cap: "Public bodies",
    headline:
      "Resilience is whether the work carries on *when the people who know are gone.*",
    body: [
      "A body that depends on a few indispensable people, or on one vendor's platform, is fragile. A team Brain it owns, runs on a small open model and can move elsewhere removes both dependencies.",
    ],
    aside:
      "Public innovation programs put a government body forward as launching customer for a challenge it has set.",
  },
  partners: {
    cap: "Partners",
    headline: "Work through a partner, *or become one.*",
    kinds: [
      {
        name: "Advisers",
        text: "Consultancies and grant advisers bring their clients in and stay involved in the setup. A setup can often be funded from the subsidies they apply for.",
      },
      {
        name: "Certified partners",
        text: "Practitioners certified by the Foundation deliver setups on the standard split: a share to whoever brought the organization in, a share to whoever does the work, and 25% to the commons.",
      },
    ],
  },
  contact: {
    headline: "Start with what your hub or team *already knows.*",
    doors: [
      { label: "Talk to us about a hub →", href: HUB_TOPIC },
      { label: "Talk to us about a team Brain", href: TEAM_TOPIC },
      {
        label: "Events, at the Foundation",
        href: "https://rizom.foundation/#events",
      },
    ],
  },
};
