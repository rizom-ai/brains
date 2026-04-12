import { createTemplate } from "@brains/templates";
import { BridgeContentSchema, type BridgeContent } from "./schema";
import { BridgeLayout } from "./layout";
import { bridgeFormatter } from "./formatter";

export const bridgeTemplate = createTemplate<BridgeContent>({
  name: "bridge",
  description: "Rizom bridge section — connective link to adjacent site",
  schema: BridgeContentSchema,
  formatter: bridgeFormatter,
  requiredPermission: "public",
  layout: { component: BridgeLayout },
});
