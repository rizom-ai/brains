# External Site and Theme Authoring

> **Alpha preview for collaborators.** The last exact registry-tested combination
> was `@rizom/brain@0.2.0-alpha.313` with `@rizom/site@0.2.0-alpha.233`. The
> final candidates may advance after review; stable versions have not been
> nominated.

Sites and themes are ordinary public npm packages and can live outside the
Brains monorepo. `@rizom/site` is the sole structural authoring SDK; site,
theme, and Brain versions are selected independently.

For the complete checked implementation, read the
[reading-site fixture](../packages/brain-cli/test/fixtures/public-authoring/site/src/index.tsx).
It passes isolated package typechecking and a running-app preview rebuild that
inspects rendered layout, content, CSS, head scripts, routing, and assets.

## Mental model

```text
section schema + component
          │
          ▼
sectionGroup(namespace)
          │
          ├── typed content
          └── route placements
                    │
                    ▼
defineSite({ layouts, routes, sections, content, ... })
```

A site package owns structural presentation. It does not own runtime plugin
behavior. Tools, jobs, data integrations, and backend listeners belong in
focused entity/service/interface packages composed by the Brain definition.

## Publishable site package

A deployable site publishes built JavaScript and declarations. During this
preview, pin `@rizom/site` exactly and declare the nominated Brain compatibility
range:

```json
{
  "name": "@scope/my-site",
  "version": "0.1.0",
  "type": "module",
  "files": ["dist"],
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "check": "tsc --noEmit -p tsconfig.json",
    "build": "tsc -p tsconfig.json"
  },
  "dependencies": {
    "@rizom/site": "0.2.0-alpha.233"
  },
  "peerDependencies": {
    "@rizom/brain": ">=0.2.0-alpha.272 <0.3.0",
    "react": "^19.2.7",
    "react-dom": "^19.2.7"
  },
  "devDependencies": {
    "@rizom/brain": "0.2.0-alpha.272",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.0.3",
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "typescript": "^7.0.2"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

The published manifest and tarball must contain no `workspace:` ranges,
authoring-only publish fields, private imports, or undeclared runtime
dependencies. Hosted configuration selects exact site and theme package
versions; it never infers either from the Brain version.

## Structural definition

Import schema vocabulary and helpers from one package. A section schema both
validates content and infers component props:

<!-- public-authoring-example: external-site-definition -->

```tsx
import { defineSection, defineSite, sectionGroup, z } from "@rizom/site";

const hero = defineSection(
  z.object({ heading: z.string(), introduction: z.string() }),
  ({ heading, introduction }) => (
    <section className="hero">
      <h1>{heading}</h1>
      <p>{introduction}</p>
    </section>
  ),
  { title: "Hero", description: "Page introduction" },
);

const homeSections = sectionGroup("home", { hero });

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
      navigation: { show: true, label: "Home", priority: 10 },
    },
  ],
  sections: [homeSections],
  content: {
    home: {
      hero: {
        heading: "Welcome",
        introduction: "A schema-first site.",
      },
    },
  },
  entityDisplay: {
    article: {
      label: "Article",
      pluralName: "Articles",
      navigation: { show: true, slot: "primary", priority: 20 },
    },
  },
  themeOverride: ".hero { max-width: 48rem; margin: 4rem auto; }",
  headScripts: [
    `<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebSite"}</script>`,
  ],
  staticAssets: {
    "robots.txt": "User-agent: *\nAllow: /\n",
  },
});
```

### How names connect

For `sectionGroup("home", { hero })`:

- content lives at `content.home.hero`;
- route placement uses `template: "home.hero"`;
- `id: "hero"` identifies this placement within the route;
- the component props are inferred from the `hero` schema.

A mismatch in authored content fails `defineSite()` validation instead of
reaching the renderer.

Site components use the React 19 JSX dialect: write `className` and `htmlFor`,
pass `style` as an object, and camel-case SVG props such as `strokeWidth`.
Server-rendered sites remain static and are not hydrated merely because they use
React.

## Stable structural fields

| Field           | Purpose                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `layouts`       | HTML page frames receiving title and rendered section output           |
| `routes`        | Paths, titles, navigation metadata, and ordered section placements     |
| `sections`      | Namespaced schema/component definitions                                |
| `content`       | Schema-validated values keyed by section namespace and ID              |
| `entityDisplay` | Labels and navigation hints for entity-backed pages                    |
| `themeOverride` | Site-specific additive CSS applied over the selected independent theme |
| `headScripts`   | Explicit trusted head markup such as JSON-LD                           |
| `staticAssets`  | Text assets emitted at exact output paths                              |

`defineSite()` never accepts an embedded `plugin`. Compose backend behavior as
a separate default package definition through `use()` in the Brain package.

## Theme package

A theme is simpler than a site: its default JavaScript export is the complete
CSS string. It does not import site structure or private build tooling.

<!-- public-authoring-example: external-theme-definition -->

```ts
const themeCSS = `
  :root {
    --surface: #f7f4ed;
    --ink: #181713;
  }
  body {
    background: var(--surface);
    color: var(--ink);
  }
`;

export default themeCSS;
export { themeCSS };
```

Publish the emitted JavaScript and declaration (`declare const themeCSS:
string`). A theme that layers another public theme imports that package and
exports the complete combined string. Hosted configuration pins the theme
package and version separately from the site.

## Build and review locally

```bash
bun install
bun run check
bun run build
bun pm pack
```

Before publishing:

1. install the tarball in a clean Brain consumer;
2. start the app;
3. request an app-managed preview rebuild through the command surface;
4. inspect `dist/site-preview` for every route, layout, section, style, head
   script, and asset;
5. verify the tarball and registry metadata contain only public dependencies
   and exact intended versions.

Rendering source directly is not equivalent to the app-managed build path.
The runtime resolves entity data, template names, theme layering, and output
paths during that build.

## Common mistakes

| Symptom                                      | Correction                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Content is accepted by TypeScript but fails  | Keep content under the section group's namespace and satisfy its schema              |
| A route renders no section                   | Match `template: "namespace.sectionId"` to `sectionGroup(namespace, {...})`          |
| The site imports `@rizom/brain/site`         | Import every structural helper from `@rizom/site`                                    |
| The site embeds tools or a runtime plugin    | Move backend behavior into a separately composed extension package                   |
| React warns about a JSX property             | Use `className`, `htmlFor`, style objects, and camel-cased SVG props                 |
| Theme and site versions move together        | Publish and pin them independently                                                   |
| A static inspection passes but preview fails | Start the app and trigger the real preview rebuild before inspecting generated files |
