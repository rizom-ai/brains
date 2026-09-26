import type { InterfaceAvailabilityOwner } from "./interface-availability";

/** Server-only owner identity; browser protocol bundles need no package names. */
export const ASK_BOX_AVAILABILITY_OWNER: InterfaceAvailabilityOwner =
  Object.freeze({
    packageName: "@brains/web-chat",
    declarationId: "web-chat",
  });
