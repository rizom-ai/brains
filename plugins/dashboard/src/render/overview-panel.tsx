/** @jsxImportSource react */
import type { InteractionInfo } from "@brains/plugins";
import {
  displayLinkLabel,
  formatLabel,
  resolveUrl,
} from "@brains/utils/string-utils";
import type { JSX } from "react";
import {
  OperatorSection,
  OperatorPanel,
  OperatorPanelGrid,
  OperatorPanelParagraph,
  OperatorPanelStatus,
  OperatorPanelEmpty,
  OperatorPanelList,
  OperatorPanelListItem,
  OperatorStats,
} from "@brains/operator-view-react";
import { findSkills } from "./public-card-data";
import type { DashboardRenderInput } from "./types";

const INTERACTION_KIND_LABELS: Record<InteractionInfo["kind"], string> = {
  human: "Human",
  agent: "Agent",
  admin: "Operator",
  protocol: "Protocol",
};

function identitySource(input: DashboardRenderInput): string {
  for (const value of [input.profile.website, input.baseUrl]) {
    if (!value) continue;
    try {
      return `brain · ${new URL(value, input.baseUrl).hostname}`;
    } catch {
      // Try the next public location.
    }
  }
  return "brain";
}

function IdentityCard({ input }: { input: DashboardRenderInput }): JSX.Element {
  const identityStatement = input.character.role || "A shared digital brain";
  return (
    <OperatorPanel
      className="card public-identity-card"
      heading="What is this"
      source={identitySource(input)}
    >
      <OperatorPanelParagraph lead={input.title}>
        {" is a brain. "}
        {identityStatement}.
        {input.character.purpose ? ` ${input.character.purpose}` : ""}
      </OperatorPanelParagraph>
      <OperatorPanelParagraph>
        It is grown from what {input.profile.name || "its owner"} has chosen to
        share, and belongs to them. Ask it anything it holds; answers stay in
        public scope. Private memory and operator activity stay behind Studio.
      </OperatorPanelParagraph>
      <OperatorPanelStatus tone="good">
        alive · public scope only
      </OperatorPanelStatus>
    </OperatorPanel>
  );
}

interface ProfileDoor {
  label: string;
  description: string;
  href: string;
  kind: string;
}

