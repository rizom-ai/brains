import { z } from "@brains/utils/zod";
import type { MatrixFetch } from "./bot-account";

/** The localpart every brain's bot uses, so a peer's bot is `@_brain:<peer>`. */
export const BRAIN_BOT_LOCALPART = "_brain";

export interface PeerRoomsOptions {
  homeserverUrl: string;
  serverName: string;
  botUserId: string;
  botPassword: string;
  fetch?: MatrixFetch;
}

const loginSchema = z.object({ access_token: z.string().min(1) });
const roomIdSchema = z.object({ room_id: z.string().min(1) });

/**
 * The room this brain keeps for each peer it trusts: created when the peer
 * is trusted, open over federation only to this server and the peer's, with
 * the peer's bot invited; on a revoke the peer's bot is removed and the room
 * closed to its server, and the history stays.
 */
export class PeerRooms {
  private readonly base: string;
  private readonly options: PeerRoomsOptions;
  private readonly fetch: MatrixFetch;
  private accessToken: string | undefined;

  constructor(options: PeerRoomsOptions) {
    this.base = `${options.homeserverUrl.replace(/\/+$/, "")}/_matrix/client/v3`;
    this.options = options;
    this.fetch = options.fetch ?? fetch;
  }

  async trusted(domain: string): Promise<void> {
    const existing = await this.roomFor(domain);
    const acl = this.serverAcl([this.options.serverName, domain]);
    const peerBot = peerBotId(domain);
    if (!existing) {
      await this.request("POST", "/createRoom", {
        room_alias_name: aliasLocalpart(domain),
        name: domain,
        preset: "private_chat",
        invite: [peerBot],
        initial_state: [
          { type: "m.room.server_acl", state_key: "", content: acl },
        ],
      });
      return;
    }
    await this.request(
      "PUT",
      `/rooms/${encodeURIComponent(existing)}/state/m.room.server_acl/`,
      acl,
    );
    await this.request(
      "POST",
      `/rooms/${encodeURIComponent(existing)}/invite`,
      {
        user_id: peerBot,
      },
    );
  }

  async revoked(domain: string): Promise<void> {
    const existing = await this.roomFor(domain);
    if (!existing) return;
    await this.request("POST", `/rooms/${encodeURIComponent(existing)}/kick`, {
      user_id: peerBotId(domain),
      reason: "This brain no longer trusts the peer.",
    });
    await this.request(
      "PUT",
      `/rooms/${encodeURIComponent(existing)}/state/m.room.server_acl/`,
      this.serverAcl([this.options.serverName]),
    );
  }

  private serverAcl(allow: string[]): Record<string, unknown> {
    return { allow, deny: [], allow_ip_literals: false };
  }

  private async roomFor(domain: string): Promise<string | undefined> {
    const alias = `#${aliasLocalpart(domain)}:${this.options.serverName}`;
    const found = await this.request(
      "GET",
      `/directory/room/${encodeURIComponent(alias)}`,
      undefined,
      [404],
    );
    return found ? roomIdSchema.parse(found).room_id : undefined;
  }

  private async login(): Promise<string> {
    const response = await this.fetch(`${this.base}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "m.login.password",
        identifier: {
          type: "m.id.user",
          user: this.options.botUserId.slice(1).split(":")[0] ?? "",
        },
        password: this.options.botPassword,
        device_id: "brain-peer-rooms",
      }),
    });
    if (!response.ok) {
      throw new Error(`Matrix bot login failed: ${response.status}`);
    }
    return loginSchema.parse(await response.json()).access_token;
  }

  /** A JSON request as the bot; undefined when the status is one allowed. */
  private async request(
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    allowedStatuses: readonly number[] = [],
  ): Promise<unknown> {
    this.accessToken ??= await this.login();
    const response = await this.fetch(`${this.base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${this.accessToken}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (allowedStatuses.includes(response.status)) return undefined;
    if (response.status === 401) {
      // The homeserver forgot the session; the next request logs in again.
      this.accessToken = undefined;
    }
    if (!response.ok) {
      throw new Error(`Matrix ${method} ${path} failed: ${response.status}`);
    }
    return response.json();
  }
}

function aliasLocalpart(domain: string): string {
  return domain.toLowerCase().replaceAll(".", "-");
}

function peerBotId(domain: string): string {
  return `@${BRAIN_BOT_LOCALPART}:${domain}`;
}
