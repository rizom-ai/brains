import type { BaseDataSourceContext } from "@brains/plugins";
import { ASK_BOX_SCRIPT_PATH } from "@brains/contracts";

/** Only what the check reads from the registered web routes. */
export interface ChatRouteRuntime {
  webRoutes: {
    getRoutes(): ReadonlyArray<{
      pluginId: string;
      fullPath: string;
      definition: {
        public?: boolean | undefined;
        preview?: boolean | undefined;
      };
    }>;
  };
}

/**
 * Whether the homepage offers the guest chat box: Web Chat registers its
 * public box boot only while guest chat is enabled for this deployment, and
 * a preview build needs it to reach preview. Owner authorization is still
 * decided at runtime; an unauthorized box says so and the door stays.
 */
export function homepageChatAvailable(
  context: Pick<BaseDataSourceContext, "publishedOnly">,
  runtime: ChatRouteRuntime,
): boolean {
  const preview = context.publishedOnly === false;
  return runtime.webRoutes
    .getRoutes()
    .some(
      (route) =>
        route.pluginId === "web-chat" &&
        route.fullPath === ASK_BOX_SCRIPT_PATH &&
        route.definition.public === true &&
        (!preview || route.definition.preview === true),
    );
}
