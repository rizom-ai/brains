/** @jsxImportSource preact */
import type { AppInfo } from "@brains/plugins";
import { displayLinkLabel } from "@brains/utils";
import type { JSX } from "preact";

function resolveUrl(url: string, baseUrl: string | undefined): string {
  if (!baseUrl) return url;

  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return url;
  }
}

function interactionKindLabel(kind: string): string {
  switch (kind) {
    case "agent":
      return "Agent";
    case "admin":
      return "Admin";
    case "protocol":
      return "Protocol";
    default:
      return "Human";
  }
}

export function InteractionsCard(props: {
  interactions: NonNullable<AppInfo["interactions"]>;
  baseUrl: string | undefined;
}): JSX.Element | null {
  const { interactions, baseUrl } = props;

  if (interactions.length === 0) {
    return null;
  }

  const sorted = [...interactions].sort(
    (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
  );

  return (
    <aside class="card interactions-card">
      <div class="card-head">
        <span class="card-title">Ways to connect</span>
      </div>
      <div class="interactions-list">
        {sorted.slice(0, 5).map((interaction) => {
          const resolved = resolveUrl(interaction.href, baseUrl);
          return (
            <a
              key={`${interaction.pluginId}:${interaction.id}`}
              class={`interaction-link interaction-link--${interaction.kind}`}
              href={resolved}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>
                <strong>{displayLinkLabel(interaction.label)}</strong>
                {interaction.description && <em>{interaction.description}</em>}
              </span>
              <small>{interactionKindLabel(interaction.kind)}</small>
            </a>
          );
        })}
      </div>
    </aside>
  );
}
