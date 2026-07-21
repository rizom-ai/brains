import type {
  AuthAdminMutationAction,
  AuthAdminUserSummary,
  AuthAuditEventSummary,
  AuthBrainAnchorSummary,
} from "@brains/auth-service/admin-contracts";
import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";
import { fetchAnchor, fetchAudit, fetchUsers } from "./api";

export type AnchorQueryKey = readonly ["admin", "anchor"];
export type UsersQueryKey = readonly ["admin", "users"];
export type AuditQueryKey = readonly ["admin", "audit"];

export const adminKeys = {
  all: ["admin"] as const,
  anchor: (): AnchorQueryKey => ["admin", "anchor"],
  users: (): UsersQueryKey => ["admin", "users"],
  audit: (): AuditQueryKey => ["admin", "audit"],
};

export function anchorQueryOptions(): UseQueryOptions<
  AuthBrainAnchorSummary,
  Error,
  AuthBrainAnchorSummary,
  AnchorQueryKey
> {
  return {
    queryKey: adminKeys.anchor(),
    queryFn: async () => (await fetchAnchor()).anchor,
  };
}

export function usersQueryOptions(): UseQueryOptions<
  AuthAdminUserSummary[],
  Error,
  AuthAdminUserSummary[],
  UsersQueryKey
> {
  return {
    queryKey: adminKeys.users(),
    queryFn: async () => (await fetchUsers()).users,
  };
}

export function auditQueryOptions(): UseQueryOptions<
  AuthAuditEventSummary[],
  Error,
  AuthAuditEventSummary[],
  AuditQueryKey
> {
  return {
    queryKey: adminKeys.audit(),
    queryFn: async () => (await fetchAudit()).events,
  };
}

export async function invalidateAfterAdminMutation(
  queryClient: QueryClient,
  _action: AuthAdminMutationAction,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminKeys.anchor() }),
    queryClient.invalidateQueries({ queryKey: adminKeys.users() }),
    queryClient.invalidateQueries({ queryKey: adminKeys.audit() }),
  ]);
}
