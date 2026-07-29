/** Channels this package owns. Defined here so consumers depend on the
 * owner rather than on a shared contracts barrel. */

export const BUTTONDOWN_CHANNELS = {
  isConfigured: "buttondown:is-configured",
  send: "buttondown:send",
} as const;
