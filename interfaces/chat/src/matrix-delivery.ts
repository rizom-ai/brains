import { z } from "@brains/utils/zod";
import type {
  ChannelDeliveryInput,
  ChannelDeliveryResult,
} from "@brains/sdk/internal/interface-runtime";

/** A full Matrix user id: `@localpart:server`, with an optional port. */
export const MATRIX_USER_ID_PATTERN: RegExp =
  /^@[a-z0-9._=/+-]+:[A-Za-z0-9.-]+(:[0-9]+)?$/;

/**
 * The device delivery logs in on. A fixed id keeps one device for delivery
 * however often the brain restarts, apart from the device the chat adapter
 * syncs on.
 */
const DELIVERY_DEVICE_ID = "brain-delivery";

type MatrixFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface MatrixDeliveryOptions {
  baseUrl: string;
  /** The bot's full Matrix user id. */
  userId: string;
  password: string;
  fetch?: MatrixFetch;
}

const loginResponseSchema = z.object({ access_token: z.string().min(1) });
const matrixErrorSchema = z.object({ errcode: z.string() });
const directRoomsSchema = z.record(z.string(), z.array(z.string()));
const createRoomResponseSchema = z.object({ room_id: z.string().min(1) });
const sendResponseSchema = z.object({ event_id: z.string().min(1) });

class MatrixRequestError extends Error {
  readonly status: number;
  readonly errcode: string | undefined;

  constructor(status: number, errcode: string | undefined) {
    super(`Matrix request failed: ${status} ${errcode ?? ""}`.trim());
    this.name = "MatrixRequestError";
    this.status = status;
    this.errcode = errcode;
  }
}

class MatrixLoginError extends MatrixRequestError {}

/**
 * Delivery over the Matrix client-server API, for invitations and
 * notifications. It talks to the homeserver directly rather than through the
 * chat adapter, because background jobs deliver from the worker, where no
 * Matrix sync runs. Direct rooms are recorded in the bot's `m.direct` account
 * data, the list the chat adapter's `openDM` reads, so both use one room per
 * person.
 */
export class MatrixDelivery {
  private readonly baseUrl: string;
  private readonly userId: string;
  private readonly localpart: string;
  private readonly password: string;
  private readonly fetch: MatrixFetch;
  private accessToken: string | undefined;

  constructor(options: MatrixDeliveryOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.userId = options.userId;
    this.localpart = options.userId.slice(1).split(":")[0] ?? "";
    this.password = options.password;
    this.fetch = options.fetch ?? fetch;
  }

  async send(input: ChannelDeliveryInput): Promise<ChannelDeliveryResult> {
    if (!MATRIX_USER_ID_PATTERN.test(input.recipient)) {
      return { status: "failed", failureCode: "matrix:invalid-recipient" };
    }
    try {
      const eventId = await this.withSession(async () => {
        const roomId = await this.directRoom(input.recipient);
        return this.sendText(
          roomId,
          input.idempotencyKey,
          [input.subject, input.text].filter(Boolean).join("\n\n"),
        );
      });
      return { status: "sent", providerDeliveryId: eventId };
    } catch (error) {
      if (error instanceof MatrixLoginError) {
        return {
          status: "failed",
          failureCode: `matrix:login:${error.errcode ?? error.status}`,
        };
      }
      if (error instanceof MatrixRequestError) {
        return {
          status: "failed",
          failureCode: `matrix:${error.errcode ?? error.status}`,
        };
      }
      throw error;
    }
  }

  /** Run with a token, logging in again once if the homeserver forgot it. */
  private async withSession<T>(operation: () => Promise<T>): Promise<T> {
    this.accessToken ??= await this.login();
    try {
      return await operation();
    } catch (error) {
      if (!(error instanceof MatrixRequestError) || error.status !== 401) {
        throw error;
      }
      this.accessToken = await this.login();
      return operation();
    }
  }

  private async login(): Promise<string> {
    const response = await this.fetch(
      `${this.baseUrl}/_matrix/client/v3/login`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "m.login.password",
          identifier: { type: "m.id.user", user: this.localpart },
          password: this.password,
          device_id: DELIVERY_DEVICE_ID,
          initial_device_display_name: "Brain delivery",
        }),
      },
    );
    if (!response.ok) {
      throw new MatrixLoginError(response.status, await errorCode(response));
    }
    return loginResponseSchema.parse(await response.json()).access_token;
  }

  /** The bot's direct room with this person, creating and recording one if needed. */
  private async directRoom(recipient: string): Promise<string> {
    const directPath = `/user/${encodeURIComponent(this.userId)}/account_data/m.direct`;
    const direct = await this.request(directPath, "GET", undefined, [404]);
    const rooms = direct ? directRoomsSchema.parse(direct) : {};
    // The chat adapter appends each new direct room, so the last is the newest.
    const existing = rooms[recipient]?.at(-1);
    if (existing) return existing;

    const created = createRoomResponseSchema.parse(
      await this.request("/createRoom", "POST", {
        is_direct: true,
        invite: [recipient],
        preset: "trusted_private_chat",
      }),
    );
    await this.request(directPath, "PUT", {
      ...rooms,
      [recipient]: [...(rooms[recipient] ?? []), created.room_id],
    });
    return created.room_id;
  }

  private async sendText(
    roomId: string,
    txnId: string,
    body: string,
  ): Promise<string> {
    const path = `/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${encodeURIComponent(txnId)}`;
    return sendResponseSchema.parse(
      await this.request(path, "PUT", { msgtype: "m.text", body }),
    ).event_id;
  }

  /** A JSON request; undefined when the status is one the caller allows. */
  private async request(
    path: string,
    method: "GET" | "POST" | "PUT",
    body?: unknown,
    allowedStatuses: readonly number[] = [],
  ): Promise<unknown> {
    const response = await this.fetch(
      `${this.baseUrl}/_matrix/client/v3${path}`,
      {
        method,
        headers: {
          authorization: `Bearer ${this.accessToken ?? ""}`,
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    if (allowedStatuses.includes(response.status)) return undefined;
    if (!response.ok) {
      throw new MatrixRequestError(response.status, await errorCode(response));
    }
    return response.json();
  }
}

async function errorCode(response: Response): Promise<string | undefined> {
  const parsed = matrixErrorSchema.safeParse(
    await response.json().catch(
      // A body that is not JSON carries no Matrix error code.
      () => undefined,
    ),
  );
  return parsed.success ? parsed.data.errcode : undefined;
}
