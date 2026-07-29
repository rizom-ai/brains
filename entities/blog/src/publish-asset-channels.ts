/** Channels this package owns. Defined here so consumers depend on the
 * owner rather than on a shared contracts barrel. */

export const PUBLISH_ASSET_CHANNELS = {
  register: "publish-assets:register",
} as const;
