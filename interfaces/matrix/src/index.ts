export { MatrixInterface } from "./plugin";
export { matrixConfigSchema } from "./schemas";
export type { MatrixConfig } from "./schemas";

// Setup utilities
export {
  registerMatrixAccount,
  type MatrixRegistrationOptions,
  type MatrixRegistrationResult,
} from "./setup/register";
