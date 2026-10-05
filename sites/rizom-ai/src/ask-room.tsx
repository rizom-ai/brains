/** @jsxImportSource react */
import type { JSX } from "react";
import { proximityMapDataSchema } from "@brains/agent-discovery/proximity-map";
import {
  ASK_BOX_SCRIPT_PATH,
  ASK_COLUMN_ATTRIBUTE,
  ASK_LEADS_ATTRIBUTE,
} from "@brains/contracts";
import { StructuredContentFormatter } from "@brains/content-formatters";
import { AskBoxHost } from "@brains/site-atlas";
import { createTemplate, type Template } from "@brains/templates";
import { z } from "@rizom/site";
import { NetworkLayer } from "./opening";
import { placeNetwork } from "./story/network";

/**
 * The Ask room, /ask: the guest box beside the live network, told as a story
 * without a figure. An answer's sources light the brains they came from and
 * lead to them (the Ask room runtime, @brains/site-atlas); on a phone the
 * drawing joins the open conversation. The drawing and the lead layer stand
 * before the words in the chapters column, where the page holds the drawing
 * at the figure's centre line while the words, and the Asked-before
 * questions after them, scroll past it.
 */
type AskRoomCopySchema = z.ZodObject<{
  cap: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  claim: z.ZodDefault<z.ZodNullable<z.ZodString>>;
  body: z.ZodDefault<z.ZodNullable<z.ZodString>>;
}>;

export const askRoomCopySchema: AskRoomCopySchema = z.object({
  /** The eyebrow. */
  cap: z.string().nullable().default(null),
  /** The heading. */
  claim: z.string().nullable().default(null),
  /** The line under the heading. */
  body: z.string().nullable().default(null),
});

const DEFAULT_COPY = {
  cap: "Ask",
  claim: "Ask the network",
  body: "Put a question to Rizom. It answers from what the connected brains have published, and the brains it drew on light up.",
};

/** The live network with the drafted questions and whether Web Chat serves the box (see ./opening-datasource). */
export const askRoomSchema: z.ZodObject<
  (typeof proximityMapDataSchema)["shape"] &
    AskRoomCopySchema["shape"] & {
      topics: z.ZodDefault<z.ZodArray<z.ZodString>>;
      prompt: z.ZodDefault<z.ZodNullable<z.ZodString>>;
      askBox: z.ZodDefault<z.ZodBoolean>;
    }
> = proximityMapDataSchema.extend({
  ...askRoomCopySchema.shape,
  topics: z.array(z.string()).default([]),
  prompt: z.string().nullable().default(null),
  askBox: z.boolean().default(false),
});

export type AskRoomData = z.output<typeof askRoomSchema>;

export function AskRoom(data: AskRoomData): JSX.Element {
  return (
    <>
      <NetworkLayer {...placeNetwork(data)} lendable />
      <svg
        className="net-leads"
        {...{ [ASK_LEADS_ATTRIBUTE]: "" }}
        aria-hidden="true"
      />
      <section id="ask" className="chapter chapter--opening" data-title="Ask">
        <div className="opening__words" {...{ [ASK_COLUMN_ATTRIBUTE]: "" }}>
          <p className="eyebrow">{data.cap ?? DEFAULT_COPY.cap}</p>
          <h1>{data.claim ?? DEFAULT_COPY.claim}</h1>
          <p className="lede">{data.body ?? DEFAULT_COPY.body}</p>
          <div className="ask">
            <AskBoxHost
              prefix="opening"
              placeholder={data.prompt ?? undefined}
            />
            {data.topics.length > 0 && (
              <ul className="ask__topics" aria-label="Suggested questions">
                {data.topics.map((topic) => (
                  <li key={topic}>
                    <button type="button" data-atlas-fill={topic}>
                      {topic}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <script src={ASK_BOX_SCRIPT_PATH} defer />
          </div>
        </div>
      </section>
    </>
  );
}

// The room's words, edited as an ordinary markdown section and spliced over
// the live data by the content overlay.
const askRoomCopyFormatter = new StructuredContentFormatter(askRoomCopySchema, {
  title: "Ask",
  mappings: [
    { key: "cap", label: "Cap", type: "string" },
    { key: "claim", label: "Claim", type: "string" },
    { key: "body", label: "Body", type: "string" },
  ],
});

export const askRoomTemplate: Template = createTemplate({
  name: "ask-room",
  description:
    "The Ask room: the guest box beside the live network, which an answer lights",
  schema: askRoomSchema,
  dataSourceId: "rizom:opening",
  overlayFormatter: askRoomCopyFormatter,
  requiredPermission: "public",
  layout: { component: AskRoom },
});
