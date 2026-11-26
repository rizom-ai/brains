import { z } from "@brains/utils/zod";

export type MatrixFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface BotAccountOptions {
  homeserverUrl: string;
  /** The bot's full Matrix user id. */
  userId: string;
  password: string;
  registrationToken: string;
  fetch?: MatrixFetch;
}

const matrixErrorSchema = z.object({ errcode: z.string() });
const interactiveAuthSchema = z.object({ session: z.string() });

/**
 * Make sure the bot account exists, registering it with the homeserver's
 * registration token on the first start. Registration is otherwise closed,
 * so only the brain, which holds the token, can create the account.
 */
export async function ensureBotAccount(
  options: BotAccountOptions,
): Promise<"exists" | "registered"> {
  const fetchFn = options.fetch ?? fetch;
  const base = `${options.homeserverUrl.replace(/\/+$/, "")}/_matrix/client/v3`;
  const localpart = options.userId.slice(1).split(":")[0] ?? "";
  const post = (path: string, body: unknown): Promise<Response> =>
    fetchFn(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  const login = await post("/login", {
    type: "m.login.password",
    identifier: { type: "m.id.user", user: localpart },
    password: options.password,
    // Checks the account without leaving a device behind for it.
    device_id: "brain-bootstrap",
  });
  if (login.ok) return "exists";
  const loginError = await errorCode(login);
  if (loginError !== "M_FORBIDDEN") {
    throw new Error(`Matrix bot login failed: ${loginError ?? login.status}`);
  }

  const request = {
    username: localpart,
    password: options.password,
    inhibit_login: true,
  };
  // The first request starts the interactive flow the token completes.
  const started = await post("/register", request);
  const session = interactiveAuthSchema.safeParse(
    await started.json().catch(
      // A body that is not JSON starts no flow; the error below says so.
      () => undefined,
    ),
  );
  if (!session.success) {
    throw new Error(`Matrix bot registration did not start: ${started.status}`);
  }
  const registered = await post("/register", {
    ...request,
    auth: {
      type: "m.login.registration_token",
      token: options.registrationToken,
      session: session.data.session,
    },
  });
  if (!registered.ok) {
    throw new Error(
      `Matrix bot registration failed: ${(await errorCode(registered)) ?? registered.status}`,
    );
  }
  return "registered";
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
