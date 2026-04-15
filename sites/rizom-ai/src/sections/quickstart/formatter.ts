import { StructuredContentFormatter } from "@brains/utils";
import { QuickstartContentSchema, type QuickstartContent } from "./schema";

export const quickstartFormatter =
  new StructuredContentFormatter<QuickstartContent>(QuickstartContentSchema, {
    title: "Quickstart Section",
    mappings: [
      { key: "badge", label: "Badge", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      { key: "description", label: "Description", type: "string" },
      { key: "installCommand", label: "Install Command", type: "string" },
      { key: "createCommand", label: "Create Command", type: "string" },
      { key: "runCommand", label: "Run Command", type: "string" },
      { key: "okLines", label: "OK Lines", type: "array", itemType: "string" },
    ],
  });
