import {
  AUTH_REPRESENTATION_MUTATION_ACTIONS,
  type AuthAdminMutation,
  type AuthAdminUsersResponse,
  type AuthRepresentationMutation,
  type AuthRepresentationsResponse,
} from "@brains/auth-service/admin-contracts";

export class PeopleApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PeopleApiError";
    this.status = status;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (!response.ok) {
    const error =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : "Access request failed";
    throw new PeopleApiError(error, response.status);
  }
  return body as T;
}

export async function fetchUsers(): Promise<AuthAdminUsersResponse> {
  return parseResponse(
    await fetch("/auth/admin/users", {
      credentials: "same-origin",
      cache: "no-store",
    }),
  );
}

export async function mutateAdmin<T>(mutation: AuthAdminMutation): Promise<T> {
  return parseResponse(
    await fetch("/auth/admin/mutations", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mutation),
    }),
  );
}

export async function fetchRepresentations(): Promise<AuthRepresentationsResponse> {
  return parseResponse(
    await fetch("/auth/representations", {
      credentials: "same-origin",
      cache: "no-store",
    }),
  );
}

export async function acceptRepresentation(agentId: string): Promise<void> {
  await parseResponse(
    await fetch("/auth/representations", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: AUTH_REPRESENTATION_MUTATION_ACTIONS.acceptRepresentation,
        confirmation: AUTH_REPRESENTATION_MUTATION_ACTIONS.acceptRepresentation,
        agentId,
      } satisfies AuthRepresentationMutation),
    }),
  );
}
