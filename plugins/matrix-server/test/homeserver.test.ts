import { describe, expect, it } from "bun:test";
import { ensureBotAccount } from "../src/bot-account";
import { forwardToHomeserver, wellKnownRoutes } from "../src/routes";
import { renderHomeserverConfig } from "../src/homeserver-config";

const HOMESERVER = "http://homeserver.internal:8008";

type Fetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

/** A homeserver that knows the bot only after it registers with the token. */
function fakeHomeserver(token = "registration-token"): {
  fetch: Fetch;
  registrations: Array<Record<string, unknown>>;
} {
  const registrations: Array<Record<string, unknown>> = [];
  let registered = false;
  const fetch: Fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const body: Record<string, unknown> =
      typeof init?.body === "string" ? JSON.parse(init.body) : {};
    if (url.pathname === "/_matrix/client/v3/login") {
      return registered && body["password"] === "bot-password"
        ? Response.json({
            access_token: "token",
            user_id: "@_brain:brain.example.com",
          })
        : Response.json({ errcode: "M_FORBIDDEN" }, { status: 403 });
    }
    if (url.pathname === "/_matrix/client/v3/register") {
      registrations.push(body);
      const auth = body["auth"];
      const given =
        typeof auth === "object" && auth !== null && "token" in auth
          ? auth.token
          : undefined;
      if (given === undefined) {
        return Response.json(
          {
            flows: [{ stages: ["m.login.registration_token"] }],
            session: "s1",
          },
          { status: 401 },
        );
      }
      if (given !== token) {
        return Response.json(
          { errcode: "M_FORBIDDEN", error: "Invalid registration token." },
          { status: 401 },
        );
      }
      registered = true;
      return Response.json({ user_id: "@_brain:brain.example.com" });
    }
    return Response.json({ errcode: "M_UNRECOGNIZED" }, { status: 404 });
  };
  return { fetch, registrations };
}

const BOT = {
  homeserverUrl: HOMESERVER,
  userId: "@_brain:brain.example.com",
  password: "bot-password",
  registrationToken: "registration-token",
};

describe("the bot account", () => {
  it("registers the bot with the registration token on first start", async () => {
    const server = fakeHomeserver();

    expect(await ensureBotAccount({ ...BOT, fetch: server.fetch })).toBe(
      "registered",
    );
    expect(server.registrations.at(-1)).toEqual({
      username: "_brain",
      password: "bot-password",
      inhibit_login: true,
      auth: {
        type: "m.login.registration_token",
        token: "registration-token",
        session: "s1",
      },
    });
  });

  it("only logs in on later starts", async () => {
    const server = fakeHomeserver();
    await ensureBotAccount({ ...BOT, fetch: server.fetch });
    const registrations = server.registrations.length;

    expect(await ensureBotAccount({ ...BOT, fetch: server.fetch })).toBe(
      "exists",
    );
    expect(server.registrations).toHaveLength(registrations);
  });

  it("fails with the homeserver's reason when the token is refused", async () => {
    const server = fakeHomeserver("another-token");

    expect(ensureBotAccount({ ...BOT, fetch: server.fetch })).rejects.toThrow(
      "M_FORBIDDEN",
    );
  });
});

describe("the homeserver's configuration", () => {
  it("names the server, closes registration behind the token, and signs people in with the brain", () => {
    const config = renderHomeserverConfig({
      serverName: "brain.example.com",
      publicBaseUrl: "https://brain.example.com",
      registrationToken: "registration-token",
      oidcClientSecret: "client-secret",
      databasePath: "/var/lib/tuwunel",
      backupPath: "/var/lib/tuwunel/backup",
      port: 8008,
    });

    expect(config).toBe(`[global]
server_name = "brain.example.com"
database_path = "/var/lib/tuwunel"
address = ["0.0.0.0"]
port = 8008
allow_registration = true
registration_token = "registration-token"

[global.well_known]
client = "https://brain.example.com"
server = "brain.example.com:443"

[global.database.backup]
path = "/var/lib/tuwunel/backup"

[global.admin]
signal_execute = ["server backup-database"]

[[global.identity_provider]]
brand = "brain"
name = "your brain"
client_id = "matrix-homeserver"
client_secret = "client-secret"
issuer_url = "https://brain.example.com"
callback_url = "https://brain.example.com/_matrix/client/unstable/login/sso/callback/matrix-homeserver"
userid_claims = ["preferred_username"]
default = true
`);
  });

  it("escapes quotes in values", () => {
    expect(
      renderHomeserverConfig({
        serverName: "brain.example.com",
        publicBaseUrl: "https://brain.example.com",
        registrationToken: 'with "quotes" \\ and a backslash',
        oidcClientSecret: "client-secret",
        databasePath: "/var/lib/tuwunel",
        backupPath: "/var/lib/tuwunel/backup",
        port: 8008,
      }),
    ).toContain(
      'registration_token = "with \\"quotes\\" \\\\ and a backslash"',
    );
  });
});

