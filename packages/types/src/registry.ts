/**
 * Factory function type for creating components
 */
export type ComponentFactory<T> = (...args: unknown[]) => T;

/**
 * Registry interface for managing components
 */
export interface Registry {
  register<T>(id: string, factory: ComponentFactory<T>): void;
  resolve<T>(id: string, ...args: unknown[]): T;
  has(id: string): boolean;
  getAll(): string[];
  clear(): void;
  unregister(id: string): void;
  createFresh<T>(id: string, ...args: unknown[]): T;
}