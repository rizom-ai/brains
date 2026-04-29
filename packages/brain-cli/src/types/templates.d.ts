import type { z } from "./utils";

export type ComponentType<P = Record<string, unknown>> = (props: P) => unknown;
export interface RuntimeScript {
  src: string;
  type?: "module" | "text/javascript";
  defer?: boolean;
}
export interface TemplateInput<T = unknown> {
  name: string;
  schema?: z.ZodType<T>;
  formatter?: (data: T) => string;
  parser?: (content: string) => T;
  component?: ComponentType<{ data: T }>;
  runtimeScripts?: RuntimeScript[];
}
export interface Template<T = unknown> extends TemplateInput<T> {
  name: string;
}
export const TemplateSchema: z.ZodSchema<Template>;
export function createTemplate<T = unknown>(
  input: TemplateInput<T>,
): Template<T>;
export function createTypedComponent<P>(
  component: ComponentType<P>,
): ComponentType<P>;

export type OutputFormat = "html" | "markdown" | "text" | string;
export type WebRenderer<T = unknown> = (props: {
  data: T;
  [key: string]: unknown;
}) => unknown;
export interface ViewTemplate<T = unknown> {
  name: string;
  schema?: z.ZodType<T>;
  renderers?: Record<string, WebRenderer<T>>;
  runtimeScripts?: RuntimeScript[];
}
export interface ViewTemplateRegistry {
  get<T = unknown>(name: string): ViewTemplate<T> | undefined;
  list(): ViewTemplate[];
}
export const ViewTemplateSchema: z.ZodSchema<ViewTemplate>;

export interface SiteBuilderOptions {
  outputDir?: string;
  baseUrl?: string;
  [key: string]: unknown;
}
export interface BuildResult {
  success: boolean;
  outputDir?: string;
  pages?: number;
  errors?: string[];
}
export type SiteContentEntityType = string;
export interface SiteBuilder {
  build(options?: SiteBuilderOptions): Promise<BuildResult>;
}
export const SiteBuilderOptionsSchema: z.ZodSchema<SiteBuilderOptions>;
export const BuildResultSchema: z.ZodSchema<BuildResult>;
export const SiteContentEntityTypeSchema: z.ZodSchema<SiteContentEntityType>;
