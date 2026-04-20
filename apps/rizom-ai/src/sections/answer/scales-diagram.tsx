import type { JSX } from "preact";
import { cn } from "@brains/ui-library";

/**
 * Three-layer scales diagram — renders the "personal → team → network"
 * claim by giving each stage its own structural visual:
 *
 *   You     → a node inside two concentric rings (a lone agent)
 *   Team    → a hub with four satellites connected by spokes
 *   Network → a 7-node hex mesh with no center, triangulated +
 *              cross-linked (peer-to-peer)
 *
 * Each stage *shows* its structure, not just its scale. All three
 * visualizations share a horizontal baseline (BAND_CENTER) and the
 * labels/descriptions all anchor to the same two Y-values so the
 * typographic row below the graphics is straight regardless of which
 * stage is tallest.
 */

const LABEL_CLASS =
  "fill-accent [font-family:var(--font-label)] text-[11px] font-semibold uppercase tracking-[0.22em]";
const DESC_CLASS =
  "fill-[var(--color-text-muted)] [font-family:var(--font-body)] text-[12px]";
const CONNECTOR_CLASS = "stroke-accent";
const NODE_CLASS = "fill-accent";
const RING_CLASS = "stroke-accent";

const BAND_CENTER = 65;
const LABEL_Y = 135;
const DESC_Y = 158;

export const ScalesDiagram = ({
  className,
  showLabels = true,
  decorative = false,
}: {
  className?: string;
  showLabels?: boolean;
  decorative?: boolean;
} = {}): JSX.Element => {
  const colX = { you: 110, team: 340, network: 570 };

  // Stage 2 — Team: one hub + four satellites on a rotated square
  const teamRadius = 24;
  const teamSatellites = [
    { cx: colX.team - teamRadius, cy: BAND_CENTER - teamRadius },
    { cx: colX.team + teamRadius, cy: BAND_CENTER - teamRadius },
    { cx: colX.team + teamRadius, cy: BAND_CENTER + teamRadius },
    { cx: colX.team - teamRadius, cy: BAND_CENTER + teamRadius },
  ];

  // Stage 3 — Network: 7 nodes in a hexagonal mesh (no single center).
  // Hex perimeter + one interior node to seed cross-connections. Sized
  // so the vertical extent stays close to the team's — growth reads as
  // connective, not oversized.
  const netRadius = 32;
  const netHalf = netRadius * 0.87; // hex side-to-side (cos 30°)
  const netMidY = BAND_CENTER;
  const net = [
    { cx: colX.network, cy: netMidY - netRadius }, // 0  top
    { cx: colX.network + netHalf, cy: netMidY - netRadius / 2 }, // 1  upper right
    { cx: colX.network + netHalf, cy: netMidY + netRadius / 2 }, // 2  lower right
    { cx: colX.network, cy: netMidY + netRadius }, // 3  bottom
    { cx: colX.network - netHalf, cy: netMidY + netRadius / 2 }, // 4  lower left
    { cx: colX.network - netHalf, cy: netMidY - netRadius / 2 }, // 5  upper left
    { cx: colX.network, cy: netMidY }, // 6  interior seed
  ];
  const netEdges: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 0], // hexagon perimeter
    [0, 6],
    [2, 6],
    [4, 6], // interior triangulation
    [1, 4],
    [5, 2], // long-range cross-links
  ];

  return (
    <svg
      viewBox="0 0 680 180"
      className={cn(
        "mx-auto my-8 md:my-10 block w-full max-w-[600px] md:max-w-[680px]",
        className,
      )}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative ? true : undefined}
      aria-label={
        decorative
          ? undefined
          : "Three layers of intelligence: personal brain, team, distributed network"
      }
    >
      {/* Subtle rails between stages — continuity cue, not decoration */}
      <line
        x1="140"
        y1={BAND_CENTER}
        x2="304"
        y2={BAND_CENTER}
        className={CONNECTOR_CLASS}
        strokeWidth="1"
        opacity="0.22"
      />
      <line
        x1="378"
        y1={BAND_CENTER}
        x2="534"
        y2={BAND_CENTER}
        className={CONNECTOR_CLASS}
        strokeWidth="1"
        opacity="0.22"
      />

      {/* Stage 1 — You */}
      <g>
        <circle
          cx={colX.you}
          cy={BAND_CENTER}
          r="26"
          fill="none"
          className={RING_CLASS}
          strokeWidth="1.25"
          opacity="0.4"
        />
        <circle
          cx={colX.you}
          cy={BAND_CENTER}
          r="16"
          fill="none"
          className={RING_CLASS}
          strokeWidth="1"
          opacity="0.65"
        />
        <circle cx={colX.you} cy={BAND_CENTER} r="7" className={NODE_CLASS} />
        {showLabels ? (
          <>
            <text
              x={colX.you}
              y={LABEL_Y}
              textAnchor="middle"
              className={LABEL_CLASS}
            >
              You
            </text>
            <text
              x={colX.you}
              y={DESC_Y}
              textAnchor="middle"
              className={DESC_CLASS}
            >
              Personal brain
            </text>
          </>
        ) : null}
      </g>

      {/* Stage 2 — Team */}
      <g>
        {teamSatellites.map((sat) => (
          <line
            key={`spoke-${sat.cx}-${sat.cy}`}
            x1={colX.team}
            y1={BAND_CENTER}
            x2={sat.cx}
            y2={sat.cy}
            className={CONNECTOR_CLASS}
            strokeWidth="1"
            opacity="0.55"
          />
        ))}
        <circle cx={colX.team} cy={BAND_CENTER} r="6" className={NODE_CLASS} />
        {teamSatellites.map((sat) => (
          <circle
            key={`sat-${sat.cx}-${sat.cy}`}
            cx={sat.cx}
            cy={sat.cy}
            r="4.5"
            className={NODE_CLASS}
          />
        ))}
        {showLabels ? (
          <>
            <text
              x={colX.team}
              y={LABEL_Y}
              textAnchor="middle"
              className={LABEL_CLASS}
            >
              Team
            </text>
            <text
              x={colX.team}
              y={DESC_Y}
              textAnchor="middle"
              className={DESC_CLASS}
            >
              Shared intelligence
            </text>
          </>
        ) : null}
      </g>

      {/* Stage 3 — Network */}
      <g>
        {netEdges.map(([a, b]) => {
          const pa = net[a];
          const pb = net[b];
          if (!pa || !pb) return null;
          return (
            <line
              key={`edge-${a}-${b}`}
              x1={pa.cx}
              y1={pa.cy}
              x2={pb.cx}
              y2={pb.cy}
              className={CONNECTOR_CLASS}
              strokeWidth="0.9"
              opacity="0.45"
            />
          );
        })}
        {net.map((node, idx) => (
          <circle
            key={`node-${idx}`}
            cx={node.cx}
            cy={node.cy}
            r={idx === 6 ? "5" : "4.5"}
            className={NODE_CLASS}
          />
        ))}
        {showLabels ? (
          <>
            <text
              x={colX.network}
              y={LABEL_Y}
              textAnchor="middle"
              className={LABEL_CLASS}
            >
              Network
            </text>
            <text
              x={colX.network}
              y={DESC_Y}
              textAnchor="middle"
              className={DESC_CLASS}
            >
              Distributed expertise
            </text>
          </>
        ) : null}
      </g>
    </svg>
  );
};
