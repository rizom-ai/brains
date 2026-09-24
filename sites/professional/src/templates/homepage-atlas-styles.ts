/** Scoped atlas styles: shared theme tokens only, no palette values. */
export const homepageAtlasStyles: string = String.raw`
.atlas {
  --atlas-contour: var(--color-text);
  --atlas-talk: min(40rem, 46%);
  position: relative; isolation: isolate; overflow: hidden;
  display: flex; align-items: stretch;
  min-height: calc(100svh - 4.5rem);
  background: var(--color-bg); border-bottom: 1px solid var(--color-rule);
}
[data-theme="dark"] .atlas { --atlas-contour: var(--color-accent); }
.atlas__map { position: absolute; inset: 0 0 0 var(--atlas-talk); }
.atlas__field { position: absolute; inset: 0; }
.atlas__terrain {
  position: absolute; inset: 0; width: 100%; height: 100%;
  /* The field is cut at the map box; fade the rings out before they reach it. */
  mask-image: linear-gradient(90deg, transparent, #000 9%, #000 93%, transparent), linear-gradient(180deg, transparent, #000 8%, #000 92%, transparent);
  mask-composite: intersect;
}
.atlas__contour {
  fill: none; stroke: var(--atlas-contour); stroke-width: .7;
  stroke-linejoin: round; vector-effect: non-scaling-stroke;
}
.atlas__contour--index { stroke-width: 1.2; }
/* Drift in fine steps (~5 a second, each a fraction of a pixel): the same motion without repainting every frame. */
.atlas__contour { animation: atlas-drift 34s steps(170) infinite alternate; }
[data-atlas][data-still] .atlas__contour { animation-play-state: paused; }
@keyframes atlas-drift {
  from { transform: translate(-.6px, .45px); }
  to { transform: translate(.6px, -.45px); }
}
.atlas__zone {
  position: absolute; transform: translate(-50%, -100%); white-space: nowrap; pointer-events: none;
  font-family: var(--font-heading); font-style: italic; font-size: 1rem; letter-spacing: .03em;
  font-variation-settings: "SOFT" 60, "opsz" 24; color: var(--color-text-muted);
  text-shadow: 0 0 .5rem var(--color-bg), 0 0 .2rem var(--color-bg);
}
.atlas__marks { list-style: none; margin: 0; padding: 0; }
.atlas__mark { position: absolute; transform: translate(-50%, -50%); }
.atlas__mark > a, .atlas__mark > span:first-child {
  display: grid; place-items: center; width: 1.6rem; height: 1.6rem; border-radius: 50%; color: inherit;
}
.atlas__glyph {
  display: block; width: 7px; height: 7px; border-radius: 50%; background: var(--color-text);
  box-shadow: 0 0 0 3px var(--color-bg); transition: transform .25s, background-color .25s;
}
.atlas__mark--deck .atlas__glyph { border-radius: 1px; transform: rotate(45deg); }
.atlas__mark--project .atlas__glyph { width: 8px; height: 8px; border-radius: 1.5px; }
.atlas__mark a:focus-visible .atlas__glyph { background: var(--color-accent); transform: scale(1.5); }
.atlas__mark--deck a:focus-visible .atlas__glyph { transform: rotate(45deg) scale(1.5); }
.atlas__mark a:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
.atlas__tip {
  position: absolute; z-index: 2; bottom: calc(100% + .3rem); left: 50%; transform: translateX(-50%);
  width: max-content; max-width: 16rem; padding: .45rem .65rem .5rem; text-align: left;
  border-radius: .5rem; background: var(--color-bg-subtle); border: 1px solid var(--color-border);
  box-shadow: 0 12px 30px -16px rgb(from var(--color-text) r g b / .5);
  opacity: 0; pointer-events: none; transition: opacity .2s;
}
.atlas__mark--west .atlas__tip { left: auto; right: 50%; transform: none; }
.atlas__mark--east .atlas__tip { left: 50%; transform: none; }
/* A transformed mark is its own stacking context: lift the active one over its neighbours. */
.atlas__mark:focus-within, .atlas__mark[data-open] { z-index: 3; }
.atlas__mark[data-open] .atlas__tip { opacity: 1; }
.atlas__mark[data-open] .atlas__glyph { background: var(--color-accent); transform: scale(1.5); }
.atlas__mark--deck[data-open] .atlas__glyph { transform: rotate(45deg) scale(1.5); }
.atlas__tip b { display: block; font-family: var(--font-heading); font-weight: 500; font-size: .98rem; line-height: 1.2; color: var(--color-heading); }
.atlas__tip span { font-size: .78rem; color: var(--color-text-light); }
.atlas__mark a:focus-visible .atlas__tip { opacity: 1; }
/* Touch browsers leave hover stuck on the tapped element; there the script opens cards instead. */
@media (hover: hover) {
  .atlas__mark:hover { z-index: 3; }
  .atlas__mark a:hover .atlas__glyph { background: var(--color-accent); transform: scale(1.5); }
  .atlas__mark--deck a:hover .atlas__glyph { transform: rotate(45deg) scale(1.5); }
  .atlas__mark a:hover .atlas__tip { opacity: 1; }
}
.atlas__legend {
  position: absolute; right: clamp(1rem, 3vw, 3rem); bottom: 1.1rem; margin: 0;
  display: flex; flex-wrap: wrap; align-items: center; gap: .4rem 1.1rem; padding: .4rem .85rem;
  border-radius: 999px; background: rgb(from var(--color-bg) r g b / .72); backdrop-filter: blur(6px);
  font-size: .85rem; color: var(--color-text-light);
}
.atlas__legend span { display: inline-flex; align-items: center; gap: .35rem; }
.atlas__legend i { display: inline-block; width: 7px; height: 7px; background: var(--color-text-muted); border-radius: 50%; }
.atlas__legend .atlas__key--deck i { border-radius: 1px; transform: rotate(45deg); }
.atlas__legend .atlas__key--project i { border-radius: 1.5px; }

.atlas__talk {
  position: relative; z-index: 1; width: calc(var(--atlas-talk) + 2rem);
  display: flex; flex-direction: column; justify-content: center;
  padding: clamp(2.5rem, 7vh, 5rem) 4rem clamp(2rem, 6vh, 4rem) clamp(1.25rem, 4vw, 3rem);
  background: linear-gradient(90deg, var(--color-bg) 0% 88%, rgb(from var(--color-bg) r g b / 0) 100%);
}
.atlas--bare .atlas__talk { width: min(48rem, 100%); background: none; }
.atlas__byline { display: flex; align-items: center; gap: .7rem; margin-bottom: 1.5rem; }
.atlas__initials {
  flex: none; display: grid; place-items: center; width: 2.3rem; height: 2.3rem; border-radius: 50%;
  background: var(--color-text); color: var(--color-bg);
  font-family: var(--font-heading); font-size: .85rem; letter-spacing: .03em;
}
.atlas__byline b { display: block; font-weight: 600; font-size: .98rem; line-height: 1.2; color: var(--color-heading); }
.atlas__byline small { font-size: .85rem; color: var(--color-text-light); }
.atlas h1 {
  margin: 0 0 1.4rem; font-family: var(--font-heading); font-weight: 400;
  font-size: clamp(2.8rem, 5.2vw, 4.9rem); line-height: 1; letter-spacing: -.018em; text-wrap: balance;
  font-variation-settings: "SOFT" 50, "opsz" 96; color: var(--color-heading);
}
.atlas__emphasis { font-style: italic; color: var(--color-accent); }
.atlas__prose { max-width: 31rem; font-family: var(--font-heading); font-weight: 300; font-size: clamp(1.1rem, 1.35vw, 1.25rem); line-height: 1.55; font-variation-settings: "opsz" 24; color: var(--color-text-muted); overflow-wrap: anywhere; }
.atlas__prose p { margin: 0 0 .8em; font-size: inherit; line-height: inherit; color: inherit; }
.atlas__prose a { color: var(--color-accent); text-underline-offset: .18em; }
.atlas__door { margin-top: 2rem; max-width: 31rem; }
.atlas__door h2 { margin: 0 0 .4rem; font-family: var(--font-heading); font-weight: 500; font-size: 1.45rem; line-height: 1.2; color: var(--color-heading); font-variation-settings: "opsz" 36; }
.atlas__topics { list-style: none; margin: .5rem 0 1.2rem; padding: 0; display: grid; gap: .1rem; }
.atlas__topics a {
  display: block; margin: 0 -.7rem; padding: .45rem .7rem; border-radius: .7rem;
  font-family: var(--font-heading); font-style: italic; font-size: 1.1rem; line-height: 1.3;
  color: var(--color-text); text-decoration: none; overflow-wrap: anywhere;
}
.atlas__topics a:hover, .atlas__topics a:focus-visible { background: var(--color-bg-subtle); color: var(--color-accent); }
.atlas__contact {
  display: inline-block; border-radius: 999px; padding: .85rem 1.3rem; text-decoration: none;
  background: var(--color-accent); color: var(--color-text-inverse); font-weight: 600; line-height: 1;
}
.atlas__contact:hover { background: var(--color-accent-dark); }
.atlas__contact:focus-visible, .atlas__topics a:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }
.atlas__note { margin: .9rem 0 0; font-size: .84rem; color: var(--color-text-light); }

@media (max-width: 60rem) {
  /* The map leads visually on phones; the conversation stays first in the document. */
  .atlas { flex-direction: column; min-height: 0; }
  .atlas__map { order: -1; }
  .atlas__map { position: relative; inset: auto; height: clamp(20rem, 46svh, 30rem); }
  .atlas__talk { width: auto; padding: 1.6rem clamp(1rem, 5vw, 2rem) 2.5rem; background: none; }
  .atlas__zone { font-size: .82rem; }
  /* Phones keep a strip under the field so the legend never covers a mark. */
  .atlas__field { bottom: 2.6rem; }
  .atlas__legend { left: clamp(1rem, 5vw, 2rem); right: auto; bottom: .6rem; font-size: .78rem; }
  .atlas__legend .atlas__caption { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas__contour { animation: none; }
  .atlas__glyph, .atlas__tip { transition: none; }
}
`;
