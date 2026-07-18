/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { SiteSectionGroup } from "@rizom/site";
import { defineSection, sectionGroup, z } from "@rizom/site-sections";
import { Section, renderHighlightedText } from "@rizom/site-rizom";
import { GrowthDiagram } from "./growth-diagram";
import {
  Band,
  CtaRow,
  SectCap,
  Trio,
  trioSchema,
  ctaSchema,
  delayClass,
} from "./shared";

/**
 * The umbrella home page. The hero is the live agent proximity map (wired in
 * routes.ts as agent-discovery:proximity-map); the sections here tell the
 * rev-11 story the map opens — the pain (problem, withered), how the parts
 * come together (growth carries the system: brain, practice, network), the
 * mission band (the quote alone), then the ask carried by proof — the
 * knowledge map (topics:knowledge-map, wired in routes.ts) — and the faces.
 * Each section is authored from one zod schema (its component's props are
 * `z.infer` of that schema); copy is content-driven, stored as markdown in
 * site-content/home/<section>.md. Only the assembled section group is
 * exported — the schemas and components are module-local.
 */

/* ============ growth diagram + the three stages ============ */

const growthStageSchema = z.object({
  title: z.string(),
  text: z.string(),
});

const growthSchema = z.object({
  cap: z.string(),
  capNote: z.string().optional(),
  stages: z.array(growthStageSchema),
});

/* Stage columns are keyed to the diagram's zone colors by position:
   You (brass, the brain) → Team (ruby, the practice) → Network (moss). */
const STAGE_TITLE_COLOR = [
  "text-[color:var(--palette-brass)]",
  "text-[color:var(--palette-ruby-soft)]",
  "text-[color:var(--palette-moss)]",
];

function HomeGrowthSection({
  cap,
  capNote,
  stages,
}: z.infer<typeof growthSchema>): JSX.Element {
  return (
    <Section id="growth" className="py-14">
      <SectCap lead={cap} trail={capNote} />
      <GrowthDiagram />
      <div className="reveal reveal-delay-2 mt-6 grid max-w-[1040px] gap-x-11 gap-y-6 md:grid-cols-3">
        {stages.map((stage, i) => (
          <div key={stage.title}>
            <b
              className={`block font-label text-label-xs font-semibold uppercase tracking-[0.18em] ${STAGE_TITLE_COLOR[i] ?? ""}`}
            >
              {stage.title}
            </b>
            <p className="mt-2 font-body text-[15px] text-theme-light">
              {stage.text}
            </p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ============ problem trio ============ */

function HomeProblemSection({
  cap,
  capNote,
  items,
}: z.infer<typeof trioSchema>): JSX.Element {
  return (
    <Section id="problem" className="py-14">
      {/* The one section with no warmth: cold cap, hollow numerals. */}
      <SectCap lead={cap} trail={capNote} tone="cold" />
      <Trio items={items} mono={false} withered />
    </Section>
  );
}

/* ============ mission band ============ */

/* Rev 10: the band is pure thesis — the quote carries the mission alone.
   Sub and CTAs stay authorable but optional, so older content parses. */
const missionSchema = z.object({
  quote: z.string(),
  sub: z.string().optional(),
  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),
});

function HomeMissionSection({
  quote,
  sub,
  primaryCta,
  secondaryCta,
}: z.infer<typeof missionSchema>): JSX.Element {
  return (
    <Band quote={quote}>
      {sub && (
        <p className="reveal reveal-delay-1 mt-[18px] max-w-[52ch] font-body text-[17px] text-theme-light">
          {sub}
        </p>
      )}
      {primaryCta && secondaryCta && (
        <CtaRow
          primaryCta={primaryCta}
          secondaryCta={secondaryCta}
          className="reveal reveal-delay-2 mt-[26px]"
        />
      )}
    </Band>
  );
}

/* ============ faces ============ */

const faceSchema = z.object({
  room: z.enum(["platform", "work", "foundation"]),
  kicker: z.string(),
  title: z.string(),
  go: z.string(),
  href: z.string(),
});

const facesSchema = z.object({
  cap: z.string(),
  faces: z.array(faceSchema),
});

type FaceRow = z.infer<typeof faceSchema>;

const FACE_KICKER_COLOR: Record<FaceRow["room"], string> = {
  platform: "text-[color:var(--palette-brass)]",
  work: "text-[color:var(--palette-ruby-soft)]",
  foundation: "text-[color:var(--palette-moss)]",
};

function HomeFacesSection({
  cap,
  faces,
}: z.infer<typeof facesSchema>): JSX.Element {
  return (
    <Section id="faces" className="py-14">
      <SectCap lead={cap} />
      <div className="mt-2.5">
        {faces.map((face, i) => (
          <a
            key={face.room}
            href={face.href}
            data-room={face.room}
            className={`reveal ${delayClass(i)} group grid items-baseline gap-1.5 border-t border-theme-light py-5 no-underline first:border-t-0 md:grid-cols-[120px_1fr_auto] md:gap-[30px]`}
          >
            <span
              className={`font-label text-label-xs uppercase tracking-[0.16em] ${FACE_KICKER_COLOR[face.room]}`}
            >
              {face.kicker}
            </span>
            <span className="font-display text-[23px] font-[480] tracking-[-0.008em] text-theme [font-variation-settings:'SOFT'_70]">
              {renderHighlightedText(
                face.title,
                "italic transition-colors group-hover:text-accent",
              )}
            </span>
            <span className="font-label text-[12px] text-theme-light">
              {face.go}
            </span>
          </a>
        ))}
      </div>
    </Section>
  );
}

/* ============ the home section group ============ */

/**
 * The umbrella home page's authored sections. The namespace ("home") matches
 * the route id, so each stores as site-content/home/<section>.md and resolves
 * as "home:<section>". Two sections live elsewhere: the hero is the live
 * agent proximity map (agent-discovery:proximity-map) and the proof/ask is
 * the knowledge map (topics:knowledge-map) — both authored via overlay
 * markdown merged over their live datasource payloads.
 */
export const homeSections: SiteSectionGroup = sectionGroup("home", {
  growth: defineSection(growthSchema, HomeGrowthSection, {
    title: "Growth",
    description:
      "You → Team → Network diagram with the three stage columns — how the parts come together",
  }),
  problem: defineSection(trioSchema, HomeProblemSection, {
    title: "Problem",
    description:
      "Alone, it withers — problem trio (hollow numerals, no warmth)",
  }),
  mission: defineSection(missionSchema, HomeMissionSection, {
    title: "Mission",
    description:
      "Mission band — display-italic statement alone; sub and CTAs optional",
  }),
  faces: defineSection(facesSchema, HomeFacesSection, {
    title: "Faces",
    description: "One practice, three faces — platform / work / foundation",
  }),
});
