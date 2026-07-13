/** @jsxImportSource preact */
import type { JSX } from "preact";
import type { ProximityMapData } from "../lib/proximity-map-schema";
import { ProximityMap } from "../widgets/proximity-map";

const SITE_STYLES = `
.agent-proximity-site {
  --console-accent: var(--color-accent, var(--color-brand, #b45309));
  --console-secondary: var(--color-secondary, #7653a6);
  --console-bg-deep: var(--color-bg-subtle, #eee7d9);
  --console-card: var(--color-bg, #f6f0e5);
  --console-text: var(--color-text, #211d18);
  --console-text-dim: var(--color-text-muted, #5f584e);
  --console-text-muted: color-mix(in srgb, var(--color-text, #211d18) 58%, transparent);
  --console-text-faint: color-mix(in srgb, var(--color-text, #211d18) 28%, transparent);
  --console-rule: color-mix(in srgb, var(--color-text, #211d18) 12%, transparent);
  --console-rule-strong: color-mix(in srgb, var(--color-text, #211d18) 24%, transparent);
  --console-warn: var(--color-status-warning-text, var(--color-accent, #b45309));
  --console-display: var(--font-display, var(--font-heading, Georgia, serif));
  --console-mono: var(--font-mono, ui-monospace, monospace);
  position: relative;
  isolation: isolate;
  overflow: hidden;
  width: 100%;
  padding: clamp(2.25rem, 6vw, 4.5rem) clamp(1.25rem, 5vw, 4rem);
  border: 1px solid var(--console-rule-strong);
  border-radius: 0.75rem;
  background:
    radial-gradient(circle at 76% 44%, color-mix(in srgb, var(--console-secondary) 8%, transparent), transparent 34%),
    var(--console-card);
  color: var(--console-text);
  box-shadow: 0 2rem 5rem -3.5rem color-mix(in srgb, var(--console-text) 60%, transparent);
}
.agent-proximity-site::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0.04;
  mix-blend-mode: multiply;
  background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
}
.agent-proximity-site__grid {
  display: grid;
  grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
  gap: clamp(2rem, 5vw, 4.5rem);
  align-items: center;
}
.agent-proximity-site__copy { position: relative; z-index: 2; }
.agent-proximity-site__kicker {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  margin: 0 0 1rem;
  color: var(--console-accent);
  font-family: var(--console-mono);
  font-size: 0.67rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}
.agent-proximity-site__kicker::before {
  content: "";
  width: 1.2rem;
  height: 1px;
  background: currentColor;
}
.agent-proximity-site__heading {
  max-width: 13ch;
  margin: 0;
  color: var(--console-text);
  font-family: var(--console-display);
  font-size: clamp(2rem, 4.4vw, 3.4rem);
  font-weight: 480;
  font-variation-settings: "SOFT" 60, "opsz" 72;
  letter-spacing: -0.025em;
  line-height: 1.02;
}
.agent-proximity-site__heading em {
  color: var(--console-accent);
  font-style: italic;
  font-weight: 430;
  font-variation-settings: "SOFT" 100, "opsz" 72;
}
.agent-proximity-site__lede {
  max-width: 44ch;
  margin: 1.2rem 0 0;
  color: var(--console-text-dim);
  font-size: 0.95rem;
  line-height: 1.7;
}
.agent-proximity-site__stats {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem 2rem;
  margin-top: 1.75rem;
}
.agent-proximity-site__stat-number {
  color: var(--console-text);
  font-family: var(--console-display);
  font-size: 2.15rem;
  font-variant-numeric: tabular-nums;
  font-variation-settings: "opsz" 144, "SOFT" 30, "wght" 420;
  line-height: 1;
}
.agent-proximity-site__stat-label {
  margin-top: 0.35rem;
  color: var(--console-text-muted);
  font-family: var(--console-mono);
  font-size: 0.58rem;
  letter-spacing: 0.15em;
  text-transform: uppercase;
}
.agent-proximity-site__cta {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 1.85rem;
  padding-bottom: 0.15rem;
  border-bottom: 1px solid color-mix(in srgb, var(--console-accent) 38%, transparent);
  color: var(--console-accent);
  font-size: 0.88rem;
  font-weight: 600;
  text-decoration: none;
}
.agent-proximity-site__cta::after { content: "→"; transition: transform 160ms ease; }
.agent-proximity-site__cta:hover::after,
.agent-proximity-site__cta:focus-visible::after { transform: translateX(0.28rem); }
.agent-proximity-site__note {
  margin: 0.9rem 0 0;
  color: var(--console-text-muted);
  font-family: var(--console-mono);
  font-size: 0.65rem;
}
.agent-proximity-site__map { position: relative; min-width: 0; }
.agent-proximity-site .proximity-field {
  position: relative;
  min-height: 28rem;
  isolation: isolate;
}
.agent-proximity-site .proximity-field > svg {
  display: block;
  width: 100%;
  min-height: 26rem;
  overflow: visible;
}
.agent-proximity-site .proximity-hud { display: none; }
.agent-proximity-site .proximity-node-label,
.agent-proximity-site .proximity-you-label,
.agent-proximity-site .proximity-strata-label,
.agent-proximity-site .proximity-cluster-label {
  font-family: var(--console-mono);
}
.agent-proximity-site .proximity-node-label {
  fill: var(--console-text-muted);
  font-size: 9px;
  letter-spacing: 0.07em;
}
.agent-proximity-site .proximity-agent[data-proximity-status="archived"] .proximity-node-label { opacity: 0.22; }
.agent-proximity-site .proximity-agent[data-proximity-status="archived"] > path { opacity: 0.16; }
.agent-proximity-site .proximity-you-label {
  fill: var(--console-text-dim);
  font-size: 9px;
  letter-spacing: 0.26em;
  text-anchor: middle;
  text-transform: uppercase;
}
.agent-proximity-site .proximity-strata-label {
  fill: var(--console-text-faint);
  font-size: 8px;
  letter-spacing: 0.08em;
}
.agent-proximity-site .proximity-cluster-label {
  fill: var(--console-secondary);
  stroke: var(--console-card);
  stroke-width: 4px;
  paint-order: stroke;
  font-size: 9px;
  font-weight: 650;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}
.agent-proximity-site .proximity-agent,
.agent-proximity-site .proximity-cluster-weave,
.agent-proximity-site .proximity-cluster-mist {
  cursor: pointer;
  transition: opacity 180ms ease;
}
.agent-proximity-site .proximity-center-halo {
  transform-box: fill-box;
  transform-origin: center;
  animation: agentProximityBreathe 5.2s ease-in-out infinite;
}
.agent-proximity-site .proximity-bulb-glow { animation: agentProximityFlicker 4.6s ease-in-out infinite; }
.agent-proximity-site .proximity-spore { animation: agentProximitySpore 11s linear infinite; }
.agent-proximity-site .proximity-tooltip {
  position: absolute;
  z-index: 6;
  max-width: 16rem;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--console-rule-strong);
  border-radius: 0.5rem;
  background: var(--console-card);
  box-shadow: 0 1.2rem 2.5rem -1.2rem color-mix(in srgb, var(--console-text) 55%, transparent);
  color: var(--console-text-dim);
  font-family: var(--console-mono);
  font-size: 0.62rem;
  line-height: 1.55;
  letter-spacing: 0.04em;
  pointer-events: none;
}
.agent-proximity-site .proximity-tooltip-name {
  font-family: var(--font-body, system-ui, sans-serif);
  font-size: 0.8rem;
  color: var(--console-text);
}
.agent-proximity-site .proximity-tooltip-meta { color: var(--console-text-muted); }
.agent-proximity-site .proximity-tooltip-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  margin-top: 0.3rem;
}
.agent-proximity-site .proximity-tooltip-tag {
  padding: 0 0.45rem;
  border: 1px solid var(--console-rule-strong);
  border-radius: 100px;
  color: var(--console-text-dim);
  font-size: 0.56rem;
  letter-spacing: 0.08em;
  text-transform: lowercase;
}
.agent-proximity-site .proximity-field--dense .proximity-node-label,
.agent-proximity-site .proximity-field--dense .proximity-label-leader {
  opacity: 0;
  transition: opacity 160ms ease;
}
.agent-proximity-site .proximity-field--dense .proximity-agent:hover .proximity-node-label,
.agent-proximity-site .proximity-field--dense .proximity-agent:focus .proximity-node-label,
.agent-proximity-site .proximity-field--dense .proximity-agent:hover .proximity-label-leader,
.agent-proximity-site .proximity-field--dense .proximity-agent:focus .proximity-label-leader {
  opacity: 1;
}
.agent-proximity-site .proximity-empty {
  display: grid;
  min-height: 18rem;
  place-content: center;
  color: var(--console-text-muted);
  text-align: center;
}
.agent-proximity-site__legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem 1.6rem;
  margin-top: 1.6rem;
  padding-top: 1rem;
  border-top: 1px solid var(--console-rule);
  color: var(--console-text-muted);
  font-family: var(--console-mono);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.agent-proximity-site__legend b { color: var(--console-accent); font-weight: 500; }
@keyframes agentProximityBreathe {
  0%, 100% { opacity: 0.55; transform: scale(1); }
  50% { opacity: 0.95; transform: scale(1.18); }
}
@keyframes agentProximityFlicker {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
@keyframes agentProximitySpore {
  0% { opacity: 0; transform: translateY(14px); }
  18% { opacity: 0.42; }
  82% { opacity: 0.3; }
  100% { opacity: 0; transform: translateY(-26px); }
}
@keyframes proximityRippleShimmer {
  0%, 100% { filter: none; }
  2.5% { filter: brightness(2) drop-shadow(0 0 7px color-mix(in srgb, var(--console-accent) 85%, transparent)); }
  9% { filter: none; }
}
@media (max-width: 900px) {
  .agent-proximity-site__grid { grid-template-columns: 1fr; }
  .agent-proximity-site__heading { max-width: 17ch; }
  .agent-proximity-site__lede { max-width: 60ch; }
  .agent-proximity-site .proximity-field { min-height: 22rem; }
  .agent-proximity-site .proximity-field > svg { min-height: 21rem; }
}
@media (max-width: 560px) {
  .agent-proximity-site { padding: 2rem 1rem; border-radius: 0.5rem; }
  .agent-proximity-site__stats { gap: 1rem 1.4rem; }
  .agent-proximity-site__stat-number { font-size: 1.8rem; }
  .agent-proximity-site .proximity-field { min-height: 18rem; }
  .agent-proximity-site .proximity-field > svg { min-height: 17rem; }
}
@media (prefers-reduced-motion: reduce) {
  .agent-proximity-site .proximity-center-halo,
  .agent-proximity-site .proximity-bulb-glow,
  .agent-proximity-site .proximity-spore { animation: none; }
  /* SMIL motion can't be paused from CSS — hide the animated dots/rings. */
  .agent-proximity-site .proximity-pulse,
  .agent-proximity-site .proximity-ripple { display: none; }
  /* the shimmer delay is inlined per node, so the override needs force */
  .agent-proximity-site .proximity-agent { animation: none !important; }
}
`;

