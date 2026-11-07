import {
  Card,
  CardMetadata,
  CardTitle,
  MarkdownContent,
  TagsList,
  formatDate,
} from "@rizom/brain-ui";
import { defineSection, defineSite, sectionGroup, z } from "@rizom/site";

// A section schema validates content and infers component props.
const hero = defineSection(
  z.object({
    heading: z.string(),
    introduction: z.string(),
  }),
  ({ heading, introduction }) => (
    <section className="hero">
      <p className="eyebrow">Reading library</p>
      <h1>{heading}</h1>
      <p>{introduction}</p>
    </section>
  ),
  {
    title: "Hero",
    description: "Introduction to the public reading library.",
  },
);

// Sections render with the public components, which follow the selected
// theme's tokens. MarkdownContent sanitizes what it renders, and in a site
// build resolves entity://image references to the build's images.
const shelf = defineSection(
  z.object({
    heading: z.string(),
    readings: z.array(
      z.object({
        title: z.string(),
        url: z.string(),
        savedAt: z.string(),
        tags: z.array(z.string()),
        note: z.string(),
      }),
    ),
  }),
  ({ heading, readings }) => (
    <section className="shelf">
      <h2>{heading}</h2>
      {readings.map((reading) => (
        <Card key={reading.url} variant="compact">
          <CardTitle href={reading.url}>{reading.title}</CardTitle>
          <CardMetadata>
            Saved {formatDate(reading.savedAt, { style: "long" })}
          </CardMetadata>
          <TagsList tags={reading.tags} />
          <MarkdownContent markdown={reading.note} />
        </Card>
      ))}
    </section>
  ),
  {
    title: "Shelf",
    description: "Readings worth returning to.",
  },
);

// Groups namespace section IDs and their content under one stable key.
const librarySections = sectionGroup("library", { hero, shelf });

// The default export is structural site data; backend behavior composes separately.
export default defineSite({
  layouts: {
    default: ({ title, sections }) => (
      <html lang="en">
        <head>
          <title>{title}</title>
        </head>
        <body>
          <main>{sections}</main>
        </body>
      </html>
    ),
  },

  routes: [
    {
      id: "home",
      path: "/",
      title: "Reading library",
      sections: [
        { id: "hero", template: "library:hero" },
        { id: "shelf", template: "library:shelf" },
      ],
      navigation: { show: true, label: "Library", priority: 10 },
    },
  ],

  sections: [librarySections],
  content: {
    library: {
      hero: {
        heading: "Read with intention",
        introduction: "Saved pages and their digests, collected in one place.",
      },
      shelf: {
        heading: "On the shelf",
        readings: [
          {
            title: "The maintenance of things",
            url: "https://example.com/maintenance",
            savedAt: "2026-03-14T12:00:00Z",
            tags: ["care", "infrastructure"],
            note: "Read it **slowly**; the argument turns on repair.",
          },
        ],
      },
    },
  },

  entityDisplay: {
    bookmark: {
      label: "Bookmark",
      pluralName: "Bookmarks",
      navigation: { show: true, slot: "primary", priority: 20 },
    },
    "reading-digest": { label: "Reading digest" },
  },

  themeOverride: `
    .hero { max-width: 48rem; margin: 6rem auto; }
    .eyebrow { letter-spacing: 0.12em; text-transform: uppercase; }
  `,
  headScripts: [
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"CollectionPage"}</script>`,
  ],
  staticAssets: {
    "robots.txt": "User-agent: *\nAllow: /\n",
  },
});
