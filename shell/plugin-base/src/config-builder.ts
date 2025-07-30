import { z } from "zod";

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
