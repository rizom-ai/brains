/** @jsxImportSource preact */
import type { AppInfo, InteractionInfo } from "@brains/plugins";
import { displayLinkLabel, resolveUrl } from "@brains/utils";
import type { JSX } from "preact";

const INTERACTION_KIND_LABELS: Record<InteractionInfo["kind"], string> = {
  human: "Human",
  agent: "Agent",
  admin: "Admin",
  protocol: "Protocol",
};

export function InteractionsCard(props: {
  interactions: AppInfo["interactions"];
  baseUrl: string | undefined;
}): JSX.Element | null {
  const { interactions, baseUrl } = props;

  if (interactions.length === 0) {
    return null;
  }

  return (
    <aside class="card interactions-card">
      <div class="card-head">
        <span class="card-title">Ways to connect</span>
      </div>
      <div class="interactions-list">
        {interactions.slice(0, 5).map((interaction) => {
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
              <small>{INTERACTION_KIND_LABELS[interaction.kind]}</small>
            </a>
          );
        })}
      </div>
    </aside>
  );
}
