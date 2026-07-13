import { z } from "@brains/utils/zod";

const slackResponseSchema = z.looseObject({
  ok: z.boolean(),
  error: z.string().optional(),
  needed: z.string().optional(),
});

const REQUIRED_HEADER_SCOPES = ["files:write"] as const;

const slackAuthResponseSchema = slackResponseSchema.extend({
  team: z.string().optional(),
  team_id: z.string().optional(),
  user: z.string().optional(),
  user_id: z.string().optional(),
});

export interface SlackPreflightEnvironment {
  SLACK_APP_TOKEN?: string | undefined;
  SLACK_BOT_TOKEN?: string | undefined;
}

export interface SlackPreflightResult {
  botUserId: string;
  botUserName: string;
  teamId: string;
  teamName: string;
}

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export async function runSlackPreflight(
  environment: SlackPreflightEnvironment,
  fetchImplementation: FetchImplementation = fetch,
): Promise<SlackPreflightResult> {
  const botToken = environment.SLACK_BOT_TOKEN?.trim() ?? "";
  const appToken = environment.SLACK_APP_TOKEN?.trim() ?? "";
  const missing = [
    !botToken ? "SLACK_BOT_TOKEN" : undefined,
    !appToken ? "SLACK_APP_TOKEN" : undefined,
  ].filter((name): name is string => Boolean(name));
  if (missing.length > 0) {
    throw new Error(
      `Missing required Slack test environment variables: ${missing.join(", ")}`,
    );
  }
  if (!botToken.startsWith("xoxb-")) {
    throw new Error("SLACK_BOT_TOKEN must be a bot token beginning with xoxb-");
  }
  if (!appToken.startsWith("xapp-")) {
    throw new Error(
      "SLACK_APP_TOKEN must be an app token beginning with xapp-",
    );
  }

  const authCall = await callSlackApiWithMetadata(
    fetchImplementation,
    "auth.test",
    botToken,
  );
  const auth = slackAuthResponseSchema.parse(authCall.body);
  assertSlackOk("auth.test", auth);
  assertRequiredHeaderScopes(authCall.grantedScopes);
  if (!auth.team_id || !auth.team || !auth.user_id || !auth.user) {
    throw new Error("Slack auth.test returned incomplete app identity data");
  }

  const socket = slackResponseSchema.parse(
    await callSlackApi(fetchImplementation, "apps.connections.open", appToken),
  );
  assertSlackOk("apps.connections.open", socket);

  await assertApiProbe(fetchImplementation, "files.list", botToken, {
    count: "1",
  });
  await assertApiProbe(fetchImplementation, "conversations.list", botToken, {
    limit: "1",
    types: "public_channel,private_channel,im,mpim",
  });
  await assertApiProbe(fetchImplementation, "users.info", botToken, {
    user: auth.user_id,
  });

  return {
    botUserId: auth.user_id,
    botUserName: auth.user,
    teamId: auth.team_id,
    teamName: auth.team,
  };
}

async function assertApiProbe(
  fetchImplementation: FetchImplementation,
  method: string,
  token: string,
  parameters: Record<string, string>,
): Promise<void> {
  const result = slackResponseSchema.parse(
    await callSlackApi(fetchImplementation, method, token, parameters),
  );
  assertSlackOk(method, result);
}

async function callSlackApi(
  fetchImplementation: FetchImplementation,
  method: string,
  token: string,
  parameters?: Record<string, string>,
): Promise<unknown> {
  const result = await callSlackApiWithMetadata(
    fetchImplementation,
    method,
    token,
    parameters,
  );
  return result.body;
}

async function callSlackApiWithMetadata(
  fetchImplementation: FetchImplementation,
  method: string,
  token: string,
  parameters?: Record<string, string>,
): Promise<{ body: unknown; grantedScopes?: Set<string> }> {
  const response = await fetchImplementation(
    `https://slack.com/api/${method}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      ...(parameters ? { body: new URLSearchParams(parameters) } : {}),
    },
  );
  if (!response.ok) {
    throw new Error(`Slack ${method} failed with HTTP ${response.status}`);
  }
  const scopeHeader = response.headers.get("x-oauth-scopes");
  return {
    body: await response.json(),
    ...(scopeHeader
      ? {
          grantedScopes: new Set(
            scopeHeader
              .split(",")
              .map((scope) => scope.trim())
              .filter(Boolean),
          ),
        }
      : {}),
  };
}

function assertRequiredHeaderScopes(
  grantedScopes: ReadonlySet<string> | undefined,
): void {
  if (!grantedScopes) return;
  const missing = REQUIRED_HEADER_SCOPES.filter(
    (scope) => !grantedScopes.has(scope),
  );
  if (missing.length === 0) return;
  throw new Error(
    `Slack bot token is missing required scopes: ${missing.join(", ")}`,
  );
}

function assertSlackOk(
  method: string,
  response: z.infer<typeof slackResponseSchema>,
): void {
  if (response.ok) return;
  const error = response.error ?? "unknown_error";
  const needed = response.needed ? ` (needed: ${response.needed})` : "";
  throw new Error(`Slack ${method} failed: ${error}${needed}`);
}
