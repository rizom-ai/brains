import type { AuthAppPasswordGrant } from "@brains/contracts";
import { createDavRoutes } from "../src/dav-routes";
import type { FakeBrain } from "./fake-brain";

export interface As {
  level?: "admin" | "trusted";
  access?: "read" | "write";
  user?: string;
}

export type Drive = (
  method: string,
  path: string,
  options?: { as?: As; headers?: Record<string, string>; body?: BodyInit },
) => Promise<Response>;

/** A markdown document with a title and optional extra frontmatter lines. */
export const doc = (title: string, extra = ""): string =>
  `---\ntitle: ${title}\n${extra}---\n\nBody of ${title}`;

/** A `Destination` header for a path on the drive. */
export const dest = (path: string): Record<string, string> => ({
  destination: `https://brain.example${path}`,
});

/** Every href a multistatus answer names. */
export async function hrefs(response: Response): Promise<string[]> {
  return [
    ...(await response.text()).matchAll(/<D:href>([^<]*)<\/D:href>/g),
  ].map((match) => match[1] ?? "");
}

/**
 * The drive over a fake brain, called as a person: trusted with a
 * read-and-write app password unless the call says otherwise.
 */
export function drive(
  brain: FakeBrain,
  clock: { now: number } = { now: 1_800_000_000_000 },
): Drive {
  const routes = createDavRoutes({
    basePath: "/dav",
    realm: "Test Brain",
    ...brain.options,
    now: () => clock.now,
    resolveAppPassword: async (request): Promise<AuthAppPasswordGrant> => {
      const level =
        request.headers.get("x-level") === "admin" ? "admin" : "trusted";
      const user = request.headers.get("x-user") ?? `usr_${level}`;
      return {
        principal: {
          userId: user,
          personId: `prsn_${user}`,
          displayName: user,
          role: level,
          status: "active",
          permissionLevel: level,
          isAnchor: false,
        },
        access: request.headers.get("x-access") === "read" ? "read" : "write",
        appPasswordId: `pw_${user}`,
      };
    },
  });
  return async (method, path, options = {}) => {
    const route = routes.find((candidate) => candidate.method === method);
    if (!route) throw new Error(`No ${method} route`);
    return route.handler(
      new Request(`https://brain.example${path}`, {
        method,
        headers: {
          "x-level": options.as?.level ?? "trusted",
          "x-access": options.as?.access ?? "write",
          ...(options.as?.user ? { "x-user": options.as.user } : {}),
          ...options.headers,
        },
        ...(options.body !== undefined ? { body: options.body } : {}),
      }),
    );
  };
}
