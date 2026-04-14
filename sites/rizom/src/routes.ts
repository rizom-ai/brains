import type { RouteDefinitionInput } from "@brains/plugins";
import { createEcosystemContent } from "./compositions/ecosystem";

/**
 * Transitional shared Rizom route baseline.
 *
 * This shared package still ships a default route stack for direct
 * consumers of `@brains/site-rizom`, but app-owned wrappers should
 * treat it as a reusable baseline rather than the canonical final
 * composition for rizom.ai / rizom.foundation / rizom.work.
 *
 * In practice this baseline remains closest to the historical
 * rizom.ai structure while the remaining app ownership cleanup
 * continues.
 */
export const routes: RouteDefinitionInput[] = [
  {
    id: "home",
    path: "/",
    title: "Rizom",
    description: "Build the agent that represents you.",
    layout: "default",
    navigation: {
      show: false,
      slot: "secondary",
      priority: 10,
    },
    sections: [
      { id: "hero", template: "rizom-site:hero", content: {} },
      { id: "problem", template: "rizom-site:problem", content: {} },
      { id: "answer", template: "rizom-site:answer", content: {} },
      { id: "products", template: "rizom-site:products", content: {} },
      { id: "ownership", template: "rizom-site:ownership", content: {} },
      { id: "quickstart", template: "rizom-site:quickstart", content: {} },
      { id: "mission", template: "rizom-site:mission", content: {} },
      {
        id: "ecosystem",
        template: "rizom-site:ecosystem",
        content: createEcosystemContent("ai"),
      },
    ],
  },
];
