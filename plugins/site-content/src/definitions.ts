import type { ComponentType, Template } from "@brains/plugins";

export interface SiteContentStringFieldDefinition {
  type: "string";
  label: string;
  optional?: boolean;
}

export interface SiteContentNumberFieldDefinition {
  type: "number";
  label: string;
  optional?: boolean;
}

export interface SiteContentEnumFieldDefinition {
  type: "enum";
  label: string;
  options: [string, ...string[]] | readonly [string, ...string[]];
  optional?: boolean;
}

export interface SiteContentObjectFieldDefinition {
  type: "object";
  label: string;
  fields: Record<string, SiteContentFieldDefinition>;
  optional?: boolean;
}

export interface SiteContentArrayFieldDefinition {
  type: "array";
  label: string;
  items:
    | SiteContentStringFieldDefinition
    | SiteContentNumberFieldDefinition
    | SiteContentEnumFieldDefinition
    | SiteContentObjectFieldDefinition;
  minItems?: number;
  length?: number;
  optional?: boolean;
}

export type SiteContentFieldDefinition =
  | SiteContentStringFieldDefinition
  | SiteContentNumberFieldDefinition
  | SiteContentEnumFieldDefinition
  | SiteContentObjectFieldDefinition
  | SiteContentArrayFieldDefinition;

export interface SiteContentSectionDefinition {
  description: string;
  title: string;
  layout: ComponentType<unknown>;
  fields: Record<string, SiteContentFieldDefinition>;
  requiredPermission?: Template["requiredPermission"];
  fullscreen?: boolean;
  runtimeScripts?: Template["runtimeScripts"];
}

export interface SiteContentDefinition {
  namespace: string;
  sections: Record<string, SiteContentSectionDefinition>;
}

export interface SiteContentPluginConfig {
  definitions?: SiteContentDefinition | SiteContentDefinition[];
}
