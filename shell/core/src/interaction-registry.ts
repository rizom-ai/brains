import type { InteractionInfo, InteractionInfoInput } from "@brains/plugins";
import { interactionInfoSchema } from "@brains/plugins";
import { PrioritizedRegistry } from "./prioritized-registry";

export class InteractionRegistry extends PrioritizedRegistry<
  InteractionInfoInput,
  InteractionInfo
> {
  constructor() {
    super(
      (input) => interactionInfoSchema.parse(input),
      (interaction) => interaction.id,
    );
  }
}
