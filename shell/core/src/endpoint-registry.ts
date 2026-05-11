import type { EndpointInfo, EndpointInfoInput } from "@brains/plugins";
import { endpointInfoSchema } from "@brains/plugins";

export class EndpointRegistry {
  private readonly endpoints: EndpointInfo[] = [];

  public register(endpoint: EndpointInfoInput): void {
    const parsed = endpointInfoSchema.parse(endpoint);
    this.endpoints.push(parsed);
  }

  public list(): EndpointInfo[] {
    return [...this.endpoints].sort(
      (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
    );
  }
}
