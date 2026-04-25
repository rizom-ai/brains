import { FoundationLayout } from "./layout";
import { foundationRoutes } from "./routes";

export default {
  pluginConfig: {
    themeProfile: "editorial",
  },
  layouts: {
    default: FoundationLayout,
  },
  routes: foundationRoutes,
};
