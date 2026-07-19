/** @jsxImportSource preact */
import type { JSX } from "preact";
import { createTemplate } from "@brains/templates";
import type { Template } from "@brains/templates";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { z } from "@brains/utils/zod";
import { KnowledgeMap, knowledgeMapStyles } from "../widgets/knowledge-map";
import { knowledgeMapDataSchema } from "../lib/knowledge-map-data";
import { KNOWLEDGE_MAP_DATASOURCE_ID } from "../lib/constants";

/**
 * The knowledge map as a site section (docs/plans/knowledge-map.md, phase 4):
 * the home page's proof — authored copy beside the live map, honest counts
 * and the alive-line's proof links in the foot. Copy is overlay-authored
 * (flat markdown headings) and merged over the datasource payload; absent
 * fields fall back to the defaults below.
 */

const ctaSchema = z.object({ label: z.string(), href: z.string() });

interface CtaLink {
  label: string;
  href: string;
}

/** Overlay-authored copy around the map; absent fields use the defaults. */
export interface KnowledgeMapCopy {
  cap?: string | undefined;
  headingLead?: string | undefined;
  headingAccent?: string | undefined;
  intro?: string | undefined;
  primaryCta?: CtaLink | undefined;
  secondaryCta?: CtaLink | undefined;
  proofLinks?: CtaLink[] | undefined;
}

const copyShape = {
  cap: z.string().optional(),
  headingLead: z.string().optional(),
  headingAccent: z.string().optional(),
  intro: z.string().optional(),
  primaryCta: ctaSchema.optional(),
  secondaryCta: ctaSchema.optional(),
  proofLinks: z.array(ctaSchema).optional(),
};

export type KnowledgeMapTemplateData = z.infer<typeof knowledgeMapDataSchema> &
  KnowledgeMapCopy;

export const knowledgeMapTemplateSchema: z.ZodType<KnowledgeMapTemplateData> =
  knowledgeMapDataSchema.extend(copyShape);

/* Brain-agnostic defaults: this template ships with the topics plugin to
   every brain, so nothing here may assume a particular site's routes or
   repos. A site overrides all of it by authoring the section's markdown. */
const DEFAULT_COPY = {
  cap: "The corpus",
  headingLead: "What this brain",
  headingAccent: "knows",
  intro:
    "Every mark is a real entity from this brain's corpus, placed by meaning. Topics are the territories; what has been published glows; anything outside every border is still waiting to be filed.",
  primaryCta: { label: "Talk to it →", href: "/chat" },
  secondaryCta: { label: "Open the console", href: "/dashboard" },
  proofLinks: [
    { label: "agent card", href: "/.well-known/agent-card.json" },
    { label: "open the console →", href: "/dashboard" },
  ],
} as const;

