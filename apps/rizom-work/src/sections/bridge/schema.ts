import { z } from "@brains/utils";

export const BridgeContentSchema = z.object({
  kicker: z.string(),
  body: z.string(),
  linkLabel: z.string(),
  linkHref: z.string(),
});

export type BridgeContent = z.infer<typeof BridgeContentSchema>;
