import { Fragment, createElement as h, type ReactNode, type JSX } from "react";
import type { RouteDefinitionInput, SiteDefinition } from "@rizom/site";

const docsSections = [
  {
    id: "docs",
    template: "docs:doc-list",
    dataQuery: {
      entityType: "doc",
      query: { limit: 100 },
    },
  },
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
  },
};

export default docsSite;
