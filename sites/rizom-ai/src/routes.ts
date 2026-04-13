import type { RouteDefinitionInput } from "@brains/plugins";
import {
  createEcosystemContent,
  routes as baseRoutes,
} from "@brains/site-rizom";

export const aiRoutes: RouteDefinitionInput[] = baseRoutes.map((route) => {
  if (route.id !== "home") {
    return route;
  }

  const sections = (route.sections ?? []).map((section) => {
    if (section.id !== "ecosystem") {
      return section;
    }

    return {
      ...section,
      content: createEcosystemContent("ai"),
    };
  });

  return {
    ...route,
    title: "Rizom AI",
    description: "Build the agent that represents you.",
    sections,
  };
});
