import type { AuthPrincipal } from "./principal-service";

/** A brain member as people fields offer them: an id and a name. */
export interface AssignableMember {
  id: string;
  name: string;
}

/** Who work can be assigned to: everyone but suspended people, by name. */
export function assignableMembers(
  people: readonly Pick<AuthPrincipal, "userId" | "displayName" | "status">[],
): AssignableMember[] {
  return people
    .filter((person) => person.status !== "suspended")
    .map((person) => ({ id: person.userId, name: person.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
