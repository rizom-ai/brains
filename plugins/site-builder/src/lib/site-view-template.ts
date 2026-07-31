import type { VNode } from "preact";
import type { JsonObject } from "@brains/contracts";
import type { SiteRuntimeScript } from "@brains/site-engine";
import type { ZodType } from "@brains/utils/zod";

type SiteViewTemplateSchema = ZodType<JsonObject, unknown>;

export interface SiteViewTemplate {
  name: string;
  schema: SiteViewTemplateSchema;
  pluginId: string;
  renderers: {
    web?: ((props: JsonObject) => VNode) | string;
    image?: ((props: JsonObject) => VNode) | string;
    pdf?: ((props: JsonObject) => VNode) | string;
  };
  fullscreen?: boolean;
  runtimeScripts?: SiteRuntimeScript[];
  /** Files behind runtimeScripts srcs, keyed by output-relative path. */
  staticAssets?: Record<string, string>;
}
