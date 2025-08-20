/**
 * Standardized error message utilities for consistent error formatting
 */

/**
 * Creates a registration error message
 */
export const registrationError = (
  item: string,
  type: string,
  reason?: string,
): string => {
  return `Registration failed for ${type} "${item}"${reason ? `: ${reason}` : ''}`;
};

/**
 * Creates a duplicate registration error message
 */
export const duplicateRegistrationError = (
  item: string,
  type: string,
): string => {
  return registrationError(item, type, `${type} is already registered`);
};

/**
 * Creates a not found error message
 */
export const notFoundError = (item: string, type: string): string => {
  return `${type} "${item}" not found`;
};

/**
 * Creates a validation error message
 */
export const validationError = (
  field: string,
  reason: string,
): string => {
  return `Validation failed for ${field}: ${reason}`;
};

/**
 * Creates an initialization error message
 */
export const initializationError = (
  component: string,
  reason?: string,
): string => {
  return `Failed to initialize ${component}${reason ? `: ${reason}` : ''}`;
};