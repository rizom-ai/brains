/** Channels this package owns. Defined here so consumers depend on the
 * owner rather than on a shared contracts barrel. */

export const SERIES_CHANNELS = {
  project: "series:project",
} as const;
