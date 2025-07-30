/**
 * File system utilities for testing
 */
export declare class FileTestUtils {
  /**
   * Create a file with content
   */
  static createFile(path: string, content: string): void;
  /**
   * Create multiple files
   */
  static createFiles(basePath: string, files: Record<string, string>): void;
  /**
   * Read file content
   */
  static readFile(path: string): string;
  /**
   * Check if file exists
   */
  static exists(path: string): boolean;
  /**
   * List files in directory
   */
  static listFiles(dir: string, recursive?: boolean): string[];
  /**
   * Create directory structure
   */
  static createDirs(basePath: string, dirs: string[]): void;
  /**
   * Assert file content
   */
  static assertFileContent(
    path: string,
    expectedContent: string | RegExp,
  ): void;
  /**
   * Assert file exists
   */
  static assertExists(path: string): void;
  /**
   * Assert file does not exist
   */
  static assertNotExists(path: string): void;
  /**
   * Wait for file to exist (useful for async operations)
   */
  static waitForFile(
    path: string,
    timeout?: number,
    interval?: number,
  ): Promise<void>;
}
