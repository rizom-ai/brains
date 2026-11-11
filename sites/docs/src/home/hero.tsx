/** @jsxImportSource react */
import type { JSX } from "react";
import { defineSection, z, type SiteSectionDefinition } from "@rizom/site";

type Words<Key extends string> = z.ZodObject<Record<Key, z.ZodString>>;

const docsHomeHeroSchema: z.ZodObject<{
  title: z.ZodString;
  lede: z.ZodString;
  bringHeading: z.ZodString;
  brainLabel: z.ZodString;
  showsUpHeading: z.ZodString;
  hint: z.ZodString;
  sources: Words<"draft" | "pdf" | "link" | "photo">;
  files: Words<"note" | "paper" | "link" | "image" | "post">;
  destinations: Words<"site" | "chat" | "ai" | "brains">;
  captions: Words<
    "draft" | "pdf" | "link" | "photo" | "chat" | "ai" | "brains" | "site"
  >;
}> = z.object({
  title: z.string(),
  lede: z.string(),
  bringHeading: z.string(),
  brainLabel: z.string(),
  showsUpHeading: z.string(),
  hint: z.string(),
  sources: z.object({
    draft: z.string(),
    pdf: z.string(),
    link: z.string(),
    photo: z.string(),
  }),
  files: z.object({
    note: z.string(),
    paper: z.string(),
    link: z.string(),
    image: z.string(),
    post: z.string(),
  }),
  destinations: z.object({
    site: z.string(),
    chat: z.string(),
    ai: z.string(),
    brains: z.string(),
  }),
  /** One sentence per route, shown as the route lights up. */
  captions: z.object({
    draft: z.string(),
    pdf: z.string(),
    link: z.string(),
    photo: z.string(),
    chat: z.string(),
    ai: z.string(),
    brains: z.string(),
    site: z.string(),
  }),
});

/** The copy of the home's opening: what a brain is, drawn as the brain. */
export type DocsHomeHeroContent = z.output<typeof docsHomeHeroSchema>;

type Story =
  "draft" | "pdf" | "link" | "photo" | "chat" | "ai" | "brains" | "site";

interface Node<K extends string> {
  key: K;
  node: string;
  story: Story;
}

/** The drawing's structure; its words are the content above. */
const sources: Array<Node<"draft" | "pdf" | "link" | "photo">> = [
  { key: "draft", node: "in-draft", story: "draft" },
  { key: "pdf", node: "in-pdf", story: "pdf" },
  { key: "link", node: "in-link", story: "link" },
  { key: "photo", node: "in-photo", story: "photo" },
];

const files: Array<
  Node<"note" | "paper" | "link" | "image" | "post"> & {
    type: string;
    left: string;
    top: string;
    above?: boolean;
  }
> = [
  {
    key: "note",
    node: "f-note",
    story: "draft",
    type: "note",
    left: "8%",
    top: "6%",
    above: true,
  },
  {
    key: "paper",
    node: "f-paper",
    story: "pdf",
    type: "note",
    left: "0%",
    top: "30%",
  },
  {
    key: "link",
    node: "f-link",
    story: "link",
    type: "link",
    left: "4%",
    top: "62%",
  },
  {
    key: "image",
    node: "f-image",
    story: "photo",
    type: "image",
    left: "28%",
    top: "86%",
  },
  {
    key: "post",
    node: "f-post",
    story: "site",
    type: "post",
    left: "64%",
    top: "8%",
    above: true,
  },
];

const destinations: Array<Node<"site" | "chat" | "ai" | "brains">> = [
  { key: "site", node: "out-site", story: "site" },
  { key: "chat", node: "out-chat", story: "chat" },
  { key: "ai", node: "out-ai", story: "ai" },
  { key: "brains", node: "out-brains", story: "brains" },
];

/** Every node is a button: pointing at it lights its route (see the script). */
export const DocsHomeHero = (content: DocsHomeHeroContent): JSX.Element => (
  <section className="dh dh-hero" aria-labelledby="docs-home-title">
    <div className="dh-wrap dh-hero__body">
      <h1 id="docs-home-title">{content.title}</h1>
      <p className="dh-lede">{content.lede}</p>

      <figure
        className="dh-brain"
        id="docs-home-brain"
        aria-label={content.title}
      >
        <svg aria-hidden="true" />

        <div className="dh-from">
          <h2>{content.bringHeading}</h2>
          <ul className="dh-ends">
            {sources.map((item) => (
              <li
                key={item.key}
                data-story={item.story}
                tabIndex={0}
                role="button"
                aria-pressed="false"
              >
                <span className="dh-dot" data-node={item.node} />
                <span>{content.sources[item.key]}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="dh-cluster">
          <div className="dh-core" style={{ left: "46%", top: "40%" }}>
            <span className="dh-core__dot" data-node="core" />
            <span className="dh-core__label">{content.brainLabel}</span>
          </div>
          <ul className="dh-files" aria-label={content.brainLabel}>
            {files.map((item) => (
              <li
                key={item.key}
                className={item.above ? "above" : undefined}
                style={{ left: item.left, top: item.top }}
                data-story={item.story}
                tabIndex={0}
                role="button"
                aria-pressed="false"
              >
                <span className="dh-dot" data-node={item.node} />
                <span>
                  {content.files[item.key]}{" "}
                  <span className="dh-type">{item.type}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="dh-to">
          <h2>{content.showsUpHeading}</h2>
          <ul className="dh-ends">
            {destinations.map((item) => (
              <li
                key={item.key}
                data-story={item.story}
                tabIndex={0}
                role="button"
                aria-pressed="false"
              >
                <span className="dh-dot" data-node={item.node} />
                <span>{content.destinations[item.key]}</span>
              </li>
            ))}
          </ul>
        </div>

        <p
          className="dh-caption"
          data-captions={JSON.stringify(content.captions)}
        >
          <span className="dh-caption__hint">{content.hint}</span>
          <span className="dh-caption__story" aria-live="polite">
            {content.captions.draft}
          </span>
        </p>
      </figure>
    </div>
  </section>
);

export const docsHomeHeroSection: SiteSectionDefinition = defineSection(
  docsHomeHeroSchema,
  DocsHomeHero,
  {
    title: "Docs home: the brain",
    description:
      "What a brain is, drawn as what you bring, what it keeps and where it shows up",
  },
);
