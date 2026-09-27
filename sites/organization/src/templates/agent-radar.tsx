import type { CSSProperties, JSX } from "react";
import { constellationEcho, loneEcho } from "../lib/radar-echoes";
import type { AgentRadar, RadarAgent } from "../schemas/radar";
import { PULSE_TRAVEL, agentRadarStyles } from "./agent-radar-styles";

/** The edge ring's radius in the radar's 0–100 square; the pulse reaches it at PULSE_TRAVEL. */
const EDGE = 48;
const RANGES = [10, 20, 30, 40, EDGE, 58, 68, 78];
const KINDS = [
  { kind: "person", label: "Person" },
  { kind: "team", label: "Team" },
  { kind: "organization", label: "Organization" },
] as const;
const KIND_LABELS: Record<RadarAgent["kind"], string> = {
  person: "Person",
  team: "Team",
  organization: "Organization",
};

const round = (value: number): number => Math.round(value * 10) / 10;

/** When the pulse, leaving the team, reaches a point: nearer lights first. */
function pulseAt(
  x: number,
  y: number,
): CSSProperties & Record<`--${string}`, string> {
  return {
    "--pulse-at": `${((Math.hypot(x - 50, y - 50) / EDGE) * PULSE_TRAVEL).toFixed(2)}s`,
  };
}

/** Title cards open inward near either edge so they stay on screen. */
function edgeClass(x: number): string {
  if (x > 72) return " atlas__mark--west";
  if (x < 28) return " atlas__mark--east";
  return "";
}

function Scope(): JSX.Element {
  const ticks = Array.from({ length: 72 }, (_, index) => {
    const angle = (index * 5 * Math.PI) / 180;
    const long = index % 6 === 0;
    const outer = long ? 50.6 : 49.3;
    return (
      <line
        key={index}
        className={long ? "scope__tick scope__tick--long" : "scope__tick"}
        x1={round(50 + EDGE * Math.sin(angle))}
        y1={round(50 - EDGE * Math.cos(angle))}
        x2={round(50 + outer * Math.sin(angle))}
        y2={round(50 - outer * Math.cos(angle))}
      />
    );
  });
  return (
    <>
      {RANGES.map((radius) => (
        <circle
          key={radius}
          className={
            radius === EDGE
              ? "scope__ring scope__ring--edge"
              : radius > EDGE
                ? "scope__ring scope__ring--beyond"
                : "scope__ring"
          }
          cx="50"
          cy="50"
          r={radius}
        />
      ))}
      {ticks}
    </>
  );
}

function Echo({
  className,
  paths,
  x,
  y,
}: {
  className: string;
  paths: string[];
  x: number;
  y: number;
}): JSX.Element {
  return (
    <g className={className} style={pulseAt(x, y)}>
      {paths.map((d, index) => (
        <path
          key={index}
          className={
            index === paths.length - 1 ? "echo__line echo__core" : "echo__line"
          }
          d={d}
        />
      ))}
    </g>
  );
}

function Mark({ agent }: { agent: RadarAgent }): JSX.Element {
  const pending = agent.status === "discovered";
  const meta = `${KIND_LABELS[agent.kind]}${pending ? ", awaiting review" : ""}`;
  return (
    <li
      data-atlas-mark=""
      data-atlas-key={`agent:${agent.id}`}
      className={`atlas__mark atlas__mark--${agent.kind}${edgeClass(agent.x)}${pending ? " radar__mark--pending" : ""}`}
      style={{
        left: `${agent.x}%`,
        top: `${agent.y}%`,
        ...pulseAt(agent.x, agent.y),
      }}
    >
      {agent.url ? (
        <a href={agent.url}>
          <i className="atlas__glyph" aria-hidden="true" />
          <span className="atlas__tip" data-atlas-tip="">
            <b>{agent.name}</b>
            <span>{meta}</span>
            {agent.constellation && <em>{agent.constellation}</em>}
          </span>
        </a>
      ) : (
        <span title={agent.name}>
          <i className="atlas__glyph" aria-hidden="true" />
        </span>
      )}
      <span
        aria-hidden="true"
        className={
          agent.x > 70 ? "radar__name radar__name--left" : "radar__name"
        }
      >
        {agent.name}
      </span>
    </li>
  );
}

/**
 * The agent radar in the atlas's own hand: the team at the centre of a quiet
 * scope, its agents placed by how close their work runs to the team's and
 * named beside their marks, constellations as named echoes, lone agents as
 * islands, and a pulse radiating outwards that lights each as it arrives.
 */
export function AgentRadarMap({
  radar,
  team,
}: {
  radar: AgentRadar;
  team: string;
}): JSX.Element {
  const byId = new Map(radar.agents.map((agent) => [agent.id, agent]));
  const lone = radar.agents.filter((agent) => !agent.constellation);
  const kinds = KINDS.filter(({ kind }) =>
    radar.agents.some((agent) => agent.kind === kind),
  );
  const pending = radar.agents.some((agent) => agent.status === "discovered");
  return (
    <>
      <style>{agentRadarStyles}</style>
      <div className="radar__bleed">
        <div className="radar">
          <div className="radar__pulse" aria-hidden="true" />
          <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <Scope />
            {radar.constellations.flatMap((constellation) =>
              constellation.links.flatMap(({ from, to }) => {
                const a = byId.get(from);
                const b = byId.get(to);
                return a && b
                  ? [
                      <line
                        key={`${from}-${to}`}
                        className="echo__thread"
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                      />,
                    ]
                  : [];
              }),
            )}
            {radar.constellations.map((constellation) => (
              <Echo
                key={constellation.id}
                className="echo echo--constellation"
                paths={constellationEcho(
                  constellation.memberIds.flatMap((id) => {
                    const member = byId.get(id);
                    return member ? [member] : [];
                  }),
                  constellation.links,
                )}
                x={constellation.x}
                y={constellation.y}
              />
            ))}
            {lone.map((agent) => (
              <Echo
                key={agent.id}
                className={
                  agent.status === "discovered"
                    ? "echo echo--lone echo--pending"
                    : "echo echo--lone"
                }
                paths={loneEcho(agent, agent.status === "discovered")}
                x={agent.x}
                y={agent.y}
              />
            ))}
          </svg>
          {radar.constellations.map((constellation) => (
            <span
              key={constellation.id}
              className="atlas__zone radar__constellation"
              style={{
                left: `${round(constellation.x)}%`,
                top: `${round(constellation.y)}%`,
              }}
            >
              {constellation.name}
            </span>
          ))}
          <p className="radar__centre">
            <i aria-hidden="true" />
            <span>{team}</span>
          </p>
          <ul className="atlas__marks">
            {radar.agents.map((agent) => (
              <Mark key={agent.id} agent={agent} />
            ))}
          </ul>
        </div>
      </div>
      <p className="atlas__legend">
        <span className="atlas__caption">
          Closer to the centre, closer to our work
        </span>
        {kinds.map(({ kind, label }) => (
          <span key={kind} className={`radar__key--${kind}`}>
            <i aria-hidden="true" />
            {label}
          </span>
        ))}
        {pending && (
          <span className="radar__key--pending">
            <i aria-hidden="true" />
            Awaiting review
          </span>
        )}
      </p>
    </>
  );
}
