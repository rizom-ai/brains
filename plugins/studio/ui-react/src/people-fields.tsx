/** @jsxImportSource react */
import * as stylex from "@stylexjs/stylex";
import { Button, NativeSelect } from "@brains/app-ui-react";
import { useQuery } from "@tanstack/react-query";
import { useId, type ReactElement } from "react";
import type { StudioMember } from "./api";
import { useStudioApi } from "./studio-api-context";
import { fieldStyles as f } from "./studio-fields.styles";
import { groupingMembershipStyles as s } from "./grouping-membership.styles";

/** A person as a people field stores them: a name, and an id when known. */
interface Person {
  name: string;
  id?: string;
}

function people(value: unknown): Person[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry: unknown) => {
    if (typeof entry !== "object" || entry === null) return [];
    // Board people carry a name; conversation memory, a display name.
    const named: unknown =
      Reflect.get(entry, "name") ?? Reflect.get(entry, "displayName");
    const id: unknown = Reflect.get(entry, "id");
    const name =
      typeof named === "string" && named.length > 0 ? named : "Someone";
    return [{ name, ...(typeof id === "string" ? { id } : {}) }];
  });
}

/** The key a member's id is stored under on a person. */
function memberKey(member: StudioMember): string {
  return `user:${member.id}`;
}

/**
 * People a field names, shown by name only: their ids are references. A field
 * naming nobody shows nothing; it records no one, not that there was no one.
 */
export function PeopleNames(props: {
  label: string;
  value: unknown;
}): ReactElement | null {
  const names = people(props.value);
  if (names.length === 0) return null;
  return (
    <div {...stylex.props(f.field)} data-studio-field="people">
      <div {...stylex.props(f.label)}>
        <span>{props.label}</span>
      </div>
      <div {...stylex.props(f.tags)}>
        {names.map((person, index) => (
          <span key={`${index}:${person.name}`} {...stylex.props(f.tag)}>
            {person.name}
          </span>
        ))}
      </div>
    </div>
  );
}

/** People assigned from the brain's members: shown by name, added from a list. */
export function MembersField(props: {
  label: string;
  members: readonly StudioMember[];
  value: unknown;
  onChange: (next: Person[]) => void;
  readOnly?: boolean | undefined;
}): ReactElement {
  const labelId = useId();
  const assigned = people(props.value);
  const taken = new Set(assigned.flatMap((person) => person.id ?? []));
  const available = props.members.filter(
    (member) => !taken.has(memberKey(member)),
  );
  return (
    <div {...stylex.props(f.field)} data-studio-field="members">
      <div id={labelId} {...stylex.props(f.label)}>
        <span>{props.label}</span>
      </div>
      <div {...stylex.props(s.frame)} role="group" aria-labelledby={labelId}>
        <div {...stylex.props(f.tags)}>
          {assigned.map((person, index) => (
            <span key={`${index}:${person.name}`} {...stylex.props(f.tag)}>
              <span>{person.name}</span>
              {!props.readOnly && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  xstyle={f.tagButton}
                  aria-label={`Remove ${person.name}`}
                  onClick={() =>
                    props.onChange(assigned.filter((_, at) => at !== index))
                  }
                >
                  ×
                </Button>
              )}
            </span>
          ))}
          {!props.readOnly && available.length > 0 && (
            <NativeSelect
              aria-label={`Add to ${props.label}`}
              xstyle={[f.control, s.select]}
              value=""
              onChange={(event) => {
                const member = available.find(
                  ({ id }) => id === event.currentTarget.value,
                );
                if (member)
                  props.onChange([
                    ...assigned,
                    { name: member.name, id: memberKey(member) },
                  ]);
              }}
            >
              <option value="">Add a member</option>
              {available.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
      </div>
    </div>
  );
}

/** The brain's members, for fields that assign from them; none while loading. */
export function useStudioMembers(): readonly StudioMember[] {
  const api = useStudioApi();
  const { data } = useQuery({
    queryKey: ["studio", "members"],
    queryFn: () => api.fetchMembers(),
    staleTime: 60_000,
  });
  return data ?? [];
}

/** A members field that loads the brain's members itself. */
export function BrainMembersField(props: {
  label: string;
  value: unknown;
  onChange: (next: Person[]) => void;
  readOnly?: boolean | undefined;
}): ReactElement {
  return <MembersField {...props} members={useStudioMembers()} />;
}
