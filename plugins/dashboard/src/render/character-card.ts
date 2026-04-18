import { escapeHtml } from "@brains/utils";
import type { CharacterInput } from "./types";

export function renderCharacterCard(character: CharacterInput): string {
  const role = character.role
    ? `<div class="identity-role">${escapeHtml(character.role)}</div>`
    : "";
  const purpose = character.purpose
    ? `<p class="identity-purpose">${escapeHtml(character.purpose)}</p>`
    : "";
  const values =
    character.values.length > 0
      ? `<div class="values">${character.values
          .map((v) => `<span class="value">${escapeHtml(v)}</span>`)
          .join("")}</div>`
      : "";

  if (!role && !purpose && !values) return "";

  return `<aside class="card">
    <div class="card-head">
      <span class="card-title">Brain Character</span>
    </div>
    ${role}${purpose}${values}
  </aside>`;
}
