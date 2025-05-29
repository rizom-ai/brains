/**
 * Validation Utilities
 * 
 * This module provides utilities for validating messages against their schemas.
 * It uses the schema registry to look up the appropriate schema for a given
 * message type and validates the message against that schema.
 */

import { z } from 'zod';

import { Logger } from '@/utils/logger';

import type { DataRequestMessage, NotificationMessage } from './messageTypes';
import { 
  hasSchemaForNotificationType, 
  hasSchemaForRequestType, 
  isDataRequestMessage,
  isNotificationMessage,
  MessageSchemaRegistry,
} from './schemaRegistry';

/**
 * Options for validation functions
 */
export interface ValidationOptions {
  /** Whether to throw errors on validation failure */
  throwOnError?: boolean;
  /** Whether to log validation errors */
  logErrors?: boolean;
  /** Custom logger instance */
  logger?: Logger;
}

/**
 * Validation result type
 */
export interface ValidationResult<T> {
  /** Whether validation was successful */
  success: boolean;
  /** Parsed and validated data (if successful) */
  data?: T;
  /** Validation error (if unsuccessful) */
  error?: z.ZodError;
  /** Formatted error message */
  errorMessage?: string;
}

/**
 * Validate request parameters against their schema
 * 
 * @param message The request message to validate
 * @param options Validation options
 * @returns Validation result with parsed data or error
 */
export function validateRequestParams<T>(
  message: DataRequestMessage,
  options: ValidationOptions = {},
): ValidationResult<T> {
  // Default options
  const { 
    throwOnError = false, 
    logErrors = true,
    logger = Logger.getInstance(),
  } = options;
  
  // Check if the message is a valid request message
  if (!isDataRequestMessage(message)) {
    const errorMessage = 'Invalid message format: not a data request message';
    
    if (logErrors) {
      logger.warn(errorMessage, { message });
    }
    
    if (throwOnError) {
      throw new Error(errorMessage);
    }
    
    return {
      success: false,
      errorMessage,
    };
  }
  
  // Check if the message type has a schema
  if (!hasSchemaForRequestType(message.dataType)) {
    const errorMessage = `No schema defined for request type: ${message.dataType}`;
    
    if (logErrors) {
      logger.warn(errorMessage, { dataType: message.dataType });
    }
    
    if (throwOnError) {
      throw new Error(errorMessage);
    }
    
    return {
      success: false,
      errorMessage,
    };
  }
  
  // Get the schema from the registry
  const schema = MessageSchemaRegistry[message.dataType as keyof typeof MessageSchemaRegistry];
  
  try {
    // Parse and validate the parameters
    const params = message.parameters || {};
    const result = schema.parse(params) as T;
    
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = formatZodError(error);
      
      if (logErrors) {
        logger.warn(`Validation error for ${message.dataType}:`, { 
          error: errorMessage,
          parameters: message.parameters,
        });
      }
      
      if (throwOnError) {
        throw error;
      }
      
      return {
        success: false,
        error,
        errorMessage,
      };
    }
    
    // Non-Zod error (should not happen with well-formed messages)
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (logErrors) {
      logger.error(`Unexpected error validating ${message.dataType}:`, error);
    }
    
    if (throwOnError) {
      throw error;
    }
    
    return {
      success: false,
      errorMessage,
    };
  }
}

/**
 * Validate notification payload against its schema
 * 
 * @param message The notification message to validate
 * @param options Validation options
 * @returns Validation result with parsed data or error
 */
export function validateNotificationPayload<T>(
  message: NotificationMessage,
  options: ValidationOptions = {},
): ValidationResult<T> {
  // Default options
  const { 
    throwOnError = false, 
    logErrors = true,
    logger = Logger.getInstance(),
  } = options;
  
  // Check if the message is a valid notification message
  if (!isNotificationMessage(message)) {
    const errorMessage = 'Invalid message format: not a notification message';
    
    if (logErrors) {
      logger.warn(errorMessage, { message });
    }
    
    if (throwOnError) {
      throw new Error(errorMessage);
    }
    
    return {
      success: false,
      errorMessage,
    };
  }
  
  // Check if the message type has a schema
  if (!hasSchemaForNotificationType(message.notificationType)) {
    const errorMessage = `No schema defined for notification type: ${message.notificationType}`;
    
    if (logErrors) {
      logger.warn(errorMessage, { notificationType: message.notificationType });
    }
    
    if (throwOnError) {
      throw new Error(errorMessage);
    }
    
    return {
      success: false,
      errorMessage,
    };
  }
  
  // Get the schema from the registry
  const schema = MessageSchemaRegistry[message.notificationType as keyof typeof MessageSchemaRegistry];
  
  try {
    // Parse and validate the payload
    const payload = message.payload || {};
    const result = schema.parse(payload) as T;
    
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessage = formatZodError(error);
      
      if (logErrors) {
        logger.warn(`Validation error for ${message.notificationType}:`, { 
          error: errorMessage,
          payload: message.payload,
        });
      }
      
      if (throwOnError) {
        throw error;
      }
      
      return {
        success: false,
        error,
        errorMessage,
      };
    }
    
    // Non-Zod error (should not happen with well-formed messages)
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    if (logErrors) {
      logger.error(`Unexpected error validating ${message.notificationType}:`, error);
    }
    
    if (throwOnError) {
      throw error;
    }
    
    return {
      success: false,
      errorMessage,
    };
  }
}

/**
 * Format a Zod error into a readable message
 * 
 * @param error Zod validation error
 * @returns Formatted error message
 */
function formatZodError(error: z.ZodError): string {
  return error.errors.map(e => 
    `${e.path.join('.')}: ${e.message}`,
  ).join('; ');
}