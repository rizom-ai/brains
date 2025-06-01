import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";

/**
 * File system utilities for testing
 */
export class FileTestUtils {
  /**
   * Create a file with content
   */
  static createFile(path: string, content: string): void {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(path, content, "utf-8");
  }

  /**
   * Create multiple files
   */
  static createFiles(basePath: string, files: Record<string, string>): void {
    for (const [relativePath, content] of Object.entries(files)) {
      this.createFile(join(basePath, relativePath), content);
    }
  }

  /**
   * Read file content
   */
  static readFile(path: string): string {
    return readFileSync(path, "utf-8");
  }

  /**
   * Check if file exists
   */
  static exists(path: string): boolean {
    return existsSync(path);
  }

  /**
   * List files in directory
   */
  static listFiles(dir: string, recursive = false): string[] {
    if (!existsSync(dir)) {
      return [];
    }

    const files: string[] = [];
    const items = readdirSync(dir);

    for (const item of items) {
      const fullPath = join(dir, item);
      const stat = statSync(fullPath);

      if (stat.isDirectory() && recursive) {
        files.push(...this.listFiles(fullPath, true).map(f => join(item, f)));
      } else if (stat.isFile()) {
        files.push(item);
      }
    }

    return files;
  }

  /**
   * Create directory structure
   */
  static createDirs(basePath: string, dirs: string[]): void {
    for (const dir of dirs) {
      mkdirSync(join(basePath, dir), { recursive: true });
    }
  }

  /**
   * Assert file content
   */
  static assertFileContent(path: string, expectedContent: string | RegExp): void {
    const actual = this.readFile(path);
    
    if (typeof expectedContent === "string") {
      if (actual !== expectedContent) {
        throw new Error(
          `File content mismatch at ${path}\nExpected: ${expectedContent}\nActual: ${actual}`,
        );
      }
    } else {
      if (!expectedContent.test(actual)) {
        throw new Error(
          `File content does not match pattern at ${path}\nPattern: ${expectedContent}\nActual: ${actual}`,
        );
      }
    }
  }

  /**
   * Assert file exists
   */
  static assertExists(path: string): void {
    if (!existsSync(path)) {
      throw new Error(`Expected file to exist: ${path}`);
    }
  }

  /**
   * Assert file does not exist
   */
  static assertNotExists(path: string): void {
    if (existsSync(path)) {
      throw new Error(`Expected file not to exist: ${path}`);
    }
  }

  /**
   * Wait for file to exist (useful for async operations)
   */
  static async waitForFile(
    path: string,
    timeout = 5000,
    interval = 100,
  ): Promise<void> {
    const start = Date.now();

    while (!existsSync(path)) {
      if (Date.now() - start > timeout) {
        throw new Error(`Timeout waiting for file: ${path}`);
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
  }
}