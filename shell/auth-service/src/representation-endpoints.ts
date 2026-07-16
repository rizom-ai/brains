import { z } from "@brains/utils/zod";
import type { AgentPersonLink } from "./runtime-schema";

interface RepresentationPrincipal {
  userId: string;
  personId: string;
}

export interface AuthRepresentationOperations {
  resolveSession(
    request: Request,
  ): Promise<RepresentationPrincipal | undefined>;
  listPersonAgents(personId: string): Promise<AgentPersonLink[]>;
  acceptRepresentation(
    agentId: string,
    actorUserId: string,
  ): Promise<AgentPersonLink>;
}

const representationMutationSchema = z.strictObject({
  action: z.literal("acceptRepresentation"),
  confirmation: z.literal("acceptRepresentation"),
  agentId: z.string().trim().min(1).max(500),
});

export async function handleAuthRepresentationRequest(
  request: Request,
  operations: AuthRepresentationOperations,
): Promise<Response> {
  const principal = await operations.resolveSession(request);
  if (!principal) return privateJson({ error: "Authentication required" }, 401);

  if (request.method === "GET") {
    return privateJson({
      representations: await operations.listPersonAgents(principal.personId),
    });
  }

  if (request.method !== "POST") {
    return privateJson({ error: "Method not allowed" }, 405);
  }
  if (!isSameOrigin(request)) {
    return privateJson({ error: "Same-origin request required" }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return privateJson({ error: "JSON request required" }, 415);
  }

  const parsed = representationMutationSchema.safeParse(
    await readJson(request),
  );
  if (!parsed.success) {
    return privateJson(
      { error: "Invalid or unconfirmed representation mutation" },
      400,
    );
  }

  try {
    return privateJson({
      representation: await operations.acceptRepresentation(
        parsed.data.agentId,
        principal.userId,
      ),
    });
  } catch (error) {
    return privateJson(
      { error: error instanceof Error ? error.message : "Mutation failed" },
      400,
    );
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}

function privateJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
