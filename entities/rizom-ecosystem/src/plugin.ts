import type { DataSource, Plugin, Template } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import {
  ecosystemSectionAdapter,
  type EcosystemSectionAdapter,
} from "./adapters/ecosystem-section-adapter";
import { EcosystemSectionDataSource } from "./datasources/ecosystem-section-datasource";
import type { EcosystemSection } from "./schemas/ecosystem-section";
import { ecosystemSectionSchema } from "./schemas/ecosystem-section";
import { ecosystemTemplate } from "./templates/ecosystem-template";
import packageJson from "../package.json";

export type RizomEcosystemConfig = Record<string, never>;
export type RizomEcosystemConfigInput = Record<string, unknown>;

const rizomEcosystemConfigSchema: z.ZodType<
  RizomEcosystemConfig,
  RizomEcosystemConfigInput
> = z
  .object({})
  .catchall(z.unknown())
  .transform((): RizomEcosystemConfig => ({}));

const ecosystemSectionEntityType = "ecosystem-section";

export class RizomEcosystemPlugin extends EntityPlugin<
  EcosystemSection,
  RizomEcosystemConfig,
  RizomEcosystemConfigInput
> {
  public readonly entityType: typeof ecosystemSectionEntityType =
    ecosystemSectionEntityType;
  public readonly schema: typeof ecosystemSectionSchema =
    ecosystemSectionSchema;
  public readonly adapter: EcosystemSectionAdapter = ecosystemSectionAdapter;

  constructor(config: RizomEcosystemConfigInput = {}) {
    super("rizom-ecosystem", packageJson, config, rizomEcosystemConfigSchema);
  }

  protected override getTemplates(): Record<string, Template> {
    return { ecosystem: ecosystemTemplate };
  }

  protected override getDataSources(): DataSource[] {
    return [new EcosystemSectionDataSource()];
  }
}

export function rizomEcosystemPlugin(
  config: RizomEcosystemConfigInput = {},
): Plugin {
  return new RizomEcosystemPlugin(config);
}
