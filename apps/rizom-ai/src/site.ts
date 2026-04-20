import { AiLayout } from "./layout";
import { aiRoutes } from "./routes";

export default {
  pluginConfig: {
    themeProfile: "product",
  },
  layouts: {
    default: AiLayout,
  },
  routes: aiRoutes,
};
