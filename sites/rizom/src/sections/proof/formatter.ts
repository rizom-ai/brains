import { StructuredContentFormatter } from "@brains/utils";
import { ProofContentSchema, type ProofContent } from "./schema";

export const proofFormatter = new StructuredContentFormatter<ProofContent>(
  ProofContentSchema,
  {
    title: "Proof Section",
    mappings: [
      { key: "kicker", label: "Kicker", type: "string" },
      { key: "headline", label: "Headline", type: "string" },
      { key: "quote", label: "Quote", type: "string" },
      { key: "attribution", label: "Attribution", type: "string" },
      { key: "partnersLabel", label: "Partners label", type: "string" },
      {
        key: "partners",
        label: "Partners",
        type: "array",
        itemType: "string",
      },
    ],
  },
);
