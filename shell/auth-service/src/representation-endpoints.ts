import { z } from "@brains/utils/zod";
import { AUTH_REPRESENTATION_MUTATION_ACTIONS } from "./admin-contracts";
import {
  isSameOriginRequest,
  privateJsonResponse,
  readJsonRequest,
} from "./http-responses";
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
  action: z.literal(AUTH_REPRESENTATION_MUTATION_ACTIONS.acceptRepresentation),
  confirmation: z.literal(
    AUTH_REPRESENTATION_MUTATION_ACTIONS.acceptRepresentation,
  ),
  agentId: z.string().trim().min(1).max(500),
});

export async function handleAuthRepresentationRequest(
  request: Request,
  operations: AuthRepresentationOperations,
): Promise<Response> {
  const principal = await operations.resolveSession(request);
  if (!principal) {
    return privateJsonResponse({ error: "Authentication required" }, 401);
  }

  if (request.method === "GET") {
    return privateJsonResponse({
      representations: await operations.listPersonAgents(principal.personId),
    });
  }

  if (request.method !== "POST") {
    return privateJsonResponse({ error: "Method not allowed" }, 405);
  }
  if (!isSameOriginRequest(request)) {
    return privateJsonResponse({ error: "Same-origin request required" }, 403);
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return privateJsonResponse({ error: "JSON request required" }, 415);
  }

  const parsed = representationMutationSchema.safeParse(
    await readJsonRequest(request),
  );
  if (!parsed.success) {
    return privateJsonResponse(
      { error: "Invalid or unconfirmed representation mutation" },
      400,
    );
  }

  try {
    return privateJsonResponse({
      representation: await operations.acceptRepresentation(
        parsed.data.agentId,
        principal.userId,
      ),
    });
  } catch (error) {
    return privateJsonResponse(
      { error: error instanceof Error ? error.message : "Mutation failed" },
      400,
    );
  }
}
