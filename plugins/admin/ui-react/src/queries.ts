import type {
  AuthAdminMutationAction,
  AuthAdminUserSummary,
  AuthAuditEventSummary,
  AuthInterfacePrincipalGrantSummary,
  AuthBrainAnchorSummary,
} from "@brains/auth-service/admin-contracts";
import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";
import {
  fetchAnchor,
  fetchAudit,
  fetchInterfaceGrants,
  fetchUsers,
} from "./api";

export type AnchorQueryKey = readonly ["admin", "anchor"];
export type UsersQueryKey = readonly ["admin", "users"];
export type AuditQueryKey = readonly ["admin", "audit"];
export type InterfaceGrantsQueryKey = readonly ["admin", "interface-grants"];

export const adminKeys = {
  all: ["admin"] as const,
  anchor: (): AnchorQueryKey => ["admin", "anchor"],
  users: (): UsersQueryKey => ["admin", "users"],
  audit: (): AuditQueryKey => ["admin", "audit"],
  interfaceGrants: (): InterfaceGrantsQueryKey => ["admin", "interface-grants"],
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

export function interfaceGrantsQueryOptions(): UseQueryOptions<
  AuthInterfacePrincipalGrantSummary[],
  Error,
  AuthInterfacePrincipalGrantSummary[],
  InterfaceGrantsQueryKey
> {
  return {
    queryKey: adminKeys.interfaceGrants(),
    queryFn: async () => (await fetchInterfaceGrants()).grants,
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
    queryClient.invalidateQueries({
      queryKey: adminKeys.interfaceGrants(),
    }),
  ]);
}
