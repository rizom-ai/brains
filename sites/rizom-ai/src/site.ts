import type { SiteDefinition } from "@rizom/site";
import { createRizomSite } from "@rizom/site-rizom";
import { AiLayout } from "./layout";
import { aiRoutes } from "./routes";
import aiSiteContent from "./site-content";

export const rizomAiSite: SiteDefinition = createRizomSite({
  packageName: "@rizom/site-rizom-ai",
  themeProfile: "product",
  layout: AiLayout,
  routes: aiRoutes,
  content: aiSiteContent,
  // The org-level indexes (/writing, /network) are hand-written routes that
  // compose the plugins' own list templates; entityDisplay just supplies the
  // labels + detail-page paths. Navigation is hidden — the layout's faces
  // strip owns the nav, so the auto-generated per-type indexes stay unlinked.
  entityDisplay: {
    post: { label: "Essay", navigation: { show: false } },
    deck: { label: "Talk", navigation: { show: false } },
    agent: { label: "Agent", navigation: { show: false } },
  },
});

export default rizomAiSite;
