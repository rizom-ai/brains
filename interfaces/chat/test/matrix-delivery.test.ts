import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { MatrixDelivery } from "../src/matrix-delivery";

const BASE_URL = "https://brain.example.com";
const BOT = "@_brain:brain.example.com";

interface Sent {
  roomId: string;
  txnId: string;
  content: Record<string, unknown>;
}

/** A homeserver with just the endpoints delivery uses, recording each call. */
function fakeHomeserver(
  options: {
    expireFirstToken?: boolean;
    refuseLogin?: boolean;
    direct?: Record<string, string[]>;
  } = {},
): {
  fetch: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  logins: Array<Record<string, unknown>>;
  createdRooms: Array<Record<string, unknown>>;
  sent: Sent[];
  direct: Record<string, string[]>;
} {
  const logins: Array<Record<string, unknown>> = [];
  const createdRooms: Array<Record<string, unknown>> = [];
  const sent: Sent[] = [];
  let direct: Record<string, string[]> | undefined = options.direct;
  let tokenCount = 0;
  const expired = new Set<string>();

  const json = (body: unknown, status = 200): Response =>
    Response.json(body, { status });

  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = init?.method ?? "GET";
    const body: Record<string, unknown> =
      typeof init?.body === "string" ? JSON.parse(init.body) : {};
    const path = decodeURIComponent(url.pathname);

    if (path === "/_matrix/client/v3/login" && method === "POST") {
      logins.push(body);
      if (options.refuseLogin) {
        return json({ errcode: "M_FORBIDDEN", error: "Invalid password" }, 403);
      }
      tokenCount += 1;
      const token = `token-${tokenCount}`;
      if (options.expireFirstToken && tokenCount === 1) expired.add(token);
      return json({
        access_token: token,
        user_id: BOT,
        device_id: "brain-delivery",
      });
    }

    const token = new Headers(init?.headers).get("authorization")?.slice(7);
    if (!token || expired.has(token)) {
      return json({ errcode: "M_UNKNOWN_TOKEN", error: "Unknown token" }, 401);
    }

    if (path === `/_matrix/client/v3/user/${BOT}/account_data/m.direct`) {
      if (method === "GET") {
        return direct
          ? json(direct)
          : json({ errcode: "M_NOT_FOUND", error: "Not found" }, 404);
      }
      direct = z.record(z.string(), z.array(z.string())).parse(body);
      return json({});
    }

    if (path === "/_matrix/client/v3/createRoom" && method === "POST") {
      createdRooms.push(body);
      return json({ room_id: `!dm${createdRooms.length}:brain.example.com` });
    }

    const send = path.match(
      /^\/_matrix\/client\/v3\/rooms\/([^/]+)\/send\/m\.room\.message\/(.+)$/,
    );
    if (send && method === "PUT") {
      sent.push({ roomId: send[1] ?? "", txnId: send[2] ?? "", content: body });
      return json({ event_id: `$event${sent.length}` });
    }

    return json({ errcode: "M_UNRECOGNIZED", error: path }, 404);
  };

  return {
    fetch,
    logins,
    createdRooms,
    sent,
    get direct(): Record<string, string[]> {
      return direct ?? {};
    },
  };
}

function delivery(server: ReturnType<typeof fakeHomeserver>): MatrixDelivery {
  return new MatrixDelivery({
    baseUrl: BASE_URL,
    userId: BOT,
    password: "bot-password",
    fetch: server.fetch,
  });
}

const INPUT = {
  recipient: "@alice:other.example",
  subject: "Your invitation",
  text: "Open the link to set up your account.",
  idempotencyKey: "delivery-1",
  sensitivity: "secret" as const,
};

describe("MatrixDelivery", () => {
  it("opens a direct room with the recipient and sends the message once", async () => {
    const server = fakeHomeserver();

    const result = await delivery(server).send(INPUT);

    expect(result).toEqual({ status: "sent", providerDeliveryId: "$event1" });
    expect(server.logins).toEqual([
      {
        type: "m.login.password",
        identifier: { type: "m.id.user", user: "_brain" },
        password: "bot-password",
        device_id: "brain-delivery",
        initial_device_display_name: "Brain delivery",
      },
    ]);
    expect(server.createdRooms).toEqual([
      {
        is_direct: true,
        invite: ["@alice:other.example"],
        preset: "trusted_private_chat",
      },
    ]);
    expect(server.direct).toEqual({
      "@alice:other.example": ["!dm1:brain.example.com"],
    });
    expect(server.sent).toEqual([
      {
        roomId: "!dm1:brain.example.com",
        txnId: "delivery-1",
        content: {
          msgtype: "m.text",
          body: "Your invitation\n\nOpen the link to set up your account.",
        },
      },
    ]);
  });

  it("reuses the direct room and the login for the next message", async () => {
    const server = fakeHomeserver();
    const matrix = delivery(server);

    await matrix.send(INPUT);
    await matrix.send({ ...INPUT, idempotencyKey: "delivery-2" });

    expect(server.logins).toHaveLength(1);
    expect(server.createdRooms).toHaveLength(1);
    expect(server.sent.map((message) => message.roomId)).toEqual([
      "!dm1:brain.example.com",
      "!dm1:brain.example.com",
    ]);
  });

  it("uses the most recently recorded direct room, as the chat adapter appends them", async () => {
    const server = fakeHomeserver({
      direct: {
        "@alice:other.example": [
          "!old:brain.example.com",
          "!new:brain.example.com",
        ],
      },
    });

    await delivery(server).send(INPUT);

    expect(server.createdRooms).toHaveLength(0);
    expect(server.sent[0]?.roomId).toBe("!new:brain.example.com");
  });

  it("appends a new direct room after the ones already recorded", async () => {
    const server = fakeHomeserver({
      direct: { "@bob:other.example": ["!bob:brain.example.com"] },
    });

    await delivery(server).send(INPUT);

    expect(server.direct).toEqual({
      "@bob:other.example": ["!bob:brain.example.com"],
      "@alice:other.example": ["!dm1:brain.example.com"],
    });
  });

  it("logs in again once when the token has expired", async () => {
    const server = fakeHomeserver({ expireFirstToken: true });

    const result = await delivery(server).send(INPUT);

    expect(result.status).toBe("sent");
    expect(server.logins).toHaveLength(2);
    expect(server.sent).toHaveLength(1);
  });

  it("reports a refused login as a failure, without the password", async () => {
    const server = fakeHomeserver({ refuseLogin: true });

    const result = await delivery(server).send(INPUT);

    expect(result).toEqual({
      status: "failed",
      failureCode: "matrix:login:M_FORBIDDEN",
    });
  });

  it("refuses a recipient that is not a Matrix user id", async () => {
    const server = fakeHomeserver();

    const result = await delivery(server).send({
      ...INPUT,
      recipient: "alice@example.com",
    });

    expect(result).toEqual({
      status: "failed",
      failureCode: "matrix:invalid-recipient",
    });
    expect(server.logins).toHaveLength(0);
  });
});
