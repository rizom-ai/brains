/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { CharacterInput } from "./types";

export function CharacterCard({
  character,
}: {
  character: CharacterInput;
}): JSX.Element | null {
  const hasRole = Boolean(character.role);
  const hasPurpose = Boolean(character.purpose);
  const hasValues = character.values.length > 0;

  if (!hasRole && !hasPurpose && !hasValues) {
    return null;
  }

  return (
    <aside class="card">
      <div class="card-head">
        <span class="card-title">Brain Character</span>
      </div>
      {hasRole && <div class="identity-role">{character.role}</div>}
      {hasPurpose && <p class="identity-purpose">{character.purpose}</p>}
      {hasValues && (
        <div class="values">
          {character.values.map((value) => (
            <span key={value} class="value">
              {value}
            </span>
          ))}
        </div>
      )}
    </aside>
  );
}
