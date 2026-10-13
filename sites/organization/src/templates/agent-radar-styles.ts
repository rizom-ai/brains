/** How often the pulse leaves the team, and how long it takes to reach the edge ring. */
export const PULSE_PERIOD = 9;
export const PULSE_TRAVEL = 6;

/**
 * The radar in the atlas's own hand: shared theme tokens only, on top of the
 * kit's atlas styles (frame, marks, title cards, names and legend).
 */
export const agentRadarStyles: string = String.raw`
.radar__bleed { position: absolute; inset: 0; overflow: hidden; container-type: size;
  mask-image: linear-gradient(90deg, transparent, #000 7%, #000 95%, transparent), linear-gradient(180deg, transparent, #000 6%, #000 94%, transparent);
  mask-composite: intersect; }
/* The scope keeps clear of the legend at the foot of the map box. */
.radar { position: absolute; top: calc(50% - 1.75rem); left: 50%; width: min(92cqw, calc(100cqh - 6rem)); aspect-ratio: 1; transform: translate(-50%, -50%); }
.radar svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
/* The scope: quiet range rings, the edge ring with its bearing ticks, rings fading out beyond it. */
.scope__ring { fill: none; stroke: var(--color-text); stroke-opacity: .13; stroke-width: .7; vector-effect: non-scaling-stroke; }
.scope__ring--edge { stroke-opacity: .3; }
.scope__ring--beyond { stroke-opacity: .06; stroke-dasharray: 1 4; }
.scope__tick { stroke: var(--color-text); stroke-opacity: .22; stroke-width: .7; vector-effect: non-scaling-stroke; }
.scope__tick--long { stroke-opacity: .45; }
/* Echoes: the atlas's contour line, only where agents return signal. */
@property --atlas-contour { syntax: "<color>"; inherits: true; initial-value: #18132a; }
.echo__line { fill: none; stroke: var(--atlas-contour); stroke-width: .7; stroke-linejoin: round; vector-effect: non-scaling-stroke; stroke-opacity: .5;
  animation: atlas-drift 34s steps(170) infinite alternate; }
.echo__line:nth-child(1) { stroke-opacity: .16; } .echo__line:nth-child(2) { stroke-opacity: .24; } .echo__line:nth-child(3) { stroke-opacity: .34; }
.echo__line:nth-child(4) { stroke-width: 1.2; stroke-opacity: .52; }
.echo__core { stroke-opacity: .6; }
.echo--lone .echo__line { stroke-opacity: .3; }
.echo--pending .echo__line { stroke-dasharray: 1.5 2.5; }
.echo__thread { stroke: var(--color-text); stroke-opacity: .35; stroke-width: .8; stroke-dasharray: 1 3; vector-effect: non-scaling-stroke; }
[data-atlas][data-still] .echo__line { animation-play-state: paused; }
/* The one motion: a pulse radiates from the team; each echo and mark lights as the wave reaches it,
   so what is closest to the team's work lights first. */
.radar__pulse { position: absolute; inset: 0; border-radius: 50%; pointer-events: none; transform: scale(0);
  background: radial-gradient(circle, transparent 48%, rgb(from var(--color-accent) r g b / .05) 74%, rgb(from var(--color-accent) r g b / .16) 92%, rgb(from var(--color-accent) r g b / .62) 99%, transparent 100%);
  box-shadow: 0 0 28px 3px rgb(from var(--color-accent) r g b / .22);
  animation: radar-pulse 9s linear infinite; }
@keyframes radar-pulse { 0% { transform: scale(0); opacity: 1; } 66.7% { transform: scale(1); opacity: .15; } 66.8%, 100% { transform: scale(1); opacity: 0; } }
.echo { animation: echo-return 9s linear infinite; animation-delay: var(--pulse-at, 0s); }
@keyframes echo-return { 0% { --atlas-contour: var(--color-accent); } 20%, 100% { --atlas-contour: var(--color-text); } }
[data-theme="dark"] .echo { animation-name: echo-return-dark; }
@keyframes echo-return-dark { 0% { --atlas-contour: var(--color-heading); } 20%, 100% { --atlas-contour: var(--color-accent); } }
.atlas__mark .atlas__glyph { animation: radar-blip 9s linear infinite; animation-delay: var(--pulse-at, 0s); }
@keyframes radar-blip { 0% { background: var(--color-accent); box-shadow: 0 0 0 3px var(--color-bg), 0 0 12px 4px rgb(from var(--color-accent) r g b / .45); } 10%, 100% { box-shadow: 0 0 0 3px var(--color-bg); } }
/* Kinds: people are dots, teams diamonds, organizations squares. */
.atlas__mark--team .atlas__glyph { border-radius: 1px; transform: rotate(45deg); }
.atlas__mark--organization .atlas__glyph { width: 8px; height: 8px; border-radius: 1.5px; }
.atlas__mark--team a:focus-visible .atlas__glyph, .atlas__mark--team[data-open] .atlas__glyph { transform: rotate(45deg) scale(1.5); }
@media (hover: hover) { .atlas__mark--team a:hover .atlas__glyph { transform: rotate(45deg) scale(1.5); } }
.radar__mark--pending .atlas__glyph { background: var(--color-bg); box-shadow: 0 0 0 1.5px var(--color-text-light), 0 0 0 4px var(--color-bg); animation: none; }
/* Names: every agent beside its mark; constellations in the atlas's italic across their echo. */
.radar__name { position: absolute; left: calc(50% + .85rem); top: 50%; transform: translateY(-50%); white-space: nowrap; pointer-events: none;
  font-family: var(--font-heading); font-size: .84rem; font-variation-settings: "opsz" 14; color: var(--color-text-muted);
  text-shadow: 0 0 .45rem var(--color-bg), 0 0 .2rem var(--color-bg), 0 0 .1rem var(--color-bg); }
.radar__name--left { left: auto; right: calc(50% + .85rem); }
.atlas__mark:hover .radar__name, .atlas__mark:focus-within .radar__name, .atlas__mark[data-open] .radar__name { opacity: 0; }
.radar__mark--pending .radar__name { font-style: italic; color: var(--color-text-light); }
.radar__constellation { transform: translate(-50%, -50%); font-size: 1.12rem; color: var(--color-heading);
  text-shadow: 0 0 .6rem var(--color-bg), 0 0 .3rem var(--color-bg), 0 0 .15rem var(--color-bg); }
.radar__centre { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -.6rem); margin: 0; display: flex; flex-direction: column; align-items: center; gap: .45rem; pointer-events: none; }
.radar__centre i { width: 1.2rem; height: 1.2rem; border-radius: 50%; background: var(--color-text); box-shadow: 0 0 0 4px var(--color-bg), 0 0 0 5px rgb(from var(--color-text) r g b / .3);
  animation: radar-emit 9s ease-out infinite; }
@keyframes radar-emit { 0% { box-shadow: 0 0 0 4px var(--color-bg), 0 0 0 5px rgb(from var(--color-text) r g b / .3), 0 0 24px 8px rgb(from var(--color-accent) r g b / .55); } 18%, 100% { box-shadow: 0 0 0 4px var(--color-bg), 0 0 0 5px rgb(from var(--color-text) r g b / .3); } }
.radar__centre span { font-family: var(--font-heading); font-size: 1rem; font-weight: 500; color: var(--color-heading); white-space: nowrap; text-shadow: 0 0 .5rem var(--color-bg), 0 0 .2rem var(--color-bg); }
.atlas__legend .radar__key--team i { border-radius: 1px; transform: rotate(45deg); }
.atlas__legend .radar__key--organization i { border-radius: 1.5px; }
.atlas__legend .radar__key--pending i { background: none; box-shadow: inset 0 0 0 1.5px var(--color-text-muted); }
@media (prefers-reduced-motion: reduce) {
  .radar__pulse { display: none; }
  .echo, .echo__line, .atlas__mark .atlas__glyph, .radar__centre i { animation: none; }
}
@media (max-width: 60rem) {
  .radar { top: calc(50% - 1.1rem); width: min(100cqw, calc(100cqh - 3.4rem)); }
  .radar__name { font-size: .72rem; left: calc(50% + .6rem); }
  .radar__name--left { left: auto; right: calc(50% + .6rem); }
  .radar__constellation { font-size: .95rem; }
}
/* On a narrow phone the names would crowd each other; a tap opens each agent's card instead. */
@media (max-width: 40rem) { .radar__name { display: none; } }
`;
