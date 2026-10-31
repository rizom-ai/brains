import type {
  DataSource,
  EntityTypeConfig,
  Plugin,
  Template,
} from "@brains/plugins";
import { EntityPlugin, emptyEntityPluginConfigSchema } from "@brains/plugins";
import { guideSchema, type Guide } from "./schemas/guide";
import { guideAdapter, type GuideAdapter } from "./adapters/guide-adapter";
import { GuideDataSource } from "./datasources/guide-datasource";
import { getTemplates } from "./lib/register-templates";
import packageJson from "../package.json";

export class GuidesPlugin extends EntityPlugin<
  Guide,
  Record<string, never>,
  Record<string, never>
> {
  readonly entityType: typeof guideAdapter.entityType = guideAdapter.entityType;
  readonly schema: typeof guideSchema = guideSchema;
  readonly adapter: GuideAdapter = guideAdapter;

  constructor() {
    super("guides", packageJson, {}, emptyEntityPluginConfigSchema);
  }

  protected override getEntityTypeConfig(): EntityTypeConfig | undefined {
    return { projectionSourceRole: "primary" };
  }

  protected override async getInstructions(): Promise<string> {
    return [
      'Guides (entityType "guide") walk one kind of user through moving into a brain: a writer, researcher, consultant, team, or someone running their own brain.',
      "A question from someone who describes themselves, their material or how they work, and asks where to start, how to bring their material in, how to run a brain of their own, such as on their own server, or what a brain would do for them, is a guide question, even when it names no guide. A guide question is answered from its guide alone, without searching the docs: the guide links the docs for the details.",
      'For a guide question, first run system_list with entityType "guide", before asking the network or answering from general knowledge: each guide\'s metadata says who it is for (persona, for) and what material it moves in. Read the guide that fits the person with system_get, and answer from its stages.',
      'Name the guide you answer from by its title, such as "Moving in as a writer", so the reply links to it.',
    ].join("\n");
  }

  protected override getTemplates(): Record<string, Template> {
    return getTemplates();
  }

  protected override getDataSources(): DataSource[] {
    return [new GuideDataSource(this.logger.child("GuideDataSource"))];
  }
}

export function guidesPlugin(): Plugin {
  return new GuidesPlugin();
}
