import type { BaseEntity } from "@brains/types";
/**
 * Extended entity type for testing that includes common fields
 */
export interface TestEntity extends BaseEntity {
  title?: string;
  tags?: string[];
}
/**
 * Generate test entity data
 */
export declare class TestDataGenerator {
  private static counter;
  /**
   * Generate a unique ID
   */
  static id(prefix?: string): string;
  /**
   * Generate a unique counter
   */
  static count(): number;
  /**
   * Generate test note data
   */
  static note(overrides?: Partial<TestEntity>): Partial<TestEntity>;
  /**
   * Generate multiple test notes
   */
  static notes(
    count: number,
    overrides?: Partial<TestEntity>,
  ): Array<Partial<TestEntity>>;
  /**
   * Generate test article data
   */
  static article(options: {
    title: string;
    sections: string[];
  }): Partial<TestEntity>;
  /**
   * Generate markdown content
   */
  static markdown(options?: {
    headers?: string[];
    paragraphs?: number;
    lists?: boolean;
    code?: boolean;
  }): string;
  /**
   * Generate test tags
   */
  static tags(count?: number): string[];
  /**
   * Generate entity with full TestEntity fields
   */
  static entity(overrides?: Partial<TestEntity>): TestEntity;
  /**
   * Generate entity batch
   */
  static entityBatch(
    entityType: string,
    count: number,
    baseOverrides?: Partial<TestEntity>,
  ): TestEntity[];
  /**
   * Generate random content
   */
  static randomContent(length: number): string;
  /**
   * Generate random date in range
   */
  static randomDate(start: Date, end: Date): string;
  /**
   * Generate a date in the past
   */
  static pastDate(daysAgo?: number): string;
  /**
   * Generate a date in the future
   */
  static futureDate(daysAhead?: number): string;
  /**
   * Reset the counter
   */
  static reset(): void;
}