describe("discovery", () => {
  it("points federation and clients at the brain's own origin", async () => {
    const routes = wellKnownRoutes({
      serverName: "brain.example.com",
      publicBaseUrl: "https://brain.example.com",
    });
    const serve = async (path: string): Promise<unknown> => {
      const route = routes.find((candidate) => candidate.path === path);
      if (!route) throw new Error(`No route for ${path}`);
      const response = await route.handler(
        new Request(`https://brain.example.com${path}`),
      );
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      return response.json();
    };

    expect(await serve("/.well-known/matrix/server")).toEqual({
      "m.server": "brain.example.com:443",
    });
    expect(await serve("/.well-known/matrix/client")).toEqual({
      "m.homeserver": { base_url: "https://brain.example.com" },
    });
  });
});

describe("forwarding", () => {
  it("forwards a request to the homeserver with its path, query, method, headers and body", async () => {
    const seen: Request[] = [];
    const response = await forwardToHomeserver(
      new Request(
        "https://brain.example.com/_matrix/client/v3/rooms/!r/send/m.room.message/t1?x=1",
        {
          method: "PUT",
          headers: {
            authorization: "Bearer user-token",
            "content-type": "application/json",
            "x-forwarded-for": "203.0.113.9",
          },
          body: JSON.stringify({ body: "hi" }),
        },
      ),
      {
        homeserverUrl: HOMESERVER,
        fetch: async (input) => {
          seen.push(input instanceof Request ? input : new Request(input));
          return Response.json({ event_id: "$e" }, { status: 200 });
        },
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ event_id: "$e" });
    const [forwarded] = seen;
    expect(forwarded?.url).toBe(
      `${HOMESERVER}/_matrix/client/v3/rooms/!r/send/m.room.message/t1?x=1`,
    );
    expect(forwarded?.method).toBe("PUT");
    expect(forwarded?.headers.get("authorization")).toBe("Bearer user-token");
    expect(forwarded?.headers.get("x-forwarded-for")).toBe("203.0.113.9");
    expect(forwarded?.headers.get("x-forwarded-host")).toBe(
      "brain.example.com",
    );
    expect(forwarded?.headers.get("x-forwarded-proto")).toBe("https");
    expect(await forwarded?.text()).toBe(JSON.stringify({ body: "hi" }));
  });

  it("passes the homeserver's redirects back unfollowed", async () => {
    const response = await forwardToHomeserver(
      new Request(
        "https://brain.example.com/_matrix/client/v3/login/sso/redirect/x",
      ),
      {
        homeserverUrl: HOMESERVER,
        fetch: async () =>
          new Response(null, {
            status: 302,
            headers: { location: "https://brain.example.com/authorize?x=1" },
          }),
      },
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://brain.example.com/authorize?x=1",
    );
  });

  it("answers 502 when the homeserver cannot be reached", async () => {
    const response = await forwardToHomeserver(
      new Request("https://brain.example.com/_matrix/client/versions"),
      {
        homeserverUrl: HOMESERVER,
        fetch: async () => {
          throw new Error("connect ECONNREFUSED");
        },
      },
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      errcode: "M_UNKNOWN",
      error: "The homeserver is not reachable",
    });
  });
});
