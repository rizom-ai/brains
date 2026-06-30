import type { VNode } from "preact";
import type { SiteRuntimeScript } from "@brains/site-engine";
import type { ZodType } from "@brains/utils/zod-v4";

type SiteViewTemplateSchema = ZodType<unknown, unknown>;

export interface SiteViewTemplate {
  name: string;
  schema: SiteViewTemplateSchema;
  pluginId: string;
  renderers: {
    web?: ((props: Record<string, unknown>) => VNode) | string;
    image?: ((props: Record<string, unknown>) => VNode) | string;
    pdf?: ((props: Record<string, unknown>) => VNode) | string;
  };
  fullscreen?: boolean;
  runtimeScripts?: SiteRuntimeScript[];
}
