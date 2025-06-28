/**
 * View Registry specific error classes
 * Domain-specific errors for view registry operations
 */

import { BrainsError, type ErrorCause } from "@brains/utils";

/**
 * Template not found error
 */
export class TemplateNotFoundError extends BrainsError {
  constructor(
    templateName: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `View template not found: ${templateName}`,
      "VIEW_TEMPLATE_NOT_FOUND",
      cause,
      { templateName, ...context },
    );
  }
}

/**
 * Route validation error
 */
export class RouteValidationError extends BrainsError {
  constructor(
    routeId: string,
    validationErrors: string[] | string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const errors = Array.isArray(validationErrors) 
      ? validationErrors 
      : [validationErrors];
    
    super(
      `Route validation failed for ${routeId}: ${errors.join(", ")}`,
      "ROUTE_VALIDATION_FAILED",
      cause,
      { routeId, validationErrors: errors, ...context },
    );
  }
}

/**
 * Renderer error
 */
export class RendererError extends BrainsError {
  constructor(
    rendererType: string,
    templateName?: string,
    reason?: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    const message = templateName
      ? `Renderer ${rendererType} failed for template ${templateName}${reason ? `: ${reason}` : ""}`
      : `Renderer ${rendererType} failed${reason ? `: ${reason}` : ""}`;
    
    super(message, "RENDERER_ERROR", cause, {
      rendererType,
      templateName,
      reason,
      ...context,
    });
  }
}

/**
 * View configuration error
 */
export class ViewConfigError extends BrainsError {
  constructor(
    configField: string,
    value: unknown,
    reason: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Invalid view configuration for ${configField}: ${reason}`,
      "VIEW_CONFIG_ERROR",
      cause,
      { configField, value, reason, ...context },
    );
  }
}

/**
 * Route not found error
 */
export class RouteNotFoundError extends BrainsError {
  constructor(
    path: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `Route not found: ${path}`,
      "ROUTE_NOT_FOUND",
      cause,
      { path, ...context },
    );
  }
}

/**
 * Template registration error
 */
export class ViewTemplateRegistrationError extends BrainsError {
  constructor(
    templateName: string,
    reason: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `View template registration failed for ${templateName}: ${reason}`,
      "VIEW_TEMPLATE_REGISTRATION_FAILED",
      cause,
      { templateName, reason, ...context },
    );
  }
}

/**
 * Route registration error
 */
export class ViewRouteRegistrationError extends BrainsError {
  constructor(
    routeId: string,
    reason: string,
    cause?: ErrorCause,
    context: Record<string, unknown> = {},
  ) {
    super(
      `View route registration failed for ${routeId}: ${reason}`,
      "VIEW_ROUTE_REGISTRATION_FAILED",
      cause,
      { routeId, reason, ...context },
    );
  }
}