import { StructuredContentFormatter } from "@brains/utils";
import { BridgeContentSchema, type BridgeContent } from "./schema";

export const bridgeFormatter = new StructuredContentFormatter<BridgeContent>(
  BridgeContentSchema,
  {
    title: "Bridge Section",
    mappings: [
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "body", label: "Body", type: "string" },
      { key: "linkLabel", label: "Link label", type: "string" },
      { key: "linkHref", label: "Link href", type: "string" },
    ],
  },
);
