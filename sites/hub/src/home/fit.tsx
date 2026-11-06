import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { Chapter } from "./chapter";

/**
 * 05, what the hub writes down: the hub at the center of its terms (the
 * field's `fit` scene), with the organizations' Brains around it, its
 * members, Rizom B.V., and the Foundation's commons as a ring around
 * everything. The holders light one by one, or as the reader points at
 * them; then the split of every lab flows, in one line in the card.
 */
const holderIds = ["hub", "orgs", "members", "bv", "foundation"] as const;

const fitSchema = z.object({
  number: z.string(),
  label: z.string(),
  headline: z.string(),
  body: z.string(),
  holders: z
    .array(
      z.object({
        id: z.enum(holderIds),
        name: z.string(),
        holds: z.string(),
      }),
    )
    .length(5),
  money: z.object({
    lead: z.string(),
    delivery: z.string(),
    hub: z.string(),
    commons: z.string(),
  }),
  captions: z.object({
    hub: z.string(),
    organizations: z.string(),
    members: z.string(),
    membersCertified: z.string(),
    bv: z.string(),
    foundation: z.string(),
    foundationShort: z.string(),
  }),
});

function FitSection({
  number,
  label,
  headline,
  body,
  holders,
  money,
  captions,
}: z.infer<typeof fitSchema>): JSX.Element {
  return (
    <Chapter
      id="fit"
      scene="fit"
      number={number}
      label={label}
      headline={headline}
      length="3"
      captions={captions}
    >
      <p className="hub-text">{body}</p>
      <ul className="hub-holders">
        {holders.map((holder) => (
          <li key={holder.id}>
            <button
              type="button"
              className="hub-holder"
              data-hub-holder={holder.id}
            >
              <i
                className={`hub-holder__mark hub-holder__mark--${holder.id}`}
              />
              <b>{holder.name}</b>
              <span>{holder.holds}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="hub-money">
        {money.lead} <b className="hub-money__delivery">{money.delivery}</b> ·{" "}
        <b className="hub-money__hub">{money.hub}</b> ·{" "}
        <b className="hub-money__commons">{money.commons}</b>
      </p>
    </Chapter>
  );
}

export const fit: SectionDefinition = defineSection(fitSchema, FitSection, {
  title: "05 — What the hub writes down",
  description:
    "The hub's terms: the chapter's words, the five holders (the hub, organizations, members, Rizom B.V., the Foundation) with what each holds, the split of every lab in one line, and the drawing's captions.",
});

export const fitContent: JsonObject = {
  number: "05",
  label: "What the hub writes down",
  headline: "Institutions stand on *social contracts*.",
  body: "At a hub, organizations first learn to rely on each other. So the hub writes down what is held in common, what cannot be sold and how the returns flow back, the same in every hub.",
  holders: [
    {
      id: "hub",
      name: "The hub",
      holds:
        "Its space, its community, its focus, and its own Brain, held for its community.",
    },
    {
      id: "orgs",
      name: "Organizations",
      holds:
        "Their Brains and everything in them. They take them anywhere; no one can sell them.",
    },
    {
      id: "members",
      name: "Members",
      holds:
        "A practice: they certify, deliver labs and build on their own Brain.",
    },
    {
      id: "bv",
      name: "Rizom B.V.",
      holds:
        "Sets up the Brains, hosts them, and delivers labs until the hub's own people are certified.",
    },
    {
      id: "foundation",
      name: "Rizom Foundation",
      holds:
        "Holds the method, the platform and the mark as a commons that cannot be sold.",
    },
  ],
  money: {
    lead: "Every lab:",
    delivery: "60% to whoever delivers",
    hub: "15% to the hub",
    commons: "25% back to the commons",
  },
  captions: {
    hub: "The hub · its own Brain",
    organizations: "Organizations · their Brains",
    members: "Members",
    membersCertified: "Members · certified",
    bv: "Rizom B.V.",
    foundation: "Rizom Foundation · the commons: method, platform, mark",
    foundationShort: "Rizom Foundation · the commons",
  },
} satisfies z.input<typeof fitSchema>;
