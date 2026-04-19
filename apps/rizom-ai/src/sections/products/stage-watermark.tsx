import type { JSX } from "preact";
import { cn } from "@brains/ui-library";

export type ProductStage = "you" | "team" | "network";

export const ProductStageWatermark = ({
  stage,
  className,
}: {
  stage: ProductStage;
  className?: string;
}): JSX.Element => {
  if (stage === "you") {
    return (
      <svg
        viewBox="0 0 220 120"
        className={cn("block h-auto w-full", className)}
        aria-hidden="true"
      >
        <circle
          cx="110"
          cy="60"
          r="42"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          opacity="0.34"
        />
        <circle
          cx="110"
          cy="60"
          r="26"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.1"
          opacity="0.62"
        />
        <circle cx="110" cy="60" r="10" fill="currentColor" opacity="0.96" />
      </svg>
    );
  }

  if (stage === "team") {
    const satellites = [
      { cx: 72, cy: 22 },
      { cx: 148, cy: 22 },
      { cx: 148, cy: 98 },
      { cx: 72, cy: 98 },
    ];
    return (
      <svg
        viewBox="0 0 220 120"
        className={cn("block h-auto w-full", className)}
        aria-hidden="true"
      >
        {satellites.map((sat) => (
          <line
            key={`${sat.cx}-${sat.cy}`}
            x1="110"
            y1="60"
            x2={sat.cx}
            y2={sat.cy}
            stroke="currentColor"
            strokeWidth="2.2"
            opacity="0.38"
          />
        ))}
        <circle cx="110" cy="60" r="10" fill="currentColor" opacity="0.96" />
        {satellites.map((sat) => (
          <circle
            key={`node-${sat.cx}-${sat.cy}`}
            cx={sat.cx}
            cy={sat.cy}
            r="7.5"
            fill="currentColor"
            opacity="0.86"
          />
        ))}
      </svg>
    );
  }

  const net = [
    { cx: 110, cy: 18 },
    { cx: 146, cy: 39 },
    { cx: 146, cy: 81 },
    { cx: 110, cy: 102 },
    { cx: 74, cy: 81 },
    { cx: 74, cy: 39 },
    { cx: 110, cy: 60 },
  ];
  const edges: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 0],
    [0, 6],
    [2, 6],
    [4, 6],
    [1, 4],
    [5, 2],
  ];

  return (
    <svg
      viewBox="0 0 220 120"
      className={cn("block h-auto w-full", className)}
      aria-hidden="true"
    >
      {edges.map(([a, b]) => {
        const pa = net[a];
        const pb = net[b];
        if (!pa || !pb) return null;
        return (
          <line
            key={`${a}-${b}`}
            x1={pa.cx}
            y1={pa.cy}
            x2={pb.cx}
            y2={pb.cy}
            stroke="currentColor"
            strokeWidth="2.1"
            opacity="0.34"
          />
        );
      })}
      {net.map((node, index) => (
        <circle
          key={`${node.cx}-${node.cy}`}
          cx={node.cx}
          cy={node.cy}
          r={index === 6 ? "8.5" : "7"}
          fill="currentColor"
          opacity={index === 6 ? "0.96" : "0.84"}
        />
      ))}
    </svg>
  );
};
