import { defineInterface, z } from "@rizom/brain/interfaces";

export const publicSourceCanary = defineInterface({
  id: "public-source-canary",
  config: z.object({}),
  setup: ({ publicSources }) => {
    const check = async (signal: AbortSignal): Promise<void> => {
      const sources = await publicSources.resolve(
        [{ entityType: "post", id: "one" }],
        signal,
      );
      const title: string | undefined = sources[0]?.title;
      void title;
      // @ts-expect-error A cancellation lifetime is required.
      void publicSources.resolve([]);
      void publicSources.resolve(
        // @ts-expect-error Source resolution does not accept citation prose or attribution.
        [{ entityType: "post", id: "one", title: "forged" }],
        signal,
      );
      void publicSources.resolve(
        // @ts-expect-error No caller-selected visibility scope.
        [{ entityType: "post", id: "one", visibilityScope: "restricted" }],
        signal,
      );
      // @ts-expect-error No raw entity service or registry authority.
      void publicSources.getEntity;
      // @ts-expect-error Detached results are not a mutable source registry.
      sources.push({ id: "forged", source: "post" });
    };
    void check;
    return {};
  },
});
