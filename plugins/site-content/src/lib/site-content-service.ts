import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import {
  GenerateOptionsSchema,
  type GenerateOptions,
  type GenerateResult,
} from "../schemas/generate-options";
import { SiteContentOperations } from "./site-content-operations";

export class SiteContentService {
  private readonly operations: SiteContentOperations;

  constructor(pluginContext: ServicePluginContext) {
    this.operations = new SiteContentOperations(pluginContext);
  }

  async generateContent(
    options: GenerateOptions,
    toolContext?: ToolContext,
  ): Promise<GenerateResult> {
    toolContext?.signal?.throwIfAborted();
    return this.operations.generate(
      GenerateOptionsSchema.parse(options),
      toolContext,
    );
  }
}
