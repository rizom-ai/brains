/**
 * Utility functions for path operations
 * Centralizes access to file system paths and provides consistent abstractions
 */

import * as path from 'path';

/**
 * Get the project root directory
 * @returns The absolute path to the project root
 */
export function getProjectRoot(): string {
  return process.cwd();
}

/**
 * Resolve a path relative to the project root
 * @param relativePath - The path relative to the project root
 * @returns The absolute path
 */
export function resolveProjectPath(relativePath: string): string {
  return path.join(getProjectRoot(), relativePath);
}

/**
 * Resolve a path relative to a base directory
 * @param basePath - The base directory path
 * @param relativePath - The path relative to the base directory
 * @returns The absolute path
 */
export function resolvePath(basePath: string, relativePath: string): string {
  return path.join(basePath, relativePath);
}

/**
 * Normalize a path to use the correct platform-specific separators
 * @param filePath - The path to normalize
 * @returns The normalized path
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

/**
 * Check if a path is absolute
 * @param filePath - The path to check
 * @returns true if the path is absolute, false otherwise
 */
export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

/**
 * Get the directory name of a path
 * @param filePath - The file path
 * @returns The directory name
 */
export function getDirName(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Get the file name from a path
 * @param filePath - The file path
 * @returns The file name
 */
export function getFileName(filePath: string): string {
  return path.basename(filePath);
}

/**
 * Get the file extension from a path
 * @param filePath - The file path
 * @returns The file extension
 */
export function getFileExtension(filePath: string): string {
  return path.extname(filePath);
}