import type {
  ContentVisibility,
  IEntityAINamespace,
  OwnedEntityNearest,
} from "@brains/sdk/entities";
import { faq } from "../faq-entity";
import type { FaqEntity } from "../schemas/faq";
import { isSameQuestion } from "./faq-question";

export interface FaqMatchingDependencies {
  readonly nearest: OwnedEntityNearest;
  readonly ai: Pick<IEntityAINamespace, "generateObject">;
  readonly sameQuestionDistance: number;
}

/** At most 20 exact-visibility candidates, queried in distance order by storage. */
export async function findSameFaq(
  deps: FaqMatchingDependencies,
  request: {
    content: string;
    visibility: ContentVisibility;
    excludeIds?: readonly string[];
  },
): Promise<FaqEntity | undefined> {
  const candidates = await deps.nearest(faq, request.content, {
    visibility: request.visibility,
    maxDistance: deps.sameQuestionDistance,
    limit: 20,
    ...(request.excludeIds && { excludeIds: request.excludeIds }),
  });
  for (const { entity } of candidates) {
    if (await isSameQuestion(deps.ai, request.content, entity.content))
      return entity;
  }
  return undefined;
}
