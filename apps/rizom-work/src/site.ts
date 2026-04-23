import { WorkLayout } from "./layout";
import { workRoutes } from "./routes";

export default {
  pluginConfig: {
    themeProfile: "studio",
  },
  layouts: {
    default: WorkLayout,
  },
  routes: workRoutes,
};
