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

// Groups namespace section IDs and their content under one stable key.
const librarySections = sectionGroup("library", { hero });

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
      sections: [{ id: "hero", template: "library.hero" }],
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
