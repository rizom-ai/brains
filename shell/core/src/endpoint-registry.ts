import type { EndpointInfo, EndpointInfoInput } from "@brains/plugins";
import { endpointInfoSchema } from "@brains/plugins";
import { PrioritizedRegistry } from "./prioritized-registry";

export class EndpointRegistry extends PrioritizedRegistry<
  EndpointInfoInput,
  EndpointInfo
> {
  constructor() {
    super(
      (input) => endpointInfoSchema.parse(input),
      (endpoint) => endpoint.url,
    );
  }
}