const SITE_STYLES = `
.knowledge-map-site {
  --console-mono: var(--font-mono, ui-monospace, monospace);
  --console-accent: var(--color-accent, #b45309);
  --console-text: var(--color-text, #211d36);
  --console-secondary: #8c82c8;
  --kmap-moss: var(--color-secondary, #7d9268);
  position: relative;
  padding: clamp(2.5rem, 5vw, 3.5rem) 1.5rem;
  color: var(--console-text);
}
@media (min-width: 768px) {
  .knowledge-map-site { padding-left: 2.5rem; padding-right: 2.5rem; }
}
@media (min-width: 1280px) {
  .knowledge-map-site { padding-left: 5rem; padding-right: 5rem; }
}
html[data-theme="light"] .knowledge-map-site { --console-secondary: #6b2fa0; }
.knowledge-map-site__grid {
  display: grid;
  gap: clamp(2rem, 4vw, 3.5rem);
  align-items: center;
}
@media (min-width: 900px) {
  .knowledge-map-site__grid { grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); }
}
.knowledge-map-site__cap {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin: 0;
  color: var(--console-accent);
  font-family: var(--console-mono);
  font-size: 0.67rem;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.knowledge-map-site__cap::before {
  content: "";
  width: 1.6rem;
  height: 1px;
  background: var(--console-accent);
  opacity: 0.8;
}
.knowledge-map-site__heading {
  max-width: 14ch;
  margin: 0.9rem 0 0;
  font-family: var(--font-display, Georgia, serif);
  font-size: clamp(1.75rem, 3vw, 2.5rem);
  font-weight: 465;
  font-variation-settings: "SOFT" 78, "opsz" 84;
  letter-spacing: -0.014em;
  line-height: 1.1;
}
.knowledge-map-site__heading em {
  color: var(--console-accent);
  font-style: italic;
  font-weight: 400;
}
.knowledge-map-site__intro {
  max-width: 52ch;
  margin: 1rem 0 0;
  color: var(--color-text-muted, var(--console-text));
  font-size: 1.06rem;
  line-height: 1.7;
}
.knowledge-map-site__ctas {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem 1.6rem;
  align-items: baseline;
  margin-top: 1.5rem;
}
/* CTAs ride the site's button tokens so they are indistinguishable from
   the Button component everywhere else on the page; the fallbacks keep
   them presentable on themes that don't define the tokens. */
.knowledge-map-site__cta,
.knowledge-map-site__cta--quiet {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--rizom-btn-gap, 8px);
  border-radius: var(--rizom-btn-radius, 3px);
  border-style: solid;
  font-family: var(--rizom-btn-font-family, inherit);
  font-style: var(--rizom-btn-font-style, normal);
  font-size: 1rem;
  letter-spacing: var(--rizom-btn-letter-spacing, 0);
  text-transform: var(--rizom-btn-text-transform, none);
  text-decoration: none;
  padding: var(--rizom-btn-md-padding, 12px 24px);
  transition: all 160ms ease;
}
.knowledge-map-site__cta {
  font-weight: var(--rizom-btn-primary-font-weight, 500);
  color: var(--rizom-btn-primary-color, var(--color-bg, #fff));
  background: var(--rizom-btn-primary-bg, var(--console-accent));
  border-color: var(--rizom-btn-primary-border-color, transparent);
  border-width: var(--rizom-btn-primary-border-width, 0);
  box-shadow: var(--rizom-btn-primary-shadow, none);
}
.knowledge-map-site__cta:hover {
  color: var(--rizom-btn-primary-hover-color, var(--color-bg, #fff));
  background: var(--rizom-btn-primary-hover-bg, var(--console-accent));
  box-shadow: var(--rizom-btn-primary-hover-shadow, none);
  transform: var(--rizom-btn-primary-hover-transform, none);
}
.knowledge-map-site__cta--quiet {
  font-weight: var(--rizom-btn-secondary-font-weight, 400);
  color: var(--rizom-btn-secondary-color, var(--color-text-muted, inherit));
  background: var(--rizom-btn-secondary-bg, transparent);
  border-color: var(--rizom-btn-secondary-border-color, currentColor);
  border-width: var(--rizom-btn-secondary-border-width, 0 0 1px 0);
  box-shadow: var(--rizom-btn-secondary-shadow, none);
}
.knowledge-map-site__cta--quiet:hover {
  color: var(--rizom-btn-secondary-hover-color, var(--color-text, inherit));
  border-color: var(--rizom-btn-secondary-hover-border-color, currentColor);
}
.knowledge-map-site__foot {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem 1.4rem;
  margin-top: 0.9rem;
  padding-top: 0.8rem;
  border-top: 1px solid color-mix(in srgb, var(--console-text) 12%, transparent);
  color: color-mix(in srgb, var(--console-text) 55%, transparent);
  font-family: var(--console-mono);
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.knowledge-map-site__foot b { color: var(--console-accent); font-weight: 600; }
.knowledge-map-site__links {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 1.1rem;
}
.knowledge-map-site__links a {
  color: inherit;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: none;
  text-decoration: none;
  border-bottom: 1px solid color-mix(in srgb, var(--console-text) 15%, transparent);
  transition: color 160ms ease;
}
.knowledge-map-site__links a:hover { color: var(--console-accent); }
.knowledge-map-site__links a:last-child { color: var(--console-accent); }
`;

