/** @jsxImportSource react */
import type { InteractionInfo } from "@brains/plugins";
import {
  displayLinkLabel,
  formatLabel,
  resolveUrl,
} from "@brains/utils/string-utils";
import type { JSX } from "react";
import { findSkills, overviewContributions } from "./public-card-data";
import type { DashboardRenderInput } from "./types";
import { WidgetCard } from "./widget-card";

const INTERACTION_KIND_LABELS: Record<InteractionInfo["kind"], string> = {
  human: "Human",
  agent: "Agent",
  admin: "Operator",
  protocol: "Protocol",
};

function IdentityCard({ input }: { input: DashboardRenderInput }): JSX.Element {
  const identityStatement = input.character.role || "A shared digital brain";
  return (
    <article className="card public-identity-card">
      <div className="card-head">
        <span className="card-title">What is this</span>
        <span className="card-from">brain · public identity</span>
      </div>
      <p>
        <b>{input.title}</b> is a brain. {identityStatement}.
        {input.character.purpose ? ` ${input.character.purpose}` : ""}
      </p>
      <p>
        It is grown from what {input.profile.name || "its owner"} has chosen to
        share, and belongs to them. Private memory and operator activity stay
        behind Studio.
      </p>
      {input.character.values.length > 0 && (
        <div className="public-values" aria-label="Identity values">
          {input.character.values.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </div>
      )}
      <span className="public-card-pulse">alive · public scope only</span>
    </article>
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
  const interactions = input.appInfo.interactions.filter(
    (interaction) => interaction.id !== "dashboard",
  );
  const endpoints = input.appInfo.endpoints.filter(
    (endpoint) => endpoint.pluginId !== "dashboard",
  );
  const publicProfileDoors = profileDoors(input);
  const shownEndpoints = endpoints.slice(
    0,
    Math.max(0, 6 - interactions.length),
  );
  const shownProfileDoors = publicProfileDoors.slice(
    0,
    Math.max(0, 6 - interactions.length - shownEndpoints.length),
  );
  return (
    <article className="card public-contact-card">
      <div className="card-head">
        <span className="card-title">Ways to connect</span>
        <span className="card-from">public doors</span>
      </div>
      {interactions.length === 0 &&
      endpoints.length === 0 &&
      publicProfileDoors.length === 0 ? (
        <p className="public-card-empty">
          No public interaction doors are advertised yet.
        </p>
      ) : (
        <ul className="public-card-rows">
          {interactions.slice(0, 5).map((interaction) => (
            <li data-kind={interaction.kind} key={interaction.id}>
              <a href={resolveUrl(interaction.href, input.baseUrl)}>
                <span>
                  <strong>{displayLinkLabel(interaction.label)}</strong>
                  <em>
                    {interaction.description ??
                      `Connect through ${interaction.label}.`}
                  </em>
                </span>
                <small>{INTERACTION_KIND_LABELS[interaction.kind]}</small>
              </a>
            </li>
          ))}
          {shownEndpoints.map((endpoint) => (
            <li data-kind="site" key={`${endpoint.pluginId}:${endpoint.url}`}>
              <a href={resolveUrl(endpoint.url, input.baseUrl)}>
                <span>
                  <strong>{displayLinkLabel(endpoint.label)}</strong>
                  <em>Browse this brain through its public endpoint.</em>
                </span>
                <small>Site</small>
              </a>
            </li>
          ))}
          {shownProfileDoors.map((door) => (
            <li data-kind="profile" key={door.href}>
              <a href={door.href}>
                <span>
                  <strong>{door.label}</strong>
                  <em>{door.description}</em>
                </span>
                <small>{door.kind}</small>
              </a>
            </li>
          ))}
        </ul>
      )}
    </article>
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
    <article className="card public-holdings-card">
      <div className="card-head">
        <span className="card-title">What I hold</span>
        <span className="card-from">public scope</span>
      </div>
      {counts.length === 0 ? (
        <p className="public-card-empty">No public entities yet.</p>
      ) : (
        <dl className="public-holdings">
          {counts.slice(0, 8).map((entry) => (
            <div key={entry.entityType}>
              <dt>{holdingLabel(entry.entityType, entry.count)}</dt>
              <dd>{entry.count}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

function SkillsCard({ input }: { input: DashboardRenderInput }): JSX.Element {
  const skills = findSkills(input.widgets);
  return (
    <article className="card public-skills-card">
      <div className="card-head">
        <span className="card-title">Skills</span>
        <span className="card-from">advertised capabilities</span>
      </div>
      {skills.length === 0 ? (
        <p className="public-card-empty">No public skills advertised yet.</p>
      ) : (
        <ul className="public-card-rows">
          {skills.slice(0, 6).map((skill) => (
            <li className="is-skill" key={skill.id}>
              <span>
                <strong>{skill.title}</strong>
                {skill.description && <em>{skill.description}</em>}
              </span>
              <small>Skill</small>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

export function OverviewPanel({
  input,
}: {
  input: DashboardRenderInput;
}): JSX.Element {
  const contributions = overviewContributions(input.widgets);
  const studioPath = input.surfaces?.find(
    (surface) => surface.id === "studio",
  )?.href;
  return (
    <section
      id="overview"
      className="dashboard-tab-panel is-active"
      data-dashboard-tab-panel
      data-ui-panel="overview"
      role="tabpanel"
      aria-labelledby="dashboard-tab-overview"
    >
      <div className="public-card-grid">
        <IdentityCard input={input} />
        <ContactCard input={input} />
        <HoldingsCard input={input} />
        <SkillsCard input={input} />
      </div>
      {contributions.length > 0 && (
        <section
          className="public-contributions"
          aria-label="Public contributions"
        >
          {contributions.map((widget) => (
            <WidgetCard
              key={`${widget.widget.pluginId}:${widget.widget.id}`}
              widget={widget}
              studioPath={studioPath}
            />
          ))}
        </section>
      )}
    </section>
  );
}
