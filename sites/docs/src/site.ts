import { Fragment, createElement as h, type ReactNode, type JSX } from "react";
import type { RouteDefinitionInput, SiteDefinition } from "@rizom/site";
import {
  DOCS_HOME_SCRIPT_SRC,
  docsHomeContent,
  docsHomeCss,
  docsHomeScript,
  docsHomeSections,
} from "./home";

const docsQuery = { entityType: "doc", query: { limit: 100 } };

// The home: the docs header, then the site's own opening (what a brain is)
// and door introductions, then each docs section's guides and reference
// under its door. The opening and the doors start from the package's copy;
// once edited in Studio, the saved docs-home:hero and docs-home:doors
// site content takes over.
const homeSections = [
  { id: "header", template: "docs:doc-home-header", dataQuery: docsQuery },
  { id: "hero", template: "docs-home:hero", content: docsHomeContent.hero },
  { id: "doors", template: "docs-home:doors", content: docsHomeContent.doors },
  { id: "sections", template: "guides:guide-sections", dataQuery: {} },
];

// The docs index in parts, with the guides band between the hero and the
// sections. Without the guides plugin or any guide, there is no band.
const docsSections = [
  { id: "docs-hero", template: "docs:doc-home-hero", dataQuery: docsQuery },
  {
    id: "guides",
    template: "guides:guide-band",
    dataQuery: { entityType: "guide", query: { limit: 100 } },
  },
  { id: "docs", template: "docs:doc-home-sections", dataQuery: docsQuery },
];

const docsRoutes: RouteDefinitionInput[] = [
  {
    id: "docs-home",
    path: "/",
    title: "Documentation",
    description: "Brains documentation",
    layout: "default",
    navigation: {
      show: true,
      label: "Docs",
      slot: "primary",
      priority: 10,
    },
    sections: homeSections,
  },
  {
    id: "docs",
    path: "/docs",
    title: "Documentation",
    description: "Brains documentation",
    layout: "default",
    sections: docsSections,
  },
];

const DocsLayout = ({ sections }: { sections: ReactNode[] }): JSX.Element =>
  h(Fragment, null, ...sections);

export const docsSite: SiteDefinition = {
  layouts: {
    default: DocsLayout,
  },
  routes: docsRoutes,
  sections: docsHomeSections,
  themeOverride: docsHomeCss,
  headScripts: [`<script src="${DOCS_HOME_SCRIPT_SRC}" defer></script>`],
  staticAssets: { [DOCS_HOME_SCRIPT_SRC]: docsHomeScript },
  entityDisplay: {
    doc: {
      label: "Doc",
      pluralName: "docs",
      layout: "default",
      paginate: false,
      navigation: { show: false },
    },
    guide: {
      label: "Guide",
      pluralName: "guides",
      layout: "default",
      paginate: false,
      navigation: { show: false },
    },
  },
};

export default docsSite;
