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
  /* A solid halo in the page colour parts the rings under the name; the wide layer softens its edge. */
  text-shadow: 0 0 1px var(--color-bg), 0 0 2px var(--color-bg), 0 0 2px var(--color-bg), 0 0 3px var(--color-bg), 0 0 4px var(--color-bg), 0 0 6px var(--color-bg), 0 0 10px var(--color-bg);
  /* Set by the script from the name's measured box. */
  translate: var(--atlas-name-shift, 0 0);
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
.atlas__tip em {
  display: block; margin-top: .1rem; font-family: var(--font-heading); font-size: .82rem; letter-spacing: .02em;
  font-variation-settings: "SOFT" 60, "opsz" 24; color: var(--color-text-muted);
}
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
/* After the resting styles, so these win. Touch has no hover to reveal what is a link: the open card's title reads as one,
   and the topics rest in the state a pointer would give them, as choices to tap. */
@media (hover: none) {
  .atlas__tip b { text-decoration-line: underline; text-decoration-color: var(--color-accent); text-decoration-thickness: 1px; text-underline-offset: .2em; }
  .atlas__topics { gap: .45rem; }
  .atlas__topics a { background: var(--color-bg-subtle); padding: .65rem .8rem; }
}

/* The docked chat box: Web Chat mounts the conversation into this host and
   styles it; the atlas themes it and keeps its composer the same before and
   after the mount. The page already presents the opening and its topics. */
.atlas--chat .atlas__talk { max-height: calc(100svh - 4.5rem); overflow-y: auto; }
.atlas__ask {
  margin-top: 1.6rem; max-width: 34rem;
  --ask-wash: var(--color-bg-subtle); --ask-display: var(--font-heading); --ask-muted: var(--color-text-light);
}
/* Out of sight until Web Chat's boot has made the box live; the door stays either way. */
.atlas__ask:not([data-ask-ready]) { display: none; }
.atlas__ask-status { margin: 0 0 .5rem; font-size: .84rem; color: var(--color-text-light); }
.atlas__ask-status:empty { display: none; }
.atlas__ask .brain-box-welcome { display: none; }
.atlas__ask .brain-box-header-actions { margin: 0 0 .5rem; }
.atlas__ask .brain-box-bottom { border-top: 0; margin-top: .4rem; padding-top: 0; }
.atlas__ask .brain-box-hint { margin: .55rem 0 0 1.1rem; }
.atlas__ask .brain-box-hint:empty { display: none; }
.atlas__composer, .atlas__ask .prompt-row {
  display: flex; align-items: flex-end; gap: .6rem; padding: .5rem .5rem .5rem 1.1rem;
  border-radius: 1.4rem; background: var(--color-bg-subtle); border: 1px solid var(--color-border);
  box-shadow: 0 22px 50px -32px rgb(from var(--color-text) r g b / .5);
}
.atlas__composer:focus-within, .atlas__ask .prompt-row:focus-within { border-color: var(--color-accent); }
.atlas__composer textarea, .atlas__ask .prompt-row textarea {
  flex: 1; min-width: 0; resize: none; border: 0; background: transparent; color: var(--color-text);
  font: inherit; font-size: 1.1rem; line-height: 1.4; padding: .55rem 0; field-sizing: content; min-height: 1.4em; max-height: 7em;
}
.atlas__composer textarea:focus, .atlas__ask .prompt-row textarea:focus { outline: none; }
.atlas__send, .atlas__ask .send {
  flex: none; display: grid; place-items: center; width: 2.7rem; height: 2.7rem; border: 0; border-radius: 50%;
  background: var(--color-accent); color: var(--color-text-inverse); cursor: pointer; font-size: 1.2rem; font-weight: 600;
}
.atlas__send svg { width: 1.1rem; height: 1.1rem; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
.atlas__send:disabled, .atlas__ask .send:disabled { opacity: .5; cursor: default; }
.atlas__send:focus-visible, .atlas__ask .send:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }

/* An answer turns the map towards the sources it drew on. */
.atlas__field { transition: transform .9s cubic-bezier(.3, .7, .2, 1); }
.atlas__field[data-focused] { transform: scale(var(--atlas-focus-scale, 1)); transform-origin: var(--atlas-focus-x, 50%) var(--atlas-focus-y, 50%); }
.atlas__field[data-focused] .atlas__mark:not([data-cited]) { opacity: .45; }
.atlas__mark[data-cited] { z-index: 3; }
.atlas__mark[data-cited] .atlas__glyph { background: var(--color-accent); transform: scale(1.5); box-shadow: 0 0 0 3px var(--color-bg), 0 0 0 7px rgb(from var(--color-accent) r g b / .22); }
.atlas__mark--deck[data-cited] .atlas__glyph { transform: rotate(45deg) scale(1.5); }
/* Leads from the answer’s listed sources to their marks; the script draws them on desktop only. */
.atlas__leads { position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; pointer-events: none; }
.atlas__leads path { fill: none; stroke: var(--color-accent); stroke-width: 1.6; stroke-linecap: round; stroke-dasharray: .1 6; }

@media (max-width: 60rem) {
  /* The map leads visually on phones; the conversation stays first in the document.
     The first screen holds the map and the headline together. */
  .atlas { flex-direction: column; min-height: 0; --atlas-band: clamp(17rem, 47svh, 25rem); }
  .atlas__map { order: -1; position: relative; inset: auto; height: var(--atlas-band); }
  /* Marks stay above the fade strip, where the legend rests. */
  .atlas__field { bottom: 2rem; }
  /* Long names take two short lines, so more of them fit a narrow map. */
  .atlas__zone { font-size: .8rem; white-space: normal; width: max-content; max-width: 9em; text-align: center; line-height: 1.15; }
  /* The build records where the map's content ends (--atlas-fill of the field); the legend and the text start there, over the fading outer rings. */
  .atlas__legend { left: clamp(1rem, 5vw, 2rem); right: auto; bottom: calc(.35rem + (1 - var(--atlas-fill, 1)) * (var(--atlas-band) - 2rem)); padding: .25rem .7rem; font-size: .74rem; gap: .3rem .9rem; }
  .atlas__legend .atlas__caption { display: none; }
  .atlas__talk { width: auto; margin-top: calc(-1 * (1 - var(--atlas-fill, 1)) * (var(--atlas-band) - 2rem)); padding: .9rem clamp(1rem, 5vw, 2rem) 2.5rem; background: none; }
  .atlas__byline { margin-bottom: .8rem; gap: .55rem; }
  .atlas__initials { width: 1.8rem; height: 1.8rem; font-size: .72rem; }
  .atlas h1 { font-size: clamp(2.5rem, 11.5vw, 3.6rem); margin-bottom: 1rem; }
  .atlas__leads { display: none; }
  /* The text flows with the page on phones; only desktop scrolls it beside the map. */
  .atlas--chat .atlas__talk { max-height: none; overflow: visible; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas__contour { animation: none; }
  .atlas__glyph, .atlas__tip, .atlas__field { transition: none; }
}
`;
