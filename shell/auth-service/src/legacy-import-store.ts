import { eq } from "drizzle-orm";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { authLegacyImports } from "./runtime-schema";

export const LEGACY_AUTH_FILES_IMPORT = "legacy-auth-files-v1";
export const LEGACY_SETUP_DELIVERIES_IMPORT = "legacy-setup-deliveries-v1";

export class LegacyAuthImportStore {
  private readonly database: AuthRuntimeDatabase;

  constructor(database: AuthRuntimeDatabase) {
    this.database = database;
  }

  async isComplete(source: string): Promise<boolean> {
    await this.database.start();
    const [record] = await this.database.db
      .select({ source: authLegacyImports.source })
      .from(authLegacyImports)
      .where(eq(authLegacyImports.source, source))
      .limit(1);
    return record !== undefined;
  }

  async markComplete(source: string): Promise<void> {
    await this.database.start();
    await this.database.db
      .insert(authLegacyImports)
      .values({ source, completedAt: Date.now() })
      .onConflictDoNothing();
  }
}
