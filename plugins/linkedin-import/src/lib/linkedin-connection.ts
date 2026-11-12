import {
  defineAccountSettings,
  type AccountSettingsRegistration,
  type AccountSettingsRegistry,
} from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { LinkedInToken } from "./linkedin-oauth";

const linkedInAccountSettings = defineAccountSettings({
  title: "LinkedIn",
  description:
    "The LinkedIn connection the LinkedIn import reads your profile with. Connect from the LinkedIn workspace, or paste a member token with the r_dma_portability_3rd_party scope.",
  schema: z.object({
    accessToken: z.string().trim().min(1),
    expiresAt: z.iso.datetime().optional(),
  }),
  fields: {
    accessToken: { label: "Access token", secret: true },
    expiresAt: { label: "Expires (ISO date and time)" },
  },
});

type LinkedInAccountSettings = typeof linkedInAccountSettings;

export interface StoredConnection {
  accessToken: string;
  expiresAt?: string | undefined;
}

/** The Anchor's LinkedIn token, kept encrypted in their account settings. */
export class LinkedInConnections {
  private readonly registry: AccountSettingsRegistry;
  private readonly registration: AccountSettingsRegistration<LinkedInAccountSettings>;

  constructor(
    registry: AccountSettingsRegistry,
    owner: { pluginId: string; packageName: string },
  ) {
    this.registry = registry;
    this.registration = registry.register({
      ownerPluginId: owner.pluginId,
      packageName: owner.packageName,
      definitionId: "linkedin",
      definition: linkedInAccountSettings,
    });
  }

  async get(userId: string): Promise<StoredConnection | null> {
    return this.registry.getForActor(this.registration, userId);
  }

  async save(userId: string, token: LinkedInToken): Promise<void> {
    await this.registry.save(this.registration.id, userId, {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
    });
  }

  async forget(userId: string): Promise<void> {
    await this.registry.delete(this.registration.id, userId);
  }
}

export function isExpired(
  connection: StoredConnection,
  now: number = Date.now(),
): boolean {
  return (
    connection.expiresAt !== undefined &&
    Date.parse(connection.expiresAt) <= now
  );
}
