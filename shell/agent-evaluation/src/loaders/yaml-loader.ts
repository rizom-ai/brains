import { readdir, readFile } from "fs/promises";
import { join, extname } from "path";
import { parse } from "yaml";

import type { ITestCaseLoader } from "../types";
import type { TestCase } from "../schemas";
import { testCaseSchema } from "../schemas";

/**
 * Options for the YAML loader
 */
export interface YAMLLoaderOptions {
  /** Directory to load test cases from */
  directory: string;
  /** Whether to load recursively from subdirectories */
  recursive?: boolean;
}

/**
 * Loads test cases from YAML files
 */
export class YAMLLoader implements ITestCaseLoader {
  private options: YAMLLoaderOptions;

  constructor(options: YAMLLoaderOptions) {
    this.options = options;
  }

  /**
   * Load all test cases from the configured directory
   */
  async loadTestCases(): Promise<TestCase[]> {
    const files = await this.findYAMLFiles(this.options.directory);
    const testCases: TestCase[] = [];

    for (const file of files) {
      try {
        const testCase = await this.loadTestCase(file);
        testCases.push(testCase);
      } catch (error) {
        console.error(`Failed to load test case from ${file}:`, error);
      }
    }

    return testCases;
  }

  /**
   * Load a single test case from a YAML file
   */
  async loadTestCase(filePath: string): Promise<TestCase> {
    const content = await readFile(filePath, "utf-8");
    const parsed = parse(content);

    const result = testCaseSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `Invalid test case in ${filePath}: ${result.error.message}`,
      );
    }

    return result.data;
  }

  /**
   * Find all YAML files in a directory
   */
  private async findYAMLFiles(directory: string): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(directory, entry.name);

        if (entry.isDirectory() && this.options.recursive !== false) {
          const subFiles = await this.findYAMLFiles(fullPath);
          files.push(...subFiles);
        } else if (entry.isFile() && this.isYAMLFile(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      // Directory might not exist yet
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }

    return files;
  }

  /**
   * Check if a file is a YAML file
   */
  private isYAMLFile(filename: string): boolean {
    const ext = extname(filename).toLowerCase();
    return ext === ".yaml" || ext === ".yml";
  }

  /**
   * Create a fresh loader instance
   */
  static createFresh(options: YAMLLoaderOptions): YAMLLoader {
    return new YAMLLoader(options);
  }
}
