/** @jsxImportSource react */
import { Fragment, type CSSProperties, type JSX } from "react";
import {
  proximityMapCopySchema,
  proximityMapDataSchema,
} from "@brains/agent-discovery/proximity-map";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { ASK_DRAWING_ATTRIBUTE, ASK_MARK_ATTRIBUTE } from "@brains/contracts";
import { createTemplate, type Template } from "@brains/templates";
import { z } from "@rizom/site";
import type { placeNetwork, PlacedBrain } from "./story/network";

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

/** Custom properties as an inline style: the sky's clocks, read by the stylesheet's animations. */
function clocks(vars: Record<`--net-${string}`, string>): CSSProperties {
  const style: CSSProperties = {};
  for (const [name, value] of Object.entries(vars))
    Reflect.set(style, name, value);
  return style;
}

/** Rizom's embers: slow lights circling the lantern. */
const EMBERS = Array.from({ length: 7 }, (_, i) => {
  const radians = (i * 51.4 * Math.PI) / 180;
  const radius = 4.6 + (i % 3) * 1.1;
  return {
    cx: (50 + radius * Math.cos(radians)).toFixed(2),
    cy: (50 - radius * Math.sin(radians)).toFixed(2),
    r: (0.28 + (i % 2) * 0.12).toFixed(2),
    phase: `${+(-i * 0.7).toFixed(1)}s`,
  };
});

/**
 * The live network as a night sky (docs/plans/rizom-ask-network.md). The sky
 * holds the drawing, the marks and the names, so they drift as one. In the
 * drawing: the boundary's purple, Rizom's wash, the dust of the brains not yet
 * in reach, the tendrils (a trunk with its seep, then a branch per brain that
 * the story runtime lights as the brain's thread), kin, a layered light per
 * brain (an ember rim, a halo sized by nearness, a ripple, a bead that
 * travels its route from Rizom), Rizom's corona, embers and lantern, and
 * grain fading toward the edge. The mark is the brain's core, its hit target
 * and the Ask room's lead anchor; its kind is its shape.
 */
export function NetworkLayer({
  brains,
  kin,
  tendrils,
  dust,
  lendable = false,
}: ReturnType<typeof placeNetwork> & {
  /** The Ask room lends this drawing to a phone's open conversation (the opening's; a chapter's stays put). */
  lendable?: boolean;
}): JSX.Element | null {
  if (brains.length === 0) return null;
  const byId = new Map(brains.map((brain) => [brain.id, brain]));
  const routes = new Map(
    tendrils.flatMap((tendril) =>
      tendril.branches.map((branch) => [branch.id, branch.route] as const),
    ),
  );
  return (
    <div
      className="net-layer"
      aria-hidden="true"
      {...(lendable ? { [ASK_DRAWING_ATTRIBUTE]: "" } : {})}
    >
      <div className="net-sky">
        <svg className="net-svg" viewBox="0 0 100 100">
          <defs>
            <radialGradient id="net-boundary" cx="0.47" cy="0.53">
              <stop
                offset="0.5"
                stopColor="var(--net-violet)"
                stopOpacity="0"
              />
              <stop
                offset="0.78"
                stopColor="var(--net-violet)"
                stopOpacity="0.085"
              />
              <stop
                offset="0.9"
                stopColor="var(--net-violet-deep)"
                stopOpacity="0.05"
              />
              <stop
                offset="1"
                stopColor="var(--net-violet-deep)"
                stopOpacity="0"
              />
            </radialGradient>
            <radialGradient id="net-wash">
              <stop
                offset="0"
                stopColor="var(--color-accent)"
                stopOpacity="0.16"
              />
              <stop
                offset="0.5"
                stopColor="var(--net-ember)"
                stopOpacity="0.045"
              />
              <stop offset="1" stopColor="var(--net-ember)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="net-corona">
              <stop offset="0" stopColor="var(--net-glow)" stopOpacity="0.55" />
              <stop
                offset="0.25"
                stopColor="var(--color-accent-bright)"
                stopOpacity="0.22"
              />
              <stop
                offset="0.6"
                stopColor="var(--net-ember)"
                stopOpacity="0.06"
              />
              <stop offset="1" stopColor="var(--net-ember)" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="net-halo">
              <stop offset="0" stopColor="var(--net-glow)" stopOpacity="0.6" />
              <stop
                offset="0.35"
                stopColor="var(--color-accent)"
                stopOpacity="0.2"
              />
              <stop
                offset="1"
                stopColor="var(--color-accent)"
                stopOpacity="0"
              />
            </radialGradient>
            <radialGradient id="net-rim">
              <stop offset="0.5" stopColor="var(--net-ember)" stopOpacity="0" />
              <stop
                offset="0.8"
                stopColor="var(--net-ember)"
                stopOpacity="0.11"
              />
              <stop offset="1" stopColor="var(--net-ember)" stopOpacity="0" />
            </radialGradient>
            <filter id="net-grain" x="0" y="0" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="1.4"
                numOctaves="2"
                stitchTiles="stitch"
              />
              <feColorMatrix values="0 0 0 0 0.98  0 0 0 0 0.9  0 0 0 0 0.7  0 0 0 0.9 0" />
            </filter>
            <pattern
              id="net-grain-fill"
              width="40"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <rect width="40" height="40" filter="url(#net-grain)" />
            </pattern>
            <radialGradient id="net-fade-edge">
              <stop offset="0.55" stopColor="#fff" />
              <stop offset="1" stopColor="#000" />
            </radialGradient>
            <mask id="net-fade">
              <circle cx="50" cy="50" r="60" fill="url(#net-fade-edge)" />
            </mask>
          </defs>
          <circle className="net-boundary" cx="50" cy="50" r="58" />
          <circle className="net-wash" cx="50" cy="50" r="30" />
          <g className="net-dust">
            {dust.map((mote, i) => (
              <circle
                key={`${mote.x}-${mote.y}`}
                cx={mote.x}
                cy={mote.y}
                r={mote.r}
                style={clocks({
                  "--net-breath": `${16 + (i % 7) * 2}s`,
                  "--net-phase": `${+(-i * 1.3).toFixed(1)}s`,
                })}
              />
            ))}
          </g>
          <g className="net-tendrils">
            {tendrils.map((tendril) => (
              <Fragment key={tendril.trunk}>
                <path className="net-trunk" d={tendril.trunk} />
                <path className="net-seep" d={tendril.trunk} />
                {tendril.branches.map((branch) => (
                  <path
                    key={branch.id}
                    className="net-thread"
                    data-brain={branch.id}
                    d={branch.path}
                  />
                ))}
              </Fragment>
            ))}
          </g>
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
          {brains.map((brain, i) => {
            const near = 1 - brain.reach;
            const halo = +(3.6 + near * 8).toFixed(2);
            const route = routes.get(brain.id);
            // Each light breathes on its own clock; its rim, ripple and bead
            // take their turn on the sky's shared cycle of nine slots, one
            // brain every 5.2 s.
            const clock = clocks({
              "--net-breath": `${+(6 + (i % 4) * 1.3).toFixed(1)}s`,
              "--net-phase": `${+(-(i * 1.7)).toFixed(1)}s`,
              "--net-turn": `${+((i % 9) * 5.2).toFixed(1)}s`,
              "--net-slot": `${i % 9}`,
            });
            return (
              <g
                key={brain.id}
                className="net-reply"
                data-brain={brain.id}
                style={clock}
              >
                <circle
                  className="net-rim"
                  cx={brain.x}
                  cy={brain.y}
                  r={+(halo * 1.25).toFixed(2)}
                />
                <circle
                  className="net-halo"
                  cx={brain.x}
                  cy={brain.y}
                  r={halo}
                  opacity={+(0.6 + near * 0.8).toFixed(2)}
                />
                <circle
                  className="net-ripple"
                  cx={brain.x}
                  cy={brain.y}
                  r={+(halo * 0.9).toFixed(2)}
                />
                {route && (
                  <circle
                    className="net-bead"
                    r="0.7"
                    style={{ offsetPath: `path("${route}")` }}
                  />
                )}
              </g>
            );
          })}
          <circle className="net-corona" cx="50" cy="50" r="13" />
          <g className="net-embers">
            {EMBERS.map((ember) => (
              <circle
                key={ember.cx + ember.cy}
                cx={ember.cx}
                cy={ember.cy}
                r={ember.r}
                style={clocks({ "--net-phase": ember.phase })}
              />
            ))}
          </g>
          <circle className="net-lantern" cx="50" cy="50" r="1.9" />
          <rect
            className="net-grain"
            x="-10"
            y="-10"
            width="120"
            height="120"
            mask="url(#net-fade)"
          />
        </svg>
        <ul className="net-marks">
          {brains.map((brain) => (
            <li
              key={brain.id}
              className="net-mark"
              data-brain={brain.id}
              {...{ [ASK_MARK_ATTRIBUTE]: brain.id }}
              data-kind={brain.kind}
              style={{ left: `${brain.x}%`, top: `${brain.y}%` }}
            >
              <a href={`/agents/${brain.id}`} aria-label={brain.name}>
                <i />
              </a>
            </li>
          ))}
        </ul>
        <ol className="net-names">
          {brains.map((brain: PlacedBrain) => (
            <li
              key={brain.id}
              className={
                brain.align === "center"
                  ? "net-name"
                  : `net-name net-name--${brain.align}`
              }
              data-brain={brain.id}
              style={{ left: `${brain.x}%`, top: `${brain.y}%` }}
            >
              {brain.name}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

export function Opening(data: OpeningData): JSX.Element {
  const headingLead = data.headingLead ?? DEFAULT_COPY.headingLead;
  const lede = data.lede ?? DEFAULT_COPY.lede;
  return (
    // The story opens on the authored words beside the figure, which shows
    // the whole organism at rest and takes it apart stage by stage. The live
    // network, and the Ask room around it, is its own page, /ask (see
    // ./ask-room).
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
