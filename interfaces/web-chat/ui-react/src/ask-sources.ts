import {
  getGuestSourceCards,
  type AskSourcesDetail,
} from "@brains/contracts/chat";

/** The sources a completed answer drew on, once each, as the host event carries them. */
export function askSourcesDetail(cards: unknown[]): AskSourcesDetail {
  const sources = getGuestSourceCards(cards).flatMap((card) => card.sources);
  const seen = new Set<string>();
  return {
    sources: sources.flatMap((source) => {
      if (seen.has(source.id)) return [];
      seen.add(source.id);
      // The shared card normalizer names an untitled source by its entity id.
      return [{ id: source.id, title: source.title ?? source.id }];
    }),
  };
}
