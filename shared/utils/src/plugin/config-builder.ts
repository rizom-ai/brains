import { z } from "zod";
import { basePluginConfigSchema } from "./config";

/**
 * Fluent builder for creating plugin configurations
 */
export class PluginConfigBuilder {
  private fields: Record<string, z.ZodTypeAny> = {};
  private description?: string;

  /**
   * Add a required string field
   */
  requiredString(name: string, description?: string): this {
    this.fields[name] = description
      ? z.string().describe(description)
      : z.string();
    return this;
  }

  /**
   * Add an optional string field
   */
  optionalString(name: string, description?: string): this {
    this.fields[name] = description
      ? z.string().optional().describe(description)
      : z.string().optional();
    return this;
  }

  /**
   * Add a required number field
   */
  requiredNumber(
    name: string,
    options?: {
      min?: number;
      max?: number;
      int?: boolean;
      description?: string;
    },
  ): this {
    let schema = z.number();
    if (options?.int) schema = schema.int();
    if (options?.min !== undefined) schema = schema.min(options.min);
    if (options?.max !== undefined) schema = schema.max(options.max);
    if (options?.description) schema = schema.describe(options.description);
    this.fields[name] = schema;
    return this;
  }

  /**
   * Add an optional number field with default
   */
  numberWithDefault(
    name: string,
    defaultValue: number,
    options?: {
      min?: number;
      max?: number;
      int?: boolean;
      description?: string;
    },
  ): this {
    let schema = z.number();
    if (options?.int) schema = schema.int();
    if (options?.min !== undefined) schema = schema.min(options.min);
    if (options?.max !== undefined) schema = schema.max(options.max);
    if (options?.description) schema = schema.describe(options.description);
    // Apply default last to avoid type issues
    this.fields[name] = schema.default(defaultValue);
    return this;
  }

  /**
   * Add a boolean field with default
   */
  boolean(name: string, defaultValue: boolean, description?: string): this {
    this.fields[name] = description
      ? z.boolean().default(defaultValue).describe(description)
      : z.boolean().default(defaultValue);
    return this;
  }

  /**
   * Add an enum field
   */
  enum<U extends readonly [string, ...string[]]>(
    name: string,
    values: U,
    options?: {
      default?: U[number];
      description?: string;
    },
  ): this {
    let schema = z.enum(values);
    if (options?.description) schema = schema.describe(options.description);
    // Apply default last to avoid type issues
    if (options?.default) {
      this.fields[name] = schema.default(options.default);
    } else {
      this.fields[name] = schema;
    }
    return this;
  }

  /**
   * Add an array field
   */
  array<U extends z.ZodType>(
    name: string,
    itemSchema: U,
    options?: {
      default?: z.infer<U>[];
      min?: number;
      max?: number;
      description?: string;
    },
  ): this {
    let schema = z.array(itemSchema);
    if (options?.min !== undefined) schema = schema.min(options.min);
    if (options?.max !== undefined) schema = schema.max(options.max);
    if (options?.description) schema = schema.describe(options.description);
    // Apply default last to avoid type issues
    if (options?.default) {
      this.fields[name] = schema.default(options.default);
    } else {
      this.fields[name] = schema;
    }
    return this;
  }

  /**
   * Add an object field
   */
  object<U extends z.ZodRawShape>(
    name: string,
    shape: U,
    options?: {
      optional?: boolean;
      description?: string;
    },
  ): this {
    let schema = z.object(shape);
    if (options?.description) schema = schema.describe(options.description);
    // Apply optional last to avoid type issues
    if (options?.optional) {
      this.fields[name] = schema.optional();
    } else {
      this.fields[name] = schema;
    }
    return this;
  }

  /**
   * Add a custom field
   */
  custom<U extends z.ZodType>(name: string, schema: U): this {
    this.fields[name] = schema;
    return this;
  }

  /**
   * Set the description for the entire config
   */
  describe(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * Build the final configuration schema
   */
  build(): z.ZodObject<z.ZodRawShape> {
    const fullSchema = basePluginConfigSchema.extend(this.fields);
    return this.description
      ? fullSchema.describe(this.description)
      : fullSchema;
  }
}

/**
 * Create a new plugin configuration builder
 */
export function pluginConfig(): PluginConfigBuilder {
  return new PluginConfigBuilder();
}

/**
 * Helper to create tool input schemas
 */
export class ToolInputBuilder {
  private fields: Record<string, z.ZodTypeAny> = {};

  /**
   * Add a required string parameter
   */
  string(name: string): this {
    this.fields[name] = z.string();
    return this;
  }

  /**
   * Add an optional string parameter
   */
  optionalString(name: string): this {
    this.fields[name] = z.string().optional();
    return this;
  }

  /**
   * Add a required number parameter
   */
  number(name: string): this {
    this.fields[name] = z.number();
    return this;
  }

  /**
   * Add an optional number parameter
   */
  optionalNumber(name: string): this {
    this.fields[name] = z.number().optional();
    return this;
  }

  /**
   * Add a boolean parameter
   */
  boolean(name: string, defaultValue?: boolean): this {
    this.fields[name] = defaultValue
      ? z.boolean().default(defaultValue)
      : z.boolean();
    return this;
  }

  /**
   * Add an enum parameter
   */
  enum<U extends readonly [string, ...string[]]>(
    name: string,
    values: U,
    defaultValue?: U[number],
  ): this {
    this.fields[name] = defaultValue
      ? z.enum(values).default(defaultValue)
      : z.enum(values);
    return this;
  }

  /**
   * Add a custom parameter
   */
  custom<U extends z.ZodType>(name: string, schema: U): this {
    this.fields[name] = schema;
    return this;
  }

  /**
   * Build the final input schema
   */
  build(): z.ZodRawShape {
    return this.fields;
  }
}

/**
 * Create a new tool input builder
 */
export function toolInput(): ToolInputBuilder {
  return new ToolInputBuilder();
}
