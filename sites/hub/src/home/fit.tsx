import type { JSX } from "react";
import {
  defineSection,
  z,
  type JsonObject,
  type SectionDefinition,
} from "@rizom/site";
import { Chapter } from "./chapter";

/**
 * 05, how it fits into Rizom: the hub, the organizations and the members
 * above Rizom B.V. and the Foundation's roots (the field's `fit` scene).
 * The holders light one by one, or as the reader points at them; then the
 * split of every lab flows, delivery moving from Rizom B.V. to the hub's
 * certified people.
 */
const holderIds = ["orgs", "hub", "members", "bv", "foundation"] as const;

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
  split: z.object({
    deliveryBefore: z.string(),
    deliveryAfter: z.string(),
    hub: z.string(),
    commons: z.string(),
  }),
  captions: z.object({
    hub: z.string(),
    organizations: z.string(),
    members: z.string(),
    membersCertified: z.string(),
    bv: z.string(),
    bvShort: z.string(),
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
  split,
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
      <div className="hub-split" aria-hidden="true">
        <div />
        <div />
        <div />
      </div>
      <p className="hub-split__legend">
        <span
          data-hub-split-delivery=""
          data-before={split.deliveryBefore}
          data-after={split.deliveryAfter}
        >
          {split.deliveryBefore}
        </span>
        <span>{split.hub}</span>
        <span>{split.commons}</span>
      </p>
    </Chapter>
  );
}

export const fit: SectionDefinition = defineSection(fitSchema, FitSection, {
  title: "05 — How it fits into Rizom",
  description:
    "Who holds what: the chapter's words, the five holders (organizations, the hub, members, Rizom B.V., the Foundation) with what each holds, the split's labels (delivery before and after the hub's people certify) and the drawing's captions.",
});

export const fitContent: JsonObject = {
  number: "05",
  label: "How it fits into Rizom",
  headline: "Each holds what it *should*.",
  body: "There is no platform in the middle. The terms are written down, and the same in every hub.",
  holders: [
    {
      id: "orgs",
      name: "Organizations",
      holds:
        "Their Brains and everything in them. They take them anywhere; no one can sell them.",
    },
    {
      id: "hub",
      name: "The hub",
      holds:
        "The space, the community, the focus, and its own Brain, held for its community.",
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
  split: {
    deliveryBefore: "60% delivery · Rizom B.V.",
    deliveryAfter: "60% delivery · the hub's certified people",
    hub: "15% hub",
    commons: "25% commons",
  },
  captions: {
    hub: "The hub",
    organizations: "Organizations",
    members: "Members",
    membersCertified: "Members · certified",
    bv: "Rizom B.V. · setup, hosting, delivery",
    bvShort: "Rizom B.V.",
    foundation: "Rizom Foundation · the commons: method, platform, mark",
    foundationShort: "Rizom Foundation · the commons",
  },
} satisfies z.input<typeof fitSchema>;
