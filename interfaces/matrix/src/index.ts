export { MatrixInterface } from "./plugin";
export { MatrixInterfaceV2 } from "./lib/matrix-interface-v2";
export { matrixConfigSchema } from "./schemas";
export type { MatrixConfig } from "./schemas";

// Setup utilities
export {
  registerMatrixAccount,
  type MatrixRegistrationOptions,
  type MatrixRegistrationResult,
} from "./setup/register";
