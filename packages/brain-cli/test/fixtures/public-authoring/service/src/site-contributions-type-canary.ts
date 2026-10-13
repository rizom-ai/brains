import { defineServicePlugin, z } from "@rizom/brain/services";

// Packed type coverage only; this declaration is not installed by the fixture.
export const siteContributionsTypeCanary = defineServicePlugin(
  {
    id: "site-contributions",
    config: z.object({}),
    setup: ({ siteContributions, messaging }) => {
      const read = async (signal: AbortSignal): Promise<readonly string[]> =>
        siteContributions.headScripts(signal);
      const slots = async (signal: AbortSignal): Promise<string[]> =>
        siteContributions.withSlots(signal, async (entries) =>
          entries.map((entry) => entry.pluginId),
        );
      const unsupported = (): void => {
        // @ts-expect-error Slots have a callback scope, not an unbounded read/registry.
        void siteContributions.slots();
        // @ts-expect-error A build signal is required.
        void siteContributions.withSlots(async () => []);
        void siteContributions.withSlots(
          new AbortController().signal,
          async (entries) => {
            const first = entries[0];
            if (first) {
              // @ts-expect-error Installed ownership is readonly.
              first.pluginId = "forged";
            }
          },
        );
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
      return { read, slots, unsupported };
    },
  },
  {
    layoutSlots: () => [{ slotName: "footer-top", render: (): null => null }],
  },
);
