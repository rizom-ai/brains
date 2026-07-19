import type { QueryClient, UseQueryOptions } from "@tanstack/react-query";
import {
  AUTH_ADMIN_MUTATION_ACTIONS,
  type AuthAdminMutationAction,
  type AuthAdminUserSummary,
  type AuthAgentPersonSummary,
  type AuthBrainAnchorSummary,
} from "@brains/auth-service/admin-contracts";
import { fetchAnchor, fetchRepresentations, fetchUsers } from "./api";

export type AnchorQueryKey = readonly ["admin", "anchor"];
export type UsersQueryKey = readonly ["admin", "users"];
export type RepresentationsQueryKey = readonly ["admin", "representations"];

export const adminKeys = {
  all: ["admin"] as const,
  anchor: (): AnchorQueryKey => ["admin", "anchor"],
  users: (): UsersQueryKey => ["admin", "users"],
  representations: (): RepresentationsQueryKey => ["admin", "representations"],
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

export function representationsQueryOptions(): UseQueryOptions<
  AuthAgentPersonSummary[],
  Error,
  AuthAgentPersonSummary[],
  RepresentationsQueryKey
> {
  return {
    queryKey: adminKeys.representations(),
    queryFn: async () => (await fetchRepresentations()).representations,
  };
}

export async function invalidateAfterAdminMutation(
  queryClient: QueryClient,
  action: AuthAdminMutationAction,
): Promise<void> {
  if (action === AUTH_ADMIN_MUTATION_ACTIONS.startPasskeyRegistration) return;

  const invalidations = [
    queryClient.invalidateQueries({ queryKey: adminKeys.users() }),
    queryClient.invalidateQueries({ queryKey: adminKeys.representations() }),
  ];
  if (action === AUTH_ADMIN_MUTATION_ACTIONS.updateBrainAnchor) {
    invalidations.push(
      queryClient.invalidateQueries({ queryKey: adminKeys.anchor() }),
    );
  }
  await Promise.all(invalidations);
}

export async function invalidateAfterRepresentationMutation(
  queryClient: QueryClient,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: adminKeys.users() }),
    queryClient.invalidateQueries({ queryKey: adminKeys.representations() }),
  ]);
}
