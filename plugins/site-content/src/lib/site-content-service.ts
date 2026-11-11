import type { ToolContext } from "@brains/plugins";
import {
  GenerateOptionsSchema,
  type GenerateOptions,
  type GenerateResult,
} from "../schemas/generate-options";
import {
  SiteContentOperations,
  type SiteContentOperationsDeps,
} from "./site-content-operations";

export class SiteContentService {
  private readonly operations: SiteContentOperations;

  constructor(deps: SiteContentOperationsDeps) {
    this.operations = new SiteContentOperations(deps);
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
