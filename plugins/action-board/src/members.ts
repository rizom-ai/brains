import type { BoardMember } from "./board-workspace";

/** A person as the auth service lists them. */
export interface BrainPerson {
  userId: string;
  displayName: string;
  status: "active" | "invited" | "suspended";
}

/** Who a card can be assigned to: everyone but suspended people, by name. */
export function boardMembers(people: readonly BrainPerson[]): BoardMember[] {
  return people
    .filter((person) => person.status !== "suspended")
    .map((person) => ({ id: person.userId, name: person.displayName }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
