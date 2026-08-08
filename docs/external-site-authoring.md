# External Site and Theme Authoring

Site and theme packages are ordinary public npm packages. They can live outside
the Brains monorepo and must not import private `@brains/*` packages.

`@rizom/site` is the sole site-authoring SDK. Site structure and themes are
versioned independently from `@rizom/brain` and from each other.

## Package metadata

A deployable site publishes built JavaScript and declarations:

```json
{
  "name": "@scope/my-site",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "dependencies": {
    "@rizom/site": ">=0.2.0-alpha.232 <0.3.0"
  },
  "peerDependencies": {
    "@rizom/brain": ">=0.2.0-alpha.263 <0.3.0",
    "preact": "^10.27.2"
  },
  "devDependencies": {
    "@rizom/brain": "0.2.0-alpha.263",
    "preact": "^10.27.2",
    "typescript": "^7.0.2"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

The published manifest and tarball must contain no `workspace:` ranges,
`publishPeerDependencies`, `publishExports`, private imports, or undeclared
runtime dependencies. Hosted production configuration should select an exact
site package version.

## Site definition

Import the schema vocabulary and helpers from one package. The default export is
the validated structural definition; it never embeds a runtime plugin.

```tsx
import { defineSection, defineSite, sectionGroup, z } from "@rizom/site";

const hero = defineSection(
  z.object({ heading: z.string(), introduction: z.string() }),
  ({ heading, introduction }) => (
    <section>
      <h1>{heading}</h1>
      <p>{introduction}</p>
    </section>
  ),
  { title: "Hero", description: "Page introduction" },
);

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
      title: "Home",
      sections: [{ id: "hero", template: "home.hero" }],
    },
  ],
  sections: [sectionGroup("home", { hero })],
  content: {
    home: {
      hero: { heading: "Welcome", introduction: "A schema-first site." },
    },
  },
  entityDisplay: {},
  themeOverride: ".hero { max-width: 48rem; }",
  headScripts: ["<script>globalThis.siteReady = true</script>"],
  staticAssets: { "robots.txt": "User-agent: *\nAllow: /\n" },
});
```

Layouts, routes, content, section schemas, entity display metadata, additive
CSS, head scripts, and static assets are all validated by `defineSite()`.
Themes remain separately selected. Backend tools, jobs, or data integrations
belong in a focused service package composed explicitly through the Brain
definition.

## Verify and publish

```bash
bun install --frozen-lockfile
bun run typecheck
bun test
npm pack --dry-run
npm publish --access public
```

After publishing, inspect the registry metadata and install the tarball in an
isolated Brain consumer. Start the app, request a preview rebuild through its
MCP command surface, and inspect `dist/site-preview`; source-only rendering is
not sufficient evidence.
