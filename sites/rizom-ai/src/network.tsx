import type { JSX } from "preact";
import { z } from "@brains/utils/zod";
import { enrichedAgentSchema } from "@brains/agent-discovery";
import { createTemplate, type Template } from "@brains/templates";
import { Section } from "@brains/site-rizom";
import { IndexRow, SectCap, delayClass, type IndexRowData } from "./shared";

/**
 * /network — the agent directory (rev-5 IA, formerly rizom.foundation/agents).
 * Lists approved agents from the agent-discovery datasource; each row links
 * to the agent's card. The query logic lives in the plugin; this template
 * only contributes the directory look.
 */
type AgentItem = z.output<typeof enrichedAgentSchema>;

export interface NetworkContent {
  agents: AgentItem[];
}

export const networkContentSchema: z.ZodType<NetworkContent> = z.object({
  agents: z.array(enrichedAgentSchema),
});

function agentToRow(agent: AgentItem, index: number): IndexRowData {
  return {
    no: String(index + 1).padStart(2, "0"),
    kicker: agent.frontmatter.organization ?? agent.frontmatter.kind,
    title: agent.frontmatter.name,
    text: agent.about,
    ...(agent.url && { href: agent.url }),
    meta: agent.frontmatter.brainName,
  };
}

export function NetworkSection({ agents }: NetworkContent): JSX.Element {
  return (
    <Section id="network" className="py-14">
      <SectCap
        lead="Network"
        trail="— agents in the Rizom directory, discoverable and talk-to-able"
      />
      {agents.length === 0 ? (
        <p className="reveal mt-4 max-w-[56ch] font-body text-body-md text-theme-light">
          No agents in the network yet — the directory fills as brains are
          discovered and approved.
        </p>
      ) : (
        <div className="mt-2">
          {agents.map((agent, i) => (
            <IndexRow
              key={agent.id}
              row={agentToRow(agent, i)}
              delayClass={delayClass(i)}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

export const networkTemplate: Template = createTemplate<NetworkContent>({
  name: "network",
  description: "Agent directory — approved agents via agent-discovery",
  schema: networkContentSchema,
  dataSourceId: "agent-discovery:entities",
  requiredPermission: "public",
  layout: { component: NetworkSection },
});
