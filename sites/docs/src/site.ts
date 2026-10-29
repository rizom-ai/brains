import { Fragment, createElement as h, type ReactNode, type JSX } from "react";
import type { RouteDefinitionInput, SiteDefinition } from "@rizom/site";

const docsQuery = { entityType: "doc", query: { limit: 100 } };

// The docs home in parts, with the guides band between the hero and the
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
    sections: docsSections,
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
