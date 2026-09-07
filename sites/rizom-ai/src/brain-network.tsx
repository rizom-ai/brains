/** @jsxImportSource react */
import type { JSX } from "react";
import {
  ProximityMap,
  proximityMapDataSchema,
  proximityMapScript,
  proximityMapWidgetStyles,
  type ProximityMapData,
} from "@brains/agent-discovery/proximity-map";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { createTemplate, type Template } from "@brains/templates";
import { z } from "@rizom/site";
import { BrainChapter } from "./brain";
import { ctaSchema } from "./shared";

const copySchema = z.object({
  cap: z.string().default(""),
  headline: z.string().default(""),
  body: z.array(z.string()).default([]),
  aside: z
    .object({ text: z.string(), links: z.array(ctaSchema).max(1) })
    .default({ text: "", links: [] }),
});
interface BrainNetworkProps {
  cap: string;
  headline: string;
  body: string[];
  aside: { text: string; links: { label: string; href: string }[] };
  map: ProximityMapData | null;
}
/** The native datasource supplies a map; authored fallback supplies copy only.
 * Keep graph data nested so the Markdown overlay cannot replace its nodes. */
export const brainNetworkSchema: z.ZodType<BrainNetworkProps> = z.preprocess(
  (value) =>
    typeof value === "object" && value !== null && "nodes" in value
      ? { map: value }
      : value,
  copySchema.extend({ map: proximityMapDataSchema.nullable().default(null) }),
);

function BrainNetwork(data: BrainNetworkProps): JSX.Element {
  return (
    <BrainChapter
      id="collective"
      data={data}
      visual={
        <div
          className="interface brain-network"
          aria-label="This brain’s agent network"
        >
          <link
            rel="stylesheet"
            href="/styles/brain-network.css"
            precedence="page"
          />
          {data.map ? (
            <ProximityMap data={data.map} surface="site" />
          ) : (
            <div className="brain-network-unavailable" role="status">
              <p>The network map isn’t available right now.</p>
              <p>This view uses this brain’s own public network data.</p>
            </div>
          )}
        </div>
      }
    />
  );
}

const copyFormatter = new StructuredContentFormatter(copySchema, {
  title: "Collective",
  mappings: [
    { key: "cap", label: "Cap", type: "string" },
    { key: "headline", label: "Headline", type: "string" },
    { key: "body", label: "Body", type: "array", itemType: "string" },
    {
      key: "aside",
      label: "Aside",
      type: "object",
      children: [
        { key: "text", label: "Text", type: "string" },
        {
          key: "links",
          label: "Links",
          type: "array",
          itemType: "object",
          itemMappings: [
            { key: "label", label: "Label", type: "string" },
            { key: "href", label: "Href", type: "string" },
          ],
        },
      ],
    },
  ],
});
const scriptPath = "/scripts/agent-proximity-map.js";
export const brainNetworkTemplate: Template = createTemplate({
  name: "connect",
  description:
    "Shared work between independently owned brains, with this brain's interactive network",
  schema: brainNetworkSchema,
  dataSourceId: "agent-discovery:proximity-map",
  requiredPermission: "public",
  // On datasource failure, preserve authored copy and show unavailable—not invented graph data.
  formatter: copyFormatter,
  overlayFormatter: copyFormatter,
  runtimeScripts: [{ src: scriptPath, defer: true }],
  staticAssets: {
    [scriptPath]: proximityMapScript,
    "/styles/brain-network.css": proximityMapWidgetStyles,
  },
  layout: { component: BrainNetwork },
});
