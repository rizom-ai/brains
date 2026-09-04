import type {
  AccountSettingsBackend,
  AccountSettingsStorageIdentity,
  AccountSettingsStoredValues,
  StoredAccountSettings,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { and, eq } from "drizzle-orm";
import type { AuthRuntimeDB } from "./runtime-db";
import { authAccountPluginSettings } from "./runtime-schema";

const storedValuesSchema: z.ZodRecord<
  z.ZodString,
  z.ZodUnion<readonly [z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull]>
> = z.record(
  z.string(),
  z.union([z.string(), z.number().finite(), z.boolean(), z.null()]),
);

function encoded(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

function decoded(value: string): ArrayBuffer {
  return Uint8Array.from(Buffer.from(value, "base64url")).buffer;
}

function additionalData(
  identity: AccountSettingsStorageIdentity,
  revision: number,
): ArrayBuffer {
  return Uint8Array.from(
    new TextEncoder().encode(
      JSON.stringify([
        identity.packageName,
        identity.definitionId,
        identity.actorId,
        revision,
      ]),
    ),
  ).buffer;
}

/** Auth-DB persistence with authenticated encryption for every stored field. */
export class AuthAccountSettingsStore implements AccountSettingsBackend {
  private readonly db: AuthRuntimeDB;
  private readonly key: Promise<CryptoKey>;

  constructor(db: AuthRuntimeDB, encryptionSecret: string) {
    if (Buffer.byteLength(encryptionSecret, "utf8") < 32) {
      throw new Error(
        "Account settings encryption key must contain at least 32 characters",
      );
    }
    this.db = db;
    this.key = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(encryptionSecret))
      .then((raw) =>
        crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
          "encrypt",
          "decrypt",
        ]),
      );
  }

  async read(
    identity: AccountSettingsStorageIdentity,
  ): Promise<StoredAccountSettings | null> {
    const [record] = await this.db
      .select()
      .from(authAccountPluginSettings)
      .where(identityPredicate(identity))
      .limit(1);
    return record
      ? {
          values: await this.decrypt(identity, record.revision, record.payload),
          revision: record.revision,
        }
      : null;
  }

  async list(input: {
    readonly packageName: string;
    readonly definitionId: string;
  }): Promise<
    readonly {
      readonly actorId: string;
      readonly values: AccountSettingsStoredValues;
      readonly revision: number;
    }[]
  > {
    const records = await this.db
      .select()
      .from(authAccountPluginSettings)
      .where(
        and(
          eq(authAccountPluginSettings.packageName, input.packageName),
          eq(authAccountPluginSettings.definitionId, input.definitionId),
        ),
      )
      .orderBy(authAccountPluginSettings.actorId);
    return Promise.all(
      records.map(async (record) => {
        const identity = {
          ...input,
          actorId: record.actorId,
        } satisfies AccountSettingsStorageIdentity;
        return {
          actorId: record.actorId,
          values: await this.decrypt(identity, record.revision, record.payload),
          revision: record.revision,
        };
      }),
    );
  }

  async write(
    identity: AccountSettingsStorageIdentity,
    values: AccountSettingsStoredValues,
  ): Promise<StoredAccountSettings> {
    const parsed = Object.freeze(storedValuesSchema.parse(values));
    return this.db.transaction(async (tx) => {
      const [current] = await tx
        .select({ revision: authAccountPluginSettings.revision })
        .from(authAccountPluginSettings)
        .where(identityPredicate(identity))
        .limit(1);
      const revision = (current?.revision ?? 0) + 1;
      const payload = await this.encrypt(identity, revision, parsed);
      const now = Date.now();
      await tx
        .insert(authAccountPluginSettings)
        .values({
          packageName: identity.packageName,
          definitionId: identity.definitionId,
          actorId: identity.actorId,
          payload,
          revision,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            authAccountPluginSettings.packageName,
            authAccountPluginSettings.definitionId,
            authAccountPluginSettings.actorId,
          ],
          set: { payload, revision, updatedAt: now },
        });
      return { values: parsed, revision };
    });
  }

  async delete(identity: AccountSettingsStorageIdentity): Promise<boolean> {
    const deleted = await this.db
      .delete(authAccountPluginSettings)
      .where(identityPredicate(identity))
      .returning({ actorId: authAccountPluginSettings.actorId });
    return deleted.length > 0;
  }

  async deleteActor(actorId: string): Promise<number> {
    const deleted = await this.db
      .delete(authAccountPluginSettings)
      .where(eq(authAccountPluginSettings.actorId, actorId))
      .returning({ actorId: authAccountPluginSettings.actorId });
    return deleted.length;
  }

  private async encrypt(
    identity: AccountSettingsStorageIdentity,
    revision: number,
    values: AccountSettingsStoredValues,
  ): Promise<string> {
    const iv = Uint8Array.from(crypto.getRandomValues(new Uint8Array(12)));
    const ciphertext = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: additionalData(identity, revision),
      },
      await this.key,
      Uint8Array.from(new TextEncoder().encode(JSON.stringify(values))),
    );
    return `${encoded(iv)}.${encoded(new Uint8Array(ciphertext))}`;
  }

  private async decrypt(
    identity: AccountSettingsStorageIdentity,
    revision: number,
    payload: string,
  ): Promise<AccountSettingsStoredValues> {
    const [encodedIv, encodedCiphertext, extra] = payload.split(".");
    if (!encodedIv || !encodedCiphertext || extra !== undefined) {
      throw new Error("Stored account settings payload is invalid");
    }
    try {
      const plaintext = await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: decoded(encodedIv),
          additionalData: additionalData(identity, revision),
        },
        await this.key,
        decoded(encodedCiphertext),
      );
      const parsedValues: unknown = JSON.parse(
        new TextDecoder().decode(plaintext),
      );
      return Object.freeze(storedValuesSchema.parse(parsedValues));
    } catch {
      throw new Error(
        `Stored account settings for "${identity.packageName}:${identity.definitionId}" could not be decrypted`,
      );
    }
  }
}

function identityPredicate(
  identity: AccountSettingsStorageIdentity,
): ReturnType<typeof and> {
  return and(
    eq(authAccountPluginSettings.packageName, identity.packageName),
    eq(authAccountPluginSettings.definitionId, identity.definitionId),
    eq(authAccountPluginSettings.actorId, identity.actorId),
  );
}
