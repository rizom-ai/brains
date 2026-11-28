import type { ServiceDataSourceDeclaration } from "@brains/sdk/internal/service-runtime";
import { z } from "@brains/utils/zod";

/** The build the Ask source serves, and the shared records it may read. */
export type SeminarAskBuild = Pick<
  Parameters<ServiceDataSourceDeclaration["fetch"]>[1],
  "publishedOnly" | "sharedState"
>;

/** The Ask page: who answers, whether asking is open, and whom a question reaches. */
export const seminarAskPageSchema: z.ZodObject<{
  name: z.ZodString;
  askBox: z.ZodBoolean;
  peers: z.ZodArray<z.ZodString>;
}> = z.object({
  name: z.string(),
  askBox: z.boolean(),
  peers: z.array(z.string()),
});

export type SeminarAskPage = z.output<typeof seminarAskPageSchema>;

export interface SeminarAskSources {
  /** The brain's name, as its site names it. */
  name: () => string;
  /** Whether Web Chat serves the guest box for this build. */
  chatAvailable: (build: SeminarAskBuild) => Promise<boolean>;
  /** The names of the peers a question reaches, as the brain shows and orders them. */
  peers: () => Promise<readonly string[]>;
}

/** The Ask page of a brain, open or closed. */
export function seminarAskPage(
  name: string,
  askBox: boolean,
  peers: readonly string[],
): SeminarAskPage {
  return { name, askBox, peers: [...peers] };
}

/** The Ask source as the brain registers it: `seminar:ask`. */
export function seminarAskDataSource(
  sources: SeminarAskSources,
): ServiceDataSourceDeclaration {
  return {
    id: "ask",
    name: "Seminar Ask DataSource",
    description:
      "The brain's name, the guest box's availability and the peers a question reaches",
    fetch: async (_query, { publishedOnly, sharedState }) =>
      seminarAskPage(
        sources.name(),
        await sources.chatAvailable({ publishedOnly, sharedState }),
        await sources.peers(),
      ),
  };
}
