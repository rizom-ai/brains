import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { PeerRooms } from "../src/peer-rooms";

const SERVER = "host.example";
const PEER = "team.rizom.ai";
const ALIAS = `#team-rizom-ai:${SERVER}`;
/** The room the peer keeps for this brain, on the peer's server. */
const PEER_ROOM_FOR_US = `#host-example:${PEER}`;
const JOIN_PEER_ROOM = {
  method: "POST",
  path: `/join/${PEER_ROOM_FOR_US}`,
  body: {},
};

interface Call {
  method: string;
  path: string;
  body: unknown;
}

const jsonBody = z.record(z.string(), z.unknown());

/** A homeserver that keeps rooms by alias and records each call. */
function fakeHomeserver(options: { joinStatus?: number } = {}): {
  fetch: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>;
  calls: Call[];
} {
  const calls: Call[] = [];
  const aliases = new Map<string, string>();
  const fetch = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = new URL(String(input));
    const path = decodeURIComponent(url.pathname).replace(
      "/_matrix/client/v3",
      "",
    );
    const method = init?.method ?? "GET";
    const body: unknown =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    if (path !== "/login") calls.push({ method, path, body });
    if (path === "/login") return Response.json({ access_token: "token" });
    const alias = path.match(/^\/directory\/room\/(.+)$/)?.[1];
    if (alias && method === "GET") {
      const roomId = aliases.get(alias);
      return roomId
        ? Response.json({ room_id: roomId })
        : Response.json({ errcode: "M_NOT_FOUND" }, { status: 404 });
    }
    if (path.startsWith("/join/") && options.joinStatus) {
      return Response.json(
        { errcode: "M_FORBIDDEN" },
        { status: options.joinStatus },
      );
    }
    if (path === "/createRoom") {
      const roomId = `!peer${aliases.size + 1}:${SERVER}`;
      const localAlias = jsonBody.parse(body)["room_alias_name"];
      aliases.set(`#${String(localAlias)}:${SERVER}`, roomId);
      return Response.json({ room_id: roomId });
    }
    return Response.json({});
  };
  return { fetch, calls };
}

function peerRooms(server: ReturnType<typeof fakeHomeserver>): PeerRooms {
  return new PeerRooms({
    homeserverUrl: "http://homeserver.internal:8008",
    serverName: SERVER,
    botUserId: `@_brain:${SERVER}`,
    botPassword: "bot-password-0123456789",
    fetch: server.fetch,
  });
}

describe("rooms for trusted peers", () => {
  it("creates the peer's room, open only to this server and the peer's, and invites the peer's bot", async () => {
    const server = fakeHomeserver();

    await peerRooms(server).trusted(PEER);

    expect(server.calls).toEqual([
      { method: "GET", path: `/directory/room/${ALIAS}`, body: undefined },
      {
        method: "POST",
        path: "/createRoom",
        body: {
          room_alias_name: "team-rizom-ai",
          name: PEER,
          preset: "private_chat",
          invite: [`@_brain:${PEER}`],
          initial_state: [
            {
              type: "m.room.server_acl",
              state_key: "",
              content: {
                allow: [SERVER, PEER],
                deny: [],
                allow_ip_literals: false,
              },
            },
          ],
        },
      },
      JOIN_PEER_ROOM,
    ]);
  });

  it("reopens an existing room to a peer trusted again, and invites its bot", async () => {
    const server = fakeHomeserver();
    const rooms = peerRooms(server);
    await rooms.trusted(PEER);
    server.calls.splice(0);

    await rooms.trusted(PEER);

    expect(server.calls).toEqual([
      { method: "GET", path: `/directory/room/${ALIAS}`, body: undefined },
      {
        method: "PUT",
        path: `/rooms/!peer1:${SERVER}/state/m.room.server_acl/`,
        body: { allow: [SERVER, PEER], deny: [], allow_ip_literals: false },
      },
      {
        method: "POST",
        path: `/rooms/!peer1:${SERVER}/invite`,
        body: { user_id: `@_brain:${PEER}` },
      },
      JOIN_PEER_ROOM,
    ]);
  });

  it("joins the room the peer keeps for this brain, whichever brain granted trust first", async () => {
    const server = fakeHomeserver();

    await peerRooms(server).trusted(PEER);

    expect(server.calls.at(-1)).toEqual(JOIN_PEER_ROOM);
  });

  it.each([403, 404])(
    "still trusts the peer when the peer has no room for this brain yet (%i)",
    async (joinStatus) => {
      const server = fakeHomeserver({ joinStatus });

      await peerRooms(server).trusted(PEER);

      expect(server.calls.at(-1)).toEqual(JOIN_PEER_ROOM);
    },
  );

  it("removes the peer's bot and closes the room to its server on a revoke, keeping the history", async () => {
    const server = fakeHomeserver();
    const rooms = peerRooms(server);
    await rooms.trusted(PEER);
    server.calls.splice(0);

    await rooms.revoked(PEER);

    expect(server.calls).toEqual([
      { method: "GET", path: `/directory/room/${ALIAS}`, body: undefined },
      {
        method: "POST",
        path: `/rooms/!peer1:${SERVER}/kick`,
        body: {
          user_id: `@_brain:${PEER}`,
          reason: "This brain no longer trusts the peer.",
        },
      },
      {
        method: "PUT",
        path: `/rooms/!peer1:${SERVER}/state/m.room.server_acl/`,
        body: { allow: [SERVER], deny: [], allow_ip_literals: false },
      },
    ]);
  });

  it("does nothing on a revoke for a peer that never had a room", async () => {
    const server = fakeHomeserver();

    await peerRooms(server).revoked(PEER);

    expect(server.calls).toEqual([
      { method: "GET", path: `/directory/room/${ALIAS}`, body: undefined },
    ]);
  });
});
