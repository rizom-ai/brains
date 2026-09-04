import type { UserPermissionLevel } from "@brains/templates";

export interface GenerationStyleGuide {
  voice?: string;
  visual?: string;
}

export interface ContentGenerationConfig {
  prompt: string;
  templateName: string;
  conversationHistory?: string;
  data?: Record<string, unknown>;
  representedIdentity?: "brain" | "anchor" | "none";
  styleGuide?: GenerationStyleGuide;
  interfacePermissionGrant?: UserPermissionLevel;
}

export type GenerateContentFunction = (
  config: ContentGenerationConfig,
) => Promise<unknown>;
