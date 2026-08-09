export interface PendingDeleteTarget {
  entityType: string;
  entityId: string;
  filePath: string;
}

export class PendingDeleteRegistry {
  private readonly targets = new Map<string, PendingDeleteTarget>();

  record(target: PendingDeleteTarget): void {
    this.targets.set(this.key(target.entityType, target.entityId), target);
  }

  has(entityType: string, entityId: string): boolean {
    return this.targets.has(this.key(entityType, entityId));
  }

  complete(entityType: string, entityId: string, filePath: string): void {
    const key = this.key(entityType, entityId);
    if (this.targets.get(key)?.filePath !== filePath) return;
    this.targets.delete(key);
  }

  private key(entityType: string, entityId: string): string {
    return `${entityType}\0${entityId}`;
  }
}