function safePublicHref(
  value: string,
  baseUrl: string | undefined,
): string | undefined {
  try {
    const url = new URL(value, baseUrl);
    return ["http:", "https:", "mailto:"].includes(url.protocol)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function profileWebsiteDoor(
  input: DashboardRenderInput,
): ProfileDoor | undefined {
  if (!input.profile.website) return undefined;
  const href = safePublicHref(input.profile.website, input.baseUrl);
  return href
    ? {
        label: input.profile.organization ?? "Website",
        description: "The public home of this brain's owner.",
        href,
        kind: "Site",
      }
    : undefined;
}

function profileDoors(input: DashboardRenderInput): ProfileDoor[] {
  const candidates: Array<ProfileDoor | undefined> = [
    profileWebsiteDoor(input),
    input.profile.email && !/[\r\n]/.test(input.profile.email)
      ? {
          label: input.profile.email,
          description: "Send a message to this brain's owner.",
          href: `mailto:${input.profile.email}`,
          kind: "Mail",
        }
      : undefined,
    ...(input.profile.socialLinks ?? []).map((link) => {
      const href = safePublicHref(link.url, input.baseUrl);
      return href
        ? {
            label: link.label ?? formatLabel(link.platform),
            description: `Connect through ${link.platform}.`,
            href,
            kind: formatLabel(link.platform),
          }
        : undefined;
    }),
  ];
  const seen = new Set<string>();
  return candidates.filter((door): door is ProfileDoor => {
    if (!door || seen.has(door.href)) return false;
    seen.add(door.href);
    return true;
  });
}

function ContactCard({ input }: { input: DashboardRenderInput }): JSX.Element {
  const shownInteractions = input.appInfo.interactions
    .filter((interaction) => interaction.id !== "dashboard")
    .slice(0, 5);
  const seenHrefs = new Set(
    shownInteractions.map((interaction) =>
      resolveUrl(interaction.href, input.baseUrl),
    ),
  );
  const shownEndpoints = input.appInfo.endpoints
    .filter((endpoint) => endpoint.pluginId !== "dashboard")
    .filter((endpoint) => {
      const href = resolveUrl(endpoint.url, input.baseUrl);
      if (seenHrefs.has(href)) return false;
      seenHrefs.add(href);
      return true;
    })
    .slice(0, Math.max(0, 5 - shownInteractions.length));
  const publicProfileDoors = profileDoors(input).filter((door) => {
    if (seenHrefs.has(door.href)) return false;
    seenHrefs.add(door.href);
    return true;
  });
  const shownProfileDoors = publicProfileDoors.slice(
    0,
    Math.max(0, 5 - shownInteractions.length - shownEndpoints.length),
  );
  return (
    <OperatorPanel
      className="card public-contact-card"
      heading="Ways to connect"
    >
      {shownInteractions.length === 0 &&
      shownEndpoints.length === 0 &&
      publicProfileDoors.length === 0 ? (
        <OperatorPanelEmpty>
          No public interaction doors are advertised yet.
        </OperatorPanelEmpty>
      ) : (
        <OperatorPanelList>
          {shownInteractions.map((interaction) => (
            <OperatorPanelListItem
              data-kind={interaction.kind}
              key={interaction.id}
              href={resolveUrl(interaction.href, input.baseUrl)}
              label={displayLinkLabel(interaction.label)}
              description={
                interaction.description ??
                `Connect through ${interaction.label}.`
              }
              badge={INTERACTION_KIND_LABELS[interaction.kind]}
              tone={
                interaction.kind === "agent" || interaction.kind === "protocol"
                  ? "secondary"
                  : "neutral"
              }
            />
          ))}
          {shownEndpoints.map((endpoint) => (
            <OperatorPanelListItem
              data-kind="site"
              key={`${endpoint.pluginId}:${endpoint.url}`}
              href={resolveUrl(endpoint.url, input.baseUrl)}
              label={displayLinkLabel(endpoint.label)}
              description="Browse this brain through its public endpoint."
              badge="Site"
            />
          ))}
          {shownProfileDoors.map((door) => (
            <OperatorPanelListItem
              data-kind="profile"
              key={door.href}
              href={door.href}
              label={door.label}
              description={door.description}
              badge={door.kind}
            />
          ))}
        </OperatorPanelList>
      )}
    </OperatorPanel>
  );
}

function holdingLabel(entityType: string, count: number): string {
  const label = formatLabel(entityType);
  return count === 1 || label.endsWith("s") ? label : `${label}s`;
}

function HoldingsCard({ input }: { input: DashboardRenderInput }): JSX.Element {
  const counts = [...input.appInfo.entityCounts]
    .filter((entry) => entry.count > 0)
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.entityType.localeCompare(right.entityType),
    );
  return (
    <OperatorPanel
      className="card public-holdings-card"
      heading="What I hold"
      source="public scope"
    >
      {counts.length === 0 ? (
        <OperatorPanelEmpty>No public entities yet.</OperatorPanelEmpty>
      ) : (
        <OperatorStats
          density="compact"
          presentation="ledger"
          items={counts.slice(0, 4).map((entry) => ({
            label: holdingLabel(entry.entityType, entry.count),
            value: entry.count,
          }))}
        />
      )}
    </OperatorPanel>
  );
}

function SkillsCard({ input }: { input: DashboardRenderInput }): JSX.Element {
  const skills = findSkills(input.widgets);
  return (
    <OperatorPanel
      className="card public-skills-card"
      heading="Skills"
      source="the moss marks on the map"
    >
      {skills.length === 0 ? (
        <OperatorPanelEmpty>
          No public skills advertised yet.
        </OperatorPanelEmpty>
      ) : (
        <OperatorPanelList>
          {skills.slice(0, 3).map((skill) => (
            <OperatorPanelListItem
              key={skill.id}
              label={skill.title}
              description={
                skill.description === "" ? undefined : skill.description
              }
              badge="Skill"
              tone="good"
            />
          ))}
        </OperatorPanelList>
      )}
    </OperatorPanel>
  );
}

export function OverviewPanel({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element {
  return (
    <OperatorSection
      id="overview"
      className="dashboard-tab-panel is-active"
      data-dashboard-tab-panel
      data-ui-panel="overview"
      role="tabpanel"
      aria-labelledby="dashboard-tab-overview"
    >
      <OperatorPanelGrid className="public-card-grid">
        <IdentityCard input={input} />
        <ContactCard input={input} />
        <HoldingsCard input={input} />
        <SkillsCard input={input} />
      </OperatorPanelGrid>
    </OperatorSection>
  );
}
