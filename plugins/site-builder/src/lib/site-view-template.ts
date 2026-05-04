import type { VNode } from "preact";
import type { z } from "@brains/utils";
import type { SiteRuntimeScript } from "@brains/site-engine";

export interface SiteViewTemplate {
  name: string;
  schema: z.ZodType<unknown>;
  pluginId: string;
  renderers: {
    web?: ((props: Record<string, unknown>) => VNode) | string;
  };
  fullscreen?: boolean;
  runtimeScripts?: SiteRuntimeScript[];
}
