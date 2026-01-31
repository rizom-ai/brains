/**
 * QueueManager - Manages publish queues per entity type
 *
 * Implements Component Interface Standardization pattern.
 * Each entity type (blog-post, deck, social-post) has its own queue.
 */

export interface QueueEntry {
  entityId: string;
  entityType: string;
  position: number;
  queuedAt: string;
}

export class QueueManager {
  private static instance: QueueManager | null = null;

  // Map of entityType -> array of queue entries
  private queues: Map<string, QueueEntry[]> = new Map();

  /**
   * Get the singleton instance
   */
  public static getInstance(): QueueManager {
    QueueManager.instance ??= new QueueManager();
    return QueueManager.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    QueueManager.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(): QueueManager {
    return new QueueManager();
  }

  /**
   * Private constructor to enforce factory methods
   */
  private constructor() {}

  /**
   * Add an entity to the publish queue
   * Returns the position in queue
   */
  public async add(
    entityType: string,
    entityId: string,
  ): Promise<{ position: number }> {
    const queue = this.getOrCreateQueue(entityType);

    // Check if already in queue
    const existing = queue.find((entry) => entry.entityId === entityId);
    if (existing) {
      return { position: existing.position };
    }

    const position = queue.length + 1;
    const entry: QueueEntry = {
      entityId,
      entityType,
      position,
      queuedAt: new Date().toISOString(),
    };

    queue.push(entry);
    return { position };
  }

  /**
   * Remove an entity from the queue
   */
  public async remove(entityType: string, entityId: string): Promise<void> {
    const queue = this.queues.get(entityType);
    if (!queue) return;

    const index = queue.findIndex((entry) => entry.entityId === entityId);
    if (index === -1) return;

    queue.splice(index, 1);

    // Recalculate positions
    this.recalculatePositions(queue);
  }

  /**
   * Reorder an entity to a new position
   */
  public async reorder(
    entityType: string,
    entityId: string,
    newPosition: number,
  ): Promise<void> {
    const queue = this.queues.get(entityType);
    if (!queue) return;

    const currentIndex = queue.findIndex(
      (entry) => entry.entityId === entityId,
    );
    if (currentIndex === -1) return;

    // Remove from current position
    const [entry] = queue.splice(currentIndex, 1);
    if (!entry) return;

    // Clamp new position to valid range (1-based to 0-based index)
    const targetIndex = Math.max(0, Math.min(newPosition - 1, queue.length));

    // Insert at new position
    queue.splice(targetIndex, 0, entry);

    // Recalculate positions
    this.recalculatePositions(queue);
  }

  /**
   * List all entries in a queue
   */
  public async list(entityType: string): Promise<QueueEntry[]> {
    const queue = this.queues.get(entityType);
    if (!queue) return [];
    return [...queue];
  }

  /**
   * Get the next entry in queue (without removing)
   */
  public async getNext(entityType: string): Promise<QueueEntry | null> {
    const queue = this.queues.get(entityType);
    if (!queue || queue.length === 0) return null;
    return queue[0] ?? null;
  }

  /**
   * Get the next entry across all queues (oldest queuedAt first)
   */
  public async getNextAcrossTypes(): Promise<QueueEntry | null> {
    let oldest: QueueEntry | null = null;

    for (const queue of this.queues.values()) {
      const first = queue[0];
      if (!first) continue;

      if (!oldest || first.queuedAt < oldest.queuedAt) {
        oldest = first;
      }
    }

    return oldest;
  }

  /**
   * Pop the next entry from queue (get and remove)
   */
  public async popNext(entityType: string): Promise<QueueEntry | null> {
    const queue = this.queues.get(entityType);
    if (!queue || queue.length === 0) return null;

    const entry = queue.shift() ?? null;
    if (entry) {
      this.recalculatePositions(queue);
    }
    return entry;
  }

  /**
   * Get all registered entity types
   */
  public getRegisteredTypes(): string[] {
    return Array.from(this.queues.keys());
  }

  /**
   * Get entity types that have items in queue
   */
  public async getQueuedEntityTypes(): Promise<string[]> {
    const types: string[] = [];
    for (const [entityType, queue] of this.queues.entries()) {
      if (queue.length > 0) {
        types.push(entityType);
      }
    }
    return types;
  }

  /**
   * Get or create a queue for an entity type
   */
  private getOrCreateQueue(entityType: string): QueueEntry[] {
    let queue = this.queues.get(entityType);
    if (!queue) {
      queue = [];
      this.queues.set(entityType, queue);
    }
    return queue;
  }

  /**
   * Recalculate positions after queue modification
   */
  private recalculatePositions(queue: QueueEntry[]): void {
    queue.forEach((entry, index) => {
      entry.position = index + 1;
    });
  }
}
