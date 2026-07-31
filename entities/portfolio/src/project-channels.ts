/** Channels this package owns. Defined here so consumers depend on the
 * owner rather than on a shared contracts barrel. */

export const PROJECT_CHANNELS = {
  generation: "project:generation",
} as const;
