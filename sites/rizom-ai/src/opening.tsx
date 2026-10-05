/** @jsxImportSource react */
import type { JSX } from "react";
import {
  proximityMapCopySchema,
  proximityMapDataSchema,
} from "@brains/agent-discovery/proximity-map";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { ASK_DRAWING_ATTRIBUTE, ASK_MARK_ATTRIBUTE } from "@brains/contracts";
import { createTemplate, type Template } from "@brains/templates";
import { z } from "@rizom/site";
import { placeNetwork, type PlacedBrain } from "./story/network";

/**
 * The homepage's opening: the authored words over Rizom's live network, with
 * the guest Ask box docked when Web Chat serves it. The map comes from the
 * agent-discovery datasource through the site's own (see ./opening-datasource);
 * the words are the hero's authored copy, spliced over the data by the
 * content overlay, so the section keeps its content identity.
 */

export const openingSchema: z.ZodObject<
  (typeof proximityMapDataSchema)["shape"] & {
    topics: z.ZodDefault<z.ZodArray<z.ZodString>>;
    askBox: z.ZodDefault<z.ZodBoolean>;
    prompt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  }
> = proximityMapDataSchema.extend({
  /** The drafted questions, which fill the box's field. */
  topics: z.array(z.string()).default([]),
  /** Web Chat serves the guest box here: dock it. */
  askBox: z.boolean().default(false),
  /** The shared Ask note's title, prompting in the box's field. */
  prompt: z.string().nullable().default(null),
});
export type OpeningData = z.output<typeof openingSchema>;

const DEFAULT_COPY = {
  headingLead: "Distributed Living Memory",
  lede: "For hybrid human–AI teams: memory kept in brains each team owns, connected from one team to an economy.",
};

/** The pulse takes 4.55s to reach the outer ring; a brain replies when it arrives. */
const PULSE_TRAVEL = 4.55;
const replyDelay = (reach: number, after = 0): string =>
  `${(reach * PULSE_TRAVEL + after).toFixed(2)}s`;

export function NetworkLayer({
  brains,
  kin,
  lendable = false,
}: ReturnType<typeof placeNetwork> & {
  /** The Ask room lends this drawing to a phone's open conversation (the opening's; a chapter's stays put). */
  lendable?: boolean;
}): JSX.Element | null {
  if (brains.length === 0) return null;
  const byId = new Map(brains.map((brain) => [brain.id, brain]));
  return (
    <div
      className="net-layer"
      aria-hidden="true"
      {...(lendable ? { [ASK_DRAWING_ATTRIBUTE]: "" } : {})}
    >
      <svg className="net-svg" viewBox="0 0 100 100">
        {[14.7, 29.3, 44].map((r) => (
          <circle key={r} className="net-ring" cx="50" cy="50" r={r} />
        ))}
        {kin.map((link) => {
          const from = byId.get(link.from);
          const to = byId.get(link.to);
          return from && to ? (
            <line
              key={`${link.from}-${link.to}`}
              className="net-kin"
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          ) : null;
        })}
        {brains.map((brain) => (
          <line
            key={`thread-${brain.id}`}
            className="net-thread"
            data-brain={brain.id}
            x1="50"
            y1="50"
            x2={brain.x}
            y2={brain.y}
          />
        ))}
        <circle className="net-pulse" cx="50" cy="50" r="46" />
        {brains.map((brain) => (
          <g
            key={`reply-${brain.id}`}
            className="net-reply"
            data-brain={brain.id}
          >
            <circle
              className="net-echo"
              cx={brain.x}
              cy={brain.y}
              r="4"
              style={{
                transformOrigin: `${brain.x}px ${brain.y}px`,
                animationDelay: replyDelay(brain.reach),
              }}
            />
            <line
              className="net-spark"
              pathLength={1}
              x1="50"
              y1="50"
              x2={brain.x}
              y2={brain.y}
              style={{ animationDelay: replyDelay(brain.reach, 0.25) }}
            />
          </g>
        ))}
        <circle className="net-corona" cx="50" cy="50" r="5.5" />
        <circle
          className="net-corona net-corona--outer"
          cx="50"
          cy="50"
          r="8.5"
        />
        <circle className="net-lantern" cx="50" cy="50" r="2.2" />
      </svg>
      <ul className="net-marks">
        {brains.map((brain) => (
          <li
            key={brain.id}
            className="net-mark"
            data-brain={brain.id}
            {...{ [ASK_MARK_ATTRIBUTE]: brain.id }}
            style={{ left: `${brain.x}%`, top: `${brain.y}%` }}
          >
            <a href={`/agents/${brain.id}`} aria-label={brain.name}>
              <i style={{ animationDelay: replyDelay(brain.reach) }} />
            </a>
          </li>
        ))}
      </ul>
      <ol className="net-names">
        {brains.map((brain: PlacedBrain) => (
          <li
            key={brain.id}
            className={`net-name net-name--${brain.side}`}
            data-brain={brain.id}
            style={{ left: `${brain.x}%`, top: `${brain.y}%` }}
          >
            {brain.name}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function Opening(data: OpeningData): JSX.Element {
  const headingLead = data.headingLead ?? DEFAULT_COPY.headingLead;
  const lede = data.lede ?? DEFAULT_COPY.lede;
  return (
    // The story opens on the authored words over the live network, with the
    // door to the practice; the drawing stands in the opening and leaves with
    // it. The Ask room (the box beside this network, lit by an answer) is its
    // own page, /ask (see ./ask-room).
    <section id="hero" className="chapter chapter--opening" data-title="Top">
      {data.kicker && <p className="eyebrow">{data.kicker}</p>}
      <h1>
        {headingLead}
        {data.headingAccent && (
          <>
            {" "}
            <em>{data.headingAccent}</em>
          </>
        )}
      </h1>
      <p className="lede">{lede}</p>
      {data.ctaHref && data.ctaLabel && (
        <a className="opening__door" href={data.ctaHref}>
          {data.ctaLabel}
        </a>
      )}
      <NetworkLayer {...placeNetwork(data)} />
    </section>
  );
}

// The hero's authored copy, edited as an ordinary markdown section and spliced
// over the live data by the content overlay. The same fields as before, so the
// section's content file is unchanged.
const openingCopyFormatter = new StructuredContentFormatter(
  proximityMapCopySchema,
  {
    title: "Network",
    mappings: [
      { key: "headingLevel", label: "Heading Level", type: "string" },
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "headingLead", label: "Heading Lead", type: "string" },
      { key: "headingAccent", label: "Heading Accent", type: "string" },
      { key: "lede", label: "Lede", type: "string" },
      { key: "ctaLabel", label: "Cta Label", type: "string" },
      { key: "ctaHref", label: "Cta Href", type: "string" },
    ],
  },
);

export const openingTemplate: Template = createTemplate({
  name: "opening",
  description:
    "The homepage opening: the authored words over the live network, with the door",
  schema: openingSchema,
  dataSourceId: "rizom:opening",
  overlayFormatter: openingCopyFormatter,
  requiredPermission: "public",
  layout: { component: Opening },
});
