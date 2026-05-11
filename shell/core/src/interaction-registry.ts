import type { InteractionInfo, InteractionInfoInput } from "@brains/plugins";
import { interactionInfoSchema } from "@brains/plugins";

export class InteractionRegistry {
  private readonly interactions: InteractionInfo[] = [];

  public register(interaction: InteractionInfoInput): void {
    const parsed = interactionInfoSchema.parse(interaction);
    this.interactions.push(parsed);
  }

  public list(): InteractionInfo[] {
    return [...this.interactions].sort(
      (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
    );
  }
}
