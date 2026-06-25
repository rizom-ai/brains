import type { VNode } from "preact";
import type { z } from "@brains/utils/zod";
import type { ZodType as ZodV4Type } from "@brains/utils/zod-v4";
import type { SiteRuntimeScript } from "@brains/site-engine";

type SiteViewTemplateSchema =
  | z.ZodType<unknown, z.ZodTypeDef, unknown>
  | ZodV4Type<unknown, unknown>;

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
