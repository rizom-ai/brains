/**
 * Utility class for configuration management with proper type safety
 * 
 * Implements the Component Interface Standardization pattern with:
 * - getInstance(): Returns the singleton instance
 * - resetInstance(): Resets the singleton instance (mainly for testing)
 * - createFresh(): Creates a new instance without affecting the singleton
 */

export class ConfigUtils {
  /** The singleton instance */
  private static instance: ConfigUtils | null = null;
  
  /**
   * Get the singleton instance of ConfigUtils
   */
  public static getInstance(): ConfigUtils {
    if (!ConfigUtils.instance) {
      ConfigUtils.instance = new ConfigUtils();
    }
    return ConfigUtils.instance;
  }
  
  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    ConfigUtils.instance = null;
  }
  
  /**
   * Create a fresh instance (primarily for testing)
   */
  public static createFresh(): ConfigUtils {
    return new ConfigUtils();
  }
  
  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor() {}
  
  /**
   * Safely access environment variables with proper typing
   * @param key - The environment variable key to access
   * @param defaultValue - Optional default value if environment variable is not set
   * @returns The environment variable value or the default value
   */
  public getEnv(key: string, defaultValue = ''): string {
    return process.env[key] || defaultValue;
  }
  
  /**
   * Parse an environment variable as an integer
   * @param key - The environment variable key to access
   * @param defaultValue - Default value to use if environment variable is not set or invalid
   * @returns The parsed integer value
   */
  public getEnvAsInt(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  
  /**
   * Parse an environment variable as a float
   * @param key - The environment variable key to access
   * @param defaultValue - Default value to use if environment variable is not set or invalid
   * @returns The parsed float value
   */
  public getEnvAsFloat(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }
  
  /**
   * Parse an environment variable as a boolean
   * @param key - The environment variable key to access
   * @param defaultValue - Default value to use if environment variable is not set
   * @returns The parsed boolean value
   */
  public getEnvAsBool(key: string, defaultValue: boolean): boolean {
    const value = process.env[key]?.toLowerCase();
    
    if (value === undefined || value === '') return defaultValue;
    return value === 'true' || value === '1' || value === 'yes';
  }
}

// Export the singleton instance methods as functions for backward compatibility
/**
 * Safely access environment variables with proper typing
 * @param key - The environment variable key to access
 * @param defaultValue - Optional default value if environment variable is not set
 * @returns The environment variable value or the default value
 */
export function getEnv(key: string, defaultValue = ''): string {
  return ConfigUtils.getInstance().getEnv(key, defaultValue);
}

/**
 * Parse an environment variable as an integer
 * @param key - The environment variable key to access
 * @param defaultValue - Default value to use if environment variable is not set or invalid
 * @returns The parsed integer value
 */
export function getEnvAsInt(key: string, defaultValue: number): number {
  return ConfigUtils.getInstance().getEnvAsInt(key, defaultValue);
}

/**
 * Parse an environment variable as a float
 * @param key - The environment variable key to access
 * @param defaultValue - Default value to use if environment variable is not set or invalid
 * @returns The parsed float value
 */
export function getEnvAsFloat(key: string, defaultValue: number): number {
  return ConfigUtils.getInstance().getEnvAsFloat(key, defaultValue);
}

/**
 * Parse an environment variable as a boolean
 * @param key - The environment variable key to access
 * @param defaultValue - Default value to use if environment variable is not set
 * @returns The parsed boolean value
 */
export function getEnvAsBool(key: string, defaultValue: boolean): boolean {
  return ConfigUtils.getInstance().getEnvAsBool(key, defaultValue);
}

/**
 * Check if the application is running in test environment
 * @returns true if NODE_ENV is set to 'test', false otherwise
 */
export function isTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Check if the application is running in production environment
 * @returns true if NODE_ENV is set to 'production', false otherwise
 */
export function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if the application is running in development environment
 * @returns true if NODE_ENV is set to 'development' or not set, false otherwise
 */
export function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
}