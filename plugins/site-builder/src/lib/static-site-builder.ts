import type {
  SiteBuildContext,
  StaticSiteBuilder as EngineStaticSiteBuilder,
  StaticSiteBuilderFactory as EngineStaticSiteBuilderFactory,
  StaticSiteBuilderOptions,
} from "@brains/site-engine";
import type { SiteViewTemplate } from "./site-view-template";

export type BuildContext = SiteBuildContext<SiteViewTemplate>;
export type StaticSiteBuilder = EngineStaticSiteBuilder<BuildContext>;
export type { StaticSiteBuilderOptions };
export type StaticSiteBuilderFactory =
  EngineStaticSiteBuilderFactory<StaticSiteBuilder>;
