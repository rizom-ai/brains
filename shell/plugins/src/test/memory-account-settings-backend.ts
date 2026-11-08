import { z } from "@brains/utils/zod";
import type {
  AccountSettingsBackend,
  AccountSettingsStorageIdentity,
  AccountSettingsStoredValues,
  StoredAccountSettings,
} from "../operator/account-settings-registry";

/** Account settings kept in memory, keyed as the brain's store keys them. */
export class MemoryAccountSettingsBackend implements AccountSettingsBackend {
  readonly records: Map<string, StoredAccountSettings> = new Map();

  private key(identity: AccountSettingsStorageIdentity): string {
    return JSON.stringify([
      identity.packageName,
      identity.definitionId,
      identity.actorId,
    ]);
  }

  read(
    identity: AccountSettingsStorageIdentity,
  ): Promise<StoredAccountSettings | null> {
    return Promise.resolve(this.records.get(this.key(identity)) ?? null);
  }

  list(input: {
    readonly packageName: string;
    readonly definitionId: string;
  }): Promise<
    readonly {
      readonly actorId: string;
      readonly values: AccountSettingsStoredValues;
      readonly revision: number;
    }[]
  > {
    const prefix = JSON.stringify([
      input.packageName,
      input.definitionId,
    ]).slice(0, -1);
    return Promise.resolve(
      [...this.records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({
          actorId: z
            .tuple([z.string(), z.string(), z.string()])
            .parse(JSON.parse(key))[2],
          ...value,
        })),
    );
  }

  write(
    identity: AccountSettingsStorageIdentity,
    values: AccountSettingsStoredValues,
  ): Promise<StoredAccountSettings> {
    const key = this.key(identity);
    const stored = {
      values,
      revision: (this.records.get(key)?.revision ?? 0) + 1,
    };
    this.records.set(key, stored);
    return Promise.resolve(stored);
  }

  delete(identity: AccountSettingsStorageIdentity): Promise<boolean> {
    return Promise.resolve(this.records.delete(this.key(identity)));
  }

  deleteActor(actorId: string): Promise<number> {
    let count = 0;
    for (const key of this.records.keys()) {
      const parsed = z
        .tuple([z.string(), z.string(), z.string()])
        .parse(JSON.parse(key));
      if (parsed[2] === actorId && this.records.delete(key)) count++;
    }
    return Promise.resolve(count);
  }
}
