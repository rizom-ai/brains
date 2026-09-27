import type { ReactElement } from "react";
import type { JsonObject } from "@brains/contracts";
import type { SiteRuntimeScript } from "@brains/site-engine";
import type { ZodType } from "@brains/utils/zod";

type SiteViewTemplateSchema = ZodType<JsonObject, unknown>;

export interface SiteViewTemplate {
  name: string;
  schema: SiteViewTemplateSchema;
  pluginId: string;
  renderers: {
    web?: ((props: JsonObject) => ReactElement) | string;
    image?: ((props: JsonObject) => ReactElement) | string;
    pdf?: ((props: JsonObject) => ReactElement) | string;
  };
  fullscreen?: boolean;
  runtimeScripts?: SiteRuntimeScript[];
  /** Files behind runtimeScripts srcs, keyed by output-relative path. */
  staticAssets?: Record<string, string>;
}