export function AgentProximityMapTemplate(data: ProximityMapData): JSX.Element {
  const activeCount = data.nodes.filter(
    (node) => node.status !== "archived",
  ).length;
  const archivedCount = data.nodes.length - activeCount;

  return (
    <section class="agent-proximity-site" aria-label="Agent proximity map">
      <style>{SITE_STYLES}</style>
      <div class="agent-proximity-site__grid">
        <div class="agent-proximity-site__copy">
          <p class="agent-proximity-site__kicker">Agent network</p>
          <h2 class="agent-proximity-site__heading">
            The rhizome grows <em>beneath this brain</em>
          </h2>
          <p class="agent-proximity-site__lede">
            Every agent this brain has met, mapped by how close its work runs to
            ours — distance measured in meaning, not geography. Threads thicken
            where practices touch; where several lights gather, a constellation
            forms.
          </p>

          <div class="agent-proximity-site__stats" aria-label="Network summary">
            <div>
              <div class="agent-proximity-site__stat-number">{activeCount}</div>
              <div class="agent-proximity-site__stat-label">agents</div>
            </div>
            <div>
              <div class="agent-proximity-site__stat-number">
                {data.clusters.length}
              </div>
              <div class="agent-proximity-site__stat-label">constellations</div>
            </div>
            <div>
              <div class="agent-proximity-site__stat-number">
                {archivedCount}
              </div>
              <div class="agent-proximity-site__stat-label">
                archived traces
              </div>
            </div>
          </div>

          <a class="agent-proximity-site__cta" href="/agents">
            Meet the agents
          </a>
          {data.pendingCount > 0 && (
            <p class="agent-proximity-site__note">
              {data.pendingCount} pending semantic indexing
            </p>
          )}
          {data.center.kind === "centroid" && (
            <p class="agent-proximity-site__note">
              Identity not indexed yet — using network centroid
            </p>
          )}
        </div>

        <div class="agent-proximity-site__map">
          <ProximityMap data={data} surface="site" />
        </div>
      </div>

      <div class="agent-proximity-site__legend" aria-label="Agent kinds">
        <span>
          <b>●</b> professional
        </span>
        <span>
          <b>∴</b> team
        </span>
        <span>
          <b>◌</b> collective
        </span>
        <span>
          <b>·</b> archived trace
        </span>
      </div>
    </section>
  );
}
