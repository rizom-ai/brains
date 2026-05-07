import type { DataSource, Template } from "@brains/plugins";
import { EntityPlugin } from "@brains/plugins";
import { z } from "@brains/utils";
import { ecosystemSectionAdapter } from "./adapters/ecosystem-section-adapter";
import { EcosystemSectionDataSource } from "./datasources/ecosystem-section-datasource";
import type { EcosystemSection } from "./schemas/ecosystem-section";
import { ecosystemSectionSchema } from "./schemas/ecosystem-section";
import { ecosystemTemplate } from "./templates/ecosystem-template";
import packageJson from "../package.json";

export class RizomEcosystemPlugin extends EntityPlugin<EcosystemSection> {
  public readonly entityType = "ecosystem-section";
  public readonly schema = ecosystemSectionSchema;
  public readonly adapter = ecosystemSectionAdapter;

  constructor(config = {}) {
    super("rizom-ecosystem", packageJson, config, z.object({}).default({}));
  }

  protected override getTemplates(): Record<string, Template> {
    return { ecosystem: ecosystemTemplate };
  }

  protected override getDataSources(): DataSource[] {
    return [new EcosystemSectionDataSource()];
  }
}

export function rizomEcosystemPlugin(config = {}): RizomEcosystemPlugin {
  return new RizomEcosystemPlugin(config);
}
