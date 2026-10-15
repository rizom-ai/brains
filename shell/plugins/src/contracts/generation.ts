import type { GenerationContext } from "@brains/content-service";
import type { UserPermissionLevel } from "@brains/templates";

export type GenerationStyleGuide = NonNullable<GenerationContext["styleGuide"]>;

export interface ContentGenerationConfig extends GenerationContext {
  prompt: string;
  templateName: string;
  interfacePermissionGrant?: UserPermissionLevel;
}

export type GenerateContentFunction = (
  config: ContentGenerationConfig,
) => Promise<unknown>;
