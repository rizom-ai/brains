import { ASK_SHEET_MEDIA } from "@brains/contracts";

/** Scoped atlas styles: shared theme tokens only, no palette values. */
export const homepageAtlasStyles: string = String.raw`
.atlas {
  --atlas-contour: var(--color-text);
  /* The copy starts on the header's content edge: the layout column, centred, or its 3rem gutter. */
  --atlas-edge: max(3rem, (100% - var(--layout-max-width, 72rem)) / 2);
  --atlas-talk: calc(min(40rem, 46%) + var(--atlas-edge) - 3rem);
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
/* Near the map's top a card opens below its mark. */
.atlas__mark--south .atlas__tip { top: calc(100% + .3rem); bottom: auto; }
/* A transformed mark is its own stacking context: lift the active one over its neighbours. */
.atlas__mark:focus-within { z-index: 3; }
/* An open card sits above every other mark, lit ones (z-index 3) included. */
.atlas__mark[data-open] { z-index: 4; }
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
/* The latest piece: one accent ring around its mark, drawn once; the legend's
   "Latest" names the ring and opens the piece's card. */
.atlas__mark--latest > a { position: relative; }
.atlas__mark--latest > a::after {
  content: ""; position: absolute; inset: -.2rem; border-radius: 50%;
  border: 1.5px solid var(--color-accent); pointer-events: none;
  animation: atlas-latest 1.4s cubic-bezier(.3, .7, .2, 1) .6s both;
}
@keyframes atlas-latest { from { opacity: 0; transform: scale(.35); } }
.atlas__legend .atlas__key--latest { display: inline-flex; align-items: center; gap: .35rem; color: inherit; text-decoration: none; }
.atlas__legend .atlas__key--latest i { width: 9px; height: 9px; background: none; box-shadow: inset 0 0 0 1.5px var(--color-accent); }
.atlas__legend .atlas__key--latest:is(:hover, :focus-visible) { color: var(--color-accent); }

.atlas__talk {
  position: relative; z-index: 1; width: calc(var(--atlas-talk) + 2rem);
  display: flex; flex-direction: column; justify-content: center;
  padding: clamp(2.5rem, 7vh, 5rem) 4rem clamp(2rem, 6vh, 4rem) var(--atlas-edge);
  background: linear-gradient(90deg, var(--color-bg) 0% 88%, rgb(from var(--color-bg) r g b / 0) 100%);
}
.atlas--bare .atlas__talk { width: min(calc(48rem + var(--atlas-edge) - 3rem), 100%); background: none; }
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
  .atlas__topics { gap: 0; }
  .atlas__topics a { margin: 0; padding: .7rem 0; border-radius: 0; border-bottom: 1px solid var(--color-border); }
  .atlas__topics li:first-child a { border-top: 1px solid var(--color-border); }
  .atlas__topics a:hover, .atlas__topics a:focus-visible { background: none; }
}

/* The docked chat box: Web Chat mounts the conversation into this host and
   styles it; the atlas themes it and keeps its composer the same before and
   after the mount. The page already presents the opening and its topics. */
.atlas--chat .atlas__talk {
  max-height: calc(100svh - 4.5rem); overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: var(--color-rule) transparent;
}
.atlas__ask {
  margin-top: 1.6rem; max-width: 34rem;
  --ask-wash: var(--color-bg-subtle); --ask-display: var(--font-heading); --ask-muted: var(--color-text-light);
}
/* Out of sight until Web Chat's boot has made the box live; the door stays either way. */
.atlas__ask:not([data-ask-ready]) { display: none; }
.atlas__ask-status { margin: 0 0 .5rem; font-size: .84rem; color: var(--color-text-light); }
.atlas__ask-status:empty { display: none; }
.atlas__ask .brain-box-welcome { display: none; }
/* The text column is the one scroller beside the map; the conversation grows inside it. */
.atlas__ask:not([data-ask-sheet]) .brain-box-scroll { max-height: none; overflow: visible; }
.atlas__ask .brain-box-header-actions { margin: 0 0 .5rem; }
.atlas__ask .brain-box-bottom { border-top: 0; margin-top: .4rem; padding-top: 0; }
.atlas__ask .brain-box-hint { margin: .55rem 0 0 1.1rem; text-align: left; }
.atlas__ask .brain-box-latest { align-self: flex-start; margin: .55rem 0 0 1.1rem; }
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
/* Nothing to send yet: the same button, quiet, on the page and in the sheet. */
.atlas__send:disabled, .atlas__ask .send:disabled { opacity: 1; background: color-mix(in srgb, var(--color-text) 8%, var(--color-bg)); color: var(--color-text-light); cursor: default; }
.atlas__send:focus-visible, .atlas__ask .send:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 3px; }

/* An answer's sources in the map's own shapes, each named as the legend
   names its kind (the script copies the name from its mark). */
.atlas__ask .brain-box-sources [data-ask-source^="deck:"] .brain-box-source-mark { border-radius: 1px; rotate: 45deg; scale: .85; }
.atlas__ask .brain-box-sources [data-ask-source^="project:"] .brain-box-source-mark { border-radius: 1.5px; }
.atlas__ask .brain-box-sources [data-atlas-type]::after { content: attr(data-atlas-type); margin-left: auto; padding-left: .75rem; font-size: .8rem; color: var(--color-text-light); white-space: nowrap; }

/* A phone's open conversation links a lit piece to where it is cited (see below). */
.atlas__cited { display: none; }
/* A tapped source pulses its piece; a piece's source flashes in the answer. */
.atlas__mark[data-atlas-pulse] .atlas__glyph { animation: atlas-pulse 1.1s ease-out 2; }
.atlas__ask [data-ask-source][data-atlas-flash] { animation: atlas-flash 1.5s ease-out; }
@keyframes atlas-pulse { 35% { scale: 1.9; } }
@keyframes atlas-flash { 0%, 40% { border-color: var(--color-accent); background: var(--color-bg-subtle); } }
/* An answer turns the map towards the sources it drew on. */
.atlas__field { transition: transform .9s cubic-bezier(.3, .7, .2, 1); }
.atlas__field[data-focused] { transform: scale(var(--atlas-focus-scale, 1)); transform-origin: var(--atlas-focus-x, 50%) var(--atlas-focus-y, 50%); }
.atlas__field[data-focused] .atlas__mark:not([data-cited]) { opacity: .45; }
.atlas__mark[data-cited] { z-index: 3; }
/* An open lit piece keeps its card above the other lit ones. */
.atlas__mark[data-cited][data-open] { z-index: 4; }
/* A lit piece: its shape in the accent with one thin ring, so close pieces stay apart. */
.atlas__mark[data-cited] .atlas__glyph { background: var(--color-accent); transform: scale(1.5); box-shadow: 0 0 0 2px var(--color-bg), 0 0 0 3px var(--color-accent); }
.atlas__mark--deck[data-cited] .atlas__glyph { transform: rotate(45deg) scale(1.5); }
/* The map zooms; its marks and their cards keep their own size, so a lit
   piece is always half again a plain mark. */
.atlas__mark > :first-child { transition: scale .9s cubic-bezier(.3, .7, .2, 1); }
.atlas__field[data-focused] :is(.atlas__mark > :first-child, .atlas__cited) { scale: calc(1 / var(--atlas-focus-scale, 1)); }
/* Leads from the answer’s listed sources to their marks; the script draws them on desktop only. */
.atlas__leads { position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; pointer-events: none; }
.atlas__leads path { fill: none; stroke: var(--color-accent); stroke-width: 1.6; stroke-linecap: round; stroke-dasharray: .1 6; }

@media (max-width: 60rem) {
  /* The map leads visually on phones; the conversation stays first in the document.
     The first screen holds the map and the headline together. */
  /* The copy and legend take the header's gutter. */
  .atlas { flex-direction: column; min-height: 0; --atlas-band: clamp(17rem, 47svh, 25rem); --atlas-edge: 1.5rem; }
  .atlas__map { order: -1; position: relative; inset: auto; height: var(--atlas-band); }
  /* Marks stay above the fade strip, where the legend rests. */
  .atlas__field { bottom: 2rem; }
  /* Long names take two short lines, so more of them fit a narrow map. */
  .atlas__zone { font-size: .8rem; white-space: normal; width: max-content; max-width: 9em; text-align: center; line-height: 1.15; }
  /* The build records where the map's content ends (--atlas-fill of the field); the legend and the text start there, over the fading outer rings. */
  .atlas__legend { left: calc(var(--atlas-edge) - .7rem); right: auto; bottom: calc(.35rem + (1 - var(--atlas-fill, 1)) * (var(--atlas-band) - 2rem)); padding: .25rem .7rem; font-size: .74rem; gap: .3rem .9rem; }
  .atlas__legend .atlas__caption { display: none; }
  .atlas__talk { width: auto; margin-top: calc(-1 * (1 - var(--atlas-fill, 1)) * (var(--atlas-band) - 2rem)); padding: .9rem var(--atlas-edge) 2.5rem; background: none; }
  .atlas h1 { font-size: clamp(2.5rem, 11.5vw, 3.6rem); margin-bottom: 1rem; }
  .atlas__leads { display: none; }
  /* The text flows with the page on phones; only desktop scrolls it beside the map. */
  .atlas--chat .atlas__talk { max-height: none; overflow: visible; }
}
@media (min-width: 48rem) and (max-width: 60rem) { .atlas { --atlas-edge: 3rem; } }
@media ${ASK_SHEET_MEDIA} {
  /* Phone type sizes: smaller than the desktop's, so the ask box shows on the first screen. */
  .atlas h1 { font-size: clamp(2.1rem, 9.5vw, 2.6rem); }
  .atlas__prose { font-size: 1rem; }
  .atlas__door h2 { font-size: 1.2rem; }
  .atlas__topics a { font-size: 1rem; }
  .atlas__composer textarea, .atlas__ask .prompt-row textarea { font-size: 1rem; }
  .atlas__ask[data-ask-sheet] .brain-box-welcome .chat-notice { font-size: 15px; }
  .atlas__ask[data-ask-sheet] .brain-box-hint { margin: .5rem 0 0; text-align: center; }
  .atlas__ask[data-ask-sheet] .brain-box-latest { align-self: center; margin: .5rem 0 0; }
  /* Text passes under a short fade below the strip, not a cut edge. */
  .atlas__ask [data-ask-dock]:has(.atlas__map)::after {
    content: ""; position: relative; z-index: 5; display: block; height: 18px; margin-bottom: -18px;
    background: linear-gradient(var(--color-bg), transparent); pointer-events: none;
  }
  /* An engaged box opens full screen (Web Chat's sheet), above the sticky
     site header. The script lends it the map for its dock, the first item of
     the conversation's scroll: as tall as the page's at the top, it scrolls
     up with the answer until only a strip is left, pinned under the header
     with the answer's pieces in view. A slot holds its place on the page.
     It is out of the way while typing. */
  .atlas:has(.atlas__ask[data-ask-sheet]) { z-index: 1000; }
  .atlas__ask[data-ask-sheet] { margin: 0; max-width: none; }
  .atlas__ask[data-ask-sheet]:not([data-ask-keyboard]) { --ask-sheet-inset: calc(var(--atlas-band) - 2rem); }
  .atlas__map-slot { order: -1; height: var(--atlas-band); }
  .atlas__ask [data-ask-dock]:has(.atlas__map) { position: sticky; z-index: 2; top: calc(7.5rem - (var(--atlas-band) - 2rem)); }
  .atlas__ask[data-ask-keyboard] [data-ask-dock] { display: none; }
  .atlas__ask [data-ask-dock] .atlas__map {
    position: relative; inset: auto; height: calc(var(--atlas-band) - 2rem); overflow: hidden;
    background: var(--color-bg); border-bottom: 1px solid var(--color-rule);
  }
  /* Marks cut by its edges fade out, as the terrain does. */
  .atlas__ask [data-ask-dock] .atlas__map::after {
    content: ""; position: absolute; inset: 0; z-index: 4; pointer-events: none;
    background: linear-gradient(180deg, var(--color-bg), transparent 1.1rem, transparent calc(100% - 1.1rem), var(--color-bg));
  }
  /* The page's own map, at its size (the band less the legend's 2rem) and
     zoom. As it scrolls up, the part that shows keeps where an answer's
     sources sit (--atlas-strip-y, set by the script), or else the middle of
     the map's content, in its middle. */
  .atlas__ask [data-ask-dock] .atlas__field {
    --atlas-field-height: calc(var(--atlas-band) - 2rem);
    --atlas-window: max(7.5rem, calc(var(--atlas-field-height) - var(--atlas-sheet-scroll, 0px)));
    inset: auto 0; height: var(--atlas-field-height);
    top: clamp(calc(var(--atlas-window) - var(--atlas-field-height)), calc(var(--atlas-field-height) - var(--atlas-window) / 2 - var(--atlas-field-height) * var(--atlas-strip-y, calc(var(--atlas-fill, 1) * 50)) / 100), calc(var(--atlas-field-height) - var(--atlas-window)));
    transition: transform .9s cubic-bezier(.3, .7, .2, 1);
  }
  /* Only an answer pans it (the script marks it); opening never slides it. */
  .atlas__ask [data-ask-dock] .atlas__field[data-atlas-panning] { transition: transform .9s cubic-bezier(.3, .7, .2, 1), top .9s cubic-bezier(.3, .7, .2, 1); }
  .atlas__ask [data-ask-dock] :is(.atlas__legend, .atlas__zone) { display: none; }
  /* A lit piece's open card leads to where the answer cites it: a small
     button beside the mark, towards the map's middle, where no edge of the
     map cuts it. */
  .atlas__ask [data-ask-dock] .atlas__mark[data-open][data-cited] .atlas__cited {
    display: block; position: absolute; z-index: 2; top: 50%; left: calc(100% + .3rem); translate: 0 -50%;
    padding: .25rem .6rem; border: 1px solid var(--color-border); border-radius: 999px;
    background: var(--color-bg-subtle); color: var(--color-accent); font: inherit; font-size: .78rem; white-space: nowrap; cursor: pointer;
  }
  .atlas__ask [data-ask-dock] .atlas__mark--west[data-open][data-cited] .atlas__cited { left: auto; right: calc(100% + .3rem); }
  /* The page presents the opening beside the box; full screen, the box does. */
  .atlas__ask[data-ask-sheet] .brain-box-welcome { display: block; }
  .atlas__ask[data-ask-sheet] .brain-box-welcome h2 { display: none; }
  /* Before the box mounts, its composer waits at the foot of the sheet. */
  .atlas__ask[data-ask-sheet] > .atlas__composer { margin: auto 0 .75rem; }
  .atlas__ask[data-ask-sheet] > .atlas__ask-status { margin-top: 1rem; }
  .atlas__ask[data-ask-sheet] .brain-box-bottom { border-top: 1px solid var(--color-rule); padding-top: .6rem; }
}
@media (prefers-reduced-motion: reduce) {
  .atlas__contour { animation: none; }
  .atlas__mark[data-atlas-pulse] .atlas__glyph, .atlas__ask [data-ask-source][data-atlas-flash] { animation: none; }
  .atlas__glyph, .atlas__tip, .atlas__field, .atlas__mark > :first-child { transition: none; }
  .atlas__mark--latest > a::after { animation: none; }
}
`;
