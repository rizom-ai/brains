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
    <aside class="card identity-card">
      <div class="card-head">
        <span class="card-title">Identity</span>
      </div>
      <div class="identity-sections">
        {hasRole && (
          <section class="identity-section">
            <div class="identity-label">Role</div>
            <div class="identity-role">{character.role}</div>
          </section>
        )}
        {hasPurpose && (
          <section class="identity-section">
            <div class="identity-label">Purpose</div>
            <p class="identity-purpose">{character.purpose}</p>
          </section>
        )}
        {hasValues && (
          <section class="identity-section">
            <div class="identity-label">Values</div>
            <div class="values">
              {character.values.map((value) => (
                <span key={value} class="value">
                  {value}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </aside>
  );
}
