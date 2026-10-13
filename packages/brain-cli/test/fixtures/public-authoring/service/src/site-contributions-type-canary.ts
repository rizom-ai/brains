import { defineServicePlugin, z } from "@rizom/brain/services";

// Packed type coverage only; this declaration is not installed by the fixture.
export const siteContributionsTypeCanary = defineServicePlugin({
  id: "site-contributions",
  config: z.object({}),
  setup: ({ siteContributions, messaging }) => {
    const read = async (signal: AbortSignal): Promise<readonly string[]> =>
      siteContributions.headScripts(signal);
    const unsupported = (): void => {
      // @ts-expect-error No arbitrary-topic collector is exposed.
      void messaging.collect({ type: "private:topic", payload: {} });
      void siteContributions.headScripts({
        // @ts-expect-error Contribution readers accept cancellation, not routing or identity.
        topic: "private:topic",
        sender: "forged",
      });
      // @ts-expect-error The native bus is not exposed through contributions.
      void siteContributions.send({});
    };
    return { read, unsupported };
  },
});
