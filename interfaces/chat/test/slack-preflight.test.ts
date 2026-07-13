import { describe, expect, it, mock } from "bun:test";
import { runSlackPreflight } from "../src/slack-preflight";

function response(body: unknown, headers?: HeadersInit): Response {
  return Response.json(body, headers ? { headers } : undefined);
}

async function getRejection(task: Promise<unknown>): Promise<Error> {
  let rejection: unknown;
  try {
    await task;
  } catch (error) {
    rejection = error;
  }
  if (rejection instanceof Error) return rejection;
  throw new Error("Expected promise to reject with an Error");
}

describe("runSlackPreflight", () => {
  it("fails before network access when required values are missing", async () => {
    const fetchMock = mock(() => Promise.resolve(response({ ok: true })));

    const error = await getRejection(
      runSlackPreflight(
        {
          SLACK_APP_TOKEN: "",
          SLACK_BOT_TOKEN: "",
        },
        fetchMock,
      ),
    );
    expect(error.message).toBe(
      "Missing required Slack test environment variables: SLACK_BOT_TOKEN, SLACK_APP_TOKEN",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("validates bot identity and Socket Mode without exposing tokens", async () => {
    const fetchMock = mock((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/auth.test")) {
        return Promise.resolve(
          response(
            {
              ok: true,
              team: "Test Workspace",
              team_id: "T123",
              user: "brain-bot",
              user_id: "U_BOT",
            },
            { "x-oauth-scopes": "files:read,files:write,users:read" },
          ),
        );
      }
      if (url.endsWith("/apps.connections.open")) {
        return Promise.resolve(
          response({
            ok: true,
            url: "wss://wss-primary.slack.com/link-secret",
          }),
        );
      }
      return Promise.resolve(response({ ok: true }));
    });

    const result = await runSlackPreflight(
      {
        SLACK_APP_TOKEN: "xapp-secret",
        SLACK_BOT_TOKEN: "xoxb-secret",
      },
      fetchMock,
    );

    expect(result).toEqual({
      botUserId: "U_BOT",
      botUserName: "brain-bot",
      teamId: "T123",
      teamName: "Test Workspace",
    });
    expect(JSON.stringify(result)).not.toContain("xoxb-secret");
    expect(JSON.stringify(result)).not.toContain("xapp-secret");
    expect(JSON.stringify(result)).not.toContain("link-secret");
  });

  it("reports a missing files:write grant from Slack response metadata", async () => {
    const fetchMock = mock((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/auth.test")) {
        return Promise.resolve(
          response(
            {
              ok: true,
              team: "Test Workspace",
              team_id: "T123",
              user: "brain-bot",
              user_id: "U_BOT",
            },
            { "x-oauth-scopes": "files:read,users:read" },
          ),
        );
      }
      return Promise.resolve(response({ ok: true }));
    });

    const error = await getRejection(
      runSlackPreflight(
        {
          SLACK_APP_TOKEN: "xapp-secret",
          SLACK_BOT_TOKEN: "xoxb-secret",
        },
        fetchMock,
      ),
    );
    expect(error.message).toBe(
      "Slack bot token is missing required scopes: files:write",
    );
  });

  it("reports missing scopes from capability probes", async () => {
    const fetchMock = mock((input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/auth.test")) {
        return Promise.resolve(
          response(
            {
              ok: true,
              team: "Test Workspace",
              team_id: "T123",
              user: "brain-bot",
              user_id: "U_BOT",
            },
            { "x-oauth-scopes": "files:read,files:write,users:read" },
          ),
        );
      }
      if (url.endsWith("/files.list")) {
        return Promise.resolve(
          response({ ok: false, error: "missing_scope", needed: "files:read" }),
        );
      }
      return Promise.resolve(response({ ok: true }));
    });

    const error = await getRejection(
      runSlackPreflight(
        {
          SLACK_APP_TOKEN: "xapp-secret",
          SLACK_BOT_TOKEN: "xoxb-secret",
        },
        fetchMock,
      ),
    );
    expect(error.message).toBe(
      "Slack files.list failed: missing_scope (needed: files:read)",
    );
  });

  it("reports Slack API failures without including credentials", async () => {
    const fetchMock = mock(() =>
      Promise.resolve(response({ ok: false, error: "invalid_auth" })),
    );

    const error = await getRejection(
      runSlackPreflight(
        {
          SLACK_APP_TOKEN: "xapp-secret",
          SLACK_BOT_TOKEN: "xoxb-secret",
        },
        fetchMock,
      ),
    );

    expect(error.message).toBe("Slack auth.test failed: invalid_auth");
    expect(String(error)).not.toContain("xoxb-secret");
    expect(String(error)).not.toContain("xapp-secret");
  });
});
