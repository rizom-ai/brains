import type {
  AuthAdminAuditResponse,
  AuthAdminMutation,
  AuthAdminUsersResponse,
  AuthBrainAnchorResponse,
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

export async function fetchAnchor(): Promise<AuthBrainAnchorResponse> {
  return parseResponse(
    await fetch("/auth/admin/anchor", {
      credentials: "same-origin",
      cache: "no-store",
    }),
  );
}

export async function fetchUsers(): Promise<AuthAdminUsersResponse> {
  return parseResponse(
    await fetch("/auth/admin/users", {
      credentials: "same-origin",
      cache: "no-store",
    }),
  );
}

export async function fetchAudit(): Promise<AuthAdminAuditResponse> {
  return parseResponse(
    await fetch("/auth/admin/audit", {
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
