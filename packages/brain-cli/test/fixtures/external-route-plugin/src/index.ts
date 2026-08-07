import { z } from "@rizom/brain";
import { InterfacePlugin, type PluginFactory } from "@rizom/brain/plugins";
import type { WebRouteDefinition } from "@rizom/brain/interfaces";

const packageMetadata = {
  name: "@rizom/brain-plugin-http-route-fixture",
  version: "0.1.0",
  description: "Packed external handler-route characterization fixture",
};

class ExternalRouteInterface extends InterfacePlugin<
  Record<string, never>,
  Record<string, never>
> {
  constructor() {
    super("external-route", packageMetadata, {}, z.object({}));
  }

  override getWebRoutes(): WebRouteDefinition[] {
    return [
      {
        path: "/external-route",
        method: "GET",
        public: true,
        handler: (request) =>
          Response.json({
            source: "packed-external-interface",
            path: new URL(request.url).pathname,
          }),
      },
    ];
  }
}

export const plugin: PluginFactory = () => new ExternalRouteInterface();
export default plugin;
