import { createA2AInterface } from "./a2a-interface";

export {
  createA2AInterface,
  type A2AInterfaceDefinition,
  type A2AInterfaceDeps,
} from "./a2a-interface";
export type { A2AConfig, A2AConfigInput } from "./config";

/** The A2A interface, with the real fetch. */
const a2aInterface: ReturnType<typeof createA2AInterface> =
  createA2AInterface();

export default a2aInterface;
