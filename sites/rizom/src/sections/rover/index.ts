import { createTemplate } from "@brains/templates";
import { RoverContentSchema, type RoverContent } from "./schema";
import { RoverLayout } from "./layout";

export { RoverLayout, RoverContentSchema, type RoverContent };

export const roverTemplate = createTemplate<RoverContent>({
  name: "rover",
  description: "Rizom product card — Rover",
  schema: RoverContentSchema,
  requiredPermission: "public",
  layout: { component: RoverLayout },
});
