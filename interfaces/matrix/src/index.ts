export { MatrixInterface } from "./lib/matrix-interface";
export { matrixConfigSchema } from "./schemas";
export type { MatrixConfig } from "./schemas";

// Setup utilities
export {
  registerMatrixAccount,
  type MatrixRegistrationOptions,
  type MatrixRegistrationResult,
} from "./setup/register";