export function KnowledgeMapTemplate(
  data: KnowledgeMapTemplateData,
): JSX.Element {
  const cap = data.cap ?? DEFAULT_COPY.cap;
  const headingLead = data.headingLead ?? DEFAULT_COPY.headingLead;
  const headingAccent = data.headingAccent ?? DEFAULT_COPY.headingAccent;
  const intro = data.intro ?? DEFAULT_COPY.intro;
  const primaryCta = data.primaryCta ?? DEFAULT_COPY.primaryCta;
  const secondaryCta = data.secondaryCta ?? DEFAULT_COPY.secondaryCta;
  const proofLinks = data.proofLinks ?? DEFAULT_COPY.proofLinks;
  const mapData = {
    points: data.points,
    zones: data.zones,
    counts: data.counts,
  };
  return (
    <section class="knowledge-map-site" id="knowledge">
      <style>{SITE_STYLES + knowledgeMapStyles}</style>
      <div class="knowledge-map-site__grid">
        <div>
          <p class="knowledge-map-site__cap">{cap}</p>
          <h2 class="knowledge-map-site__heading">
            {headingLead} <em>{headingAccent}</em>
          </h2>
          <p class="knowledge-map-site__intro">{intro}</p>
          <div class="knowledge-map-site__ctas">
            <a class="knowledge-map-site__cta" href={primaryCta.href}>
              {primaryCta.label}
            </a>
            <a class="knowledge-map-site__cta--quiet" href={secondaryCta.href}>
              {secondaryCta.label}
            </a>
          </div>
        </div>
        <div>
          <KnowledgeMap data={mapData} surface="site" />
          <div class="knowledge-map-site__foot">
            <span>
              <b>{data.counts.entities}</b> entities ·{" "}
              <b>{data.counts.topics}</b> topics
            </span>
            <span class="knowledge-map-site__links">
              {proofLinks.map((link) => (
                <a key={link.href} href={link.href}>
                  {link.label}
                </a>
              ))}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const knowledgeMapCopyFormatter = new StructuredContentFormatter(
  z.object(copyShape),
  {
    title: "Knowledge",
    mappings: [
      { key: "cap", label: "Cap", type: "string" },
      { key: "headingLead", label: "Heading Lead", type: "string" },
      { key: "headingAccent", label: "Heading Accent", type: "string" },
      { key: "intro", label: "Intro", type: "string" },
      {
        key: "primaryCta",
        label: "Primary Cta",
        type: "object",
        children: [
          { key: "label", label: "Label", type: "string" },
          { key: "href", label: "Href", type: "string" },
        ],
      },
      {
        key: "secondaryCta",
        label: "Secondary Cta",
        type: "object",
        children: [
          { key: "label", label: "Label", type: "string" },
          { key: "href", label: "Href", type: "string" },
        ],
      },
      {
        key: "proofLinks",
        label: "Links",
        type: "array",
        itemType: "object",
        itemMappings: [
          { key: "label", label: "Label", type: "string" },
          { key: "href", label: "Href", type: "string" },
        ],
      },
    ],
  },
);

export function getKnowledgeMapTemplate(): Template {
  return createTemplate({
    name: "knowledge-map",
    description:
      "The brain's corpus in semantic space — topic territories, published lights, honest counts",
    schema: knowledgeMapTemplateSchema,
    dataSourceId: KNOWLEDGE_MAP_DATASOURCE_ID,
    overlayFormatter: knowledgeMapCopyFormatter,
    requiredPermission: "public",
    layout: {
      component: KnowledgeMapTemplate,
    },
  });
}
