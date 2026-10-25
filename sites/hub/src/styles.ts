/**
 * The hub's frame and chapters, on the rizom.ai theme's tokens: night or
 * cream ground with its washes and grain, brass for the hub, Fraunces over
 * IBM Plex. The field's canvas is fixed behind everything and never takes
 * the pointer. On a wide screen each chapter's card holds the left while
 * the drawing fills the right; below 860px the drawing holds the top.
 */
export const siteCSS: string = `
.hub-site { position: relative; min-height: 100vh; background-color: var(--color-bg); background-image: radial-gradient(60vw 60vh at 78% 30%, var(--color-wash-a), transparent 70%), radial-gradient(50vw 50vh at 20% 85%, var(--color-wash-b), transparent 70%); background-attachment: fixed; color: var(--color-text); font-family: var(--font-body); font-size: 17px; line-height: 1.7; overflow-x: clip; }
.hub-site::before { content: ""; position: fixed; inset: 0; z-index: 0; pointer-events: none; background-image: var(--bg-noise); }
.hub-site a { color: inherit; text-decoration: none; }
.hub-field { position: fixed; inset: 0; width: 100vw; height: 100vh; z-index: 1; pointer-events: none; }

.hub-bar { position: fixed; top: 0; left: 0; right: 0; z-index: 10; display: flex; align-items: center; justify-content: space-between; padding: 18px clamp(16px, 4vw, 48px); background: linear-gradient(var(--color-bg) 30%, transparent); }
.hub-mark { font-family: var(--font-display); font-weight: 500; font-variation-settings: "SOFT" 70; font-size: 22px; line-height: 1; letter-spacing: -0.01em; }
.hub-mark b { font-weight: 500; color: var(--color-accent); }
.hub-bar__end { display: flex; align-items: center; gap: clamp(12px, 2.4vw, 28px); }
.hub-place { font-family: var(--font-label); font-weight: 500; font-size: 11px; line-height: 1; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-text-light); }
.hub-mode { width: 30px; height: 30px; padding: 0; display: grid; place-items: center; border-radius: 50%; border: 1px solid var(--color-border); background: transparent; color: var(--color-text-muted); cursor: pointer; }
.hub-mode svg { width: 14px; height: 14px; }
.hub-mode:hover { color: var(--color-accent); }

.hub-main { position: relative; z-index: 5; }
.hub-ch { position: relative; min-height: 100vh; }
.hub-ch--open { height: 150vh; }
.hub-card { position: sticky; top: 16vh; width: min(32rem, 34vw); margin-left: clamp(16px, 6vw, 96px); padding: 8px 0; }
.hub-cap { display: flex; align-items: center; gap: 12px; margin: 0; font-family: var(--font-label); font-weight: 500; font-size: 11px; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-accent); }
.hub-cap::after { content: ""; flex: 1; max-width: 120px; height: 1px; background: var(--color-border); }
.hub-cap span { color: var(--color-text-light); }
.hub-title { margin: 22px 0 26px; font-family: var(--font-display); font-weight: 500; font-variation-settings: "SOFT" 70; font-size: clamp(42px, 5.6vw, 84px); line-height: 1.04; letter-spacing: -0.015em; color: var(--color-heading, var(--color-text)); }
.hub-title em { font-style: italic; color: var(--color-accent); font-variation-settings: "SOFT" 100; }
.hub-lede { max-width: 30rem; margin: 0; font-size: 19px; color: var(--color-text-muted); }
.hub-cue { margin: 40px 0 0; display: flex; align-items: center; gap: 10px; font-family: var(--font-label); font-weight: 500; font-size: 11px; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: var(--color-text-light); }
.hub-cue i { width: 1px; height: 36px; background: linear-gradient(var(--color-accent), transparent); transform-origin: top; animation: hub-drip 2.4s ease-in-out infinite; }
@keyframes hub-drip { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }

.hub-rail { position: fixed; right: clamp(14px, 2vw, 28px); top: 50%; transform: translateY(-50%); z-index: 10; display: grid; gap: 14px; margin: 0; padding: 0; list-style: none; }
.hub-rail button { all: unset; cursor: pointer; display: flex; align-items: center; justify-content: flex-end; gap: 8px; font-family: var(--font-label); font-weight: 500; font-size: 10px; line-height: 1; letter-spacing: 0.1em; color: var(--color-text-light); }
.hub-rail button::after { content: ""; width: 10px; height: 1px; background: var(--color-border); transition: width 0.4s, background 0.4s; }
.hub-rail button.is-current { color: var(--color-accent); }
.hub-rail button.is-current::after { width: 26px; background: var(--color-accent); }
.hub-rail button:focus-visible { outline: 1px solid var(--color-accent); outline-offset: 4px; }

.hub-ch[data-len="2.2"] { height: 220vh; }
.hub-ch[data-len="2.6"] { height: 260vh; }
.hub-ch[data-len="2.8"] { height: 280vh; }
.hub-ch[data-len="3"] { height: 300vh; }
.hub-head { margin: 18px 0 20px; font-family: var(--font-display); font-weight: 500; font-variation-settings: "SOFT" 70; font-size: clamp(32px, 3.4vw, 50px); line-height: 1.08; letter-spacing: -0.015em; color: var(--color-heading, var(--color-text)); }
.hub-head em { font-style: italic; color: var(--color-accent); font-variation-settings: "SOFT" 100; }
.hub-text { margin: 0 0 14px; color: var(--color-text-muted); }
.hub-readout { margin: 22px 0 0; padding-top: 14px; border-top: 1px solid var(--color-border); font-family: var(--font-label); font-weight: 500; font-size: 12px; line-height: 1.5; letter-spacing: 0.06em; color: var(--color-text-light); }
.hub-readout b { margin-right: 6px; font-family: var(--font-display); font-weight: 500; font-size: 22px; letter-spacing: 0; color: var(--color-text); }
.hub-act { all: unset; cursor: pointer; display: inline-flex; align-items: center; gap: 10px; margin-top: 18px; padding: 11px 16px; border: 1px solid color-mix(in srgb, var(--color-accent) 50%, transparent); border-radius: 999px; font-family: var(--font-label); font-weight: 500; font-size: 11px; line-height: 1; letter-spacing: 0.12em; text-transform: uppercase; color: var(--color-accent); transition: background 0.3s, color 0.3s; }
.hub-act::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.hub-act:hover, .hub-act:focus-visible { background: var(--color-accent); color: var(--color-bg); }
.hub-seg { display: inline-flex; margin-top: 18px; padding: 3px; border: 1px solid var(--color-border); border-radius: 999px; }
.hub-seg button { all: unset; cursor: pointer; padding: 8px 14px; border-radius: 999px; font-family: var(--font-label); font-weight: 500; font-size: 11px; line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; color: var(--color-text-light); }
.hub-seg button[aria-pressed="true"] { background: var(--color-accent); color: var(--color-bg); }
.hub-seg button:focus-visible { outline: 1px solid var(--color-accent); outline-offset: 2px; }
.hub-spark { display: block; width: 100%; max-width: 300px; height: auto; margin-top: 16px; overflow: visible; }
.hub-spark__axis { stroke: var(--color-border); }
.hub-spark__with { fill: none; stroke: var(--color-accent); stroke-width: 1.6; }
.hub-spark__without { fill: none; stroke: var(--color-text-light); stroke-width: 1.2; stroke-dasharray: 3 3; }
.hub-spark.is-off .hub-spark__with { stroke: var(--color-text-light); stroke-width: 1.2; stroke-dasharray: 3 3; }
.hub-spark.is-off .hub-spark__without { stroke: var(--color-text); stroke-width: 1.6; stroke-dasharray: none; }
.hub-spark text { font-family: var(--font-label); font-weight: 500; font-size: 9px; letter-spacing: 0.08em; fill: var(--color-text-light); }
.hub-spark circle { fill: var(--color-accent); }

.hub-foot { position: relative; z-index: 5; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 32px clamp(16px, 6vw, 96px) 40px; font-family: var(--font-label); font-size: 11.5px; line-height: 1.6; letter-spacing: 0.03em; color: var(--color-text-light); }
.hub-foot__links { display: flex; flex-wrap: wrap; gap: 16px; }
.hub-foot__links a { color: var(--color-text-muted); }
.hub-foot__links a:hover { color: var(--color-accent); }

@media (max-width: 859px) {
  .hub-site { font-size: 16px; }
  .hub-bar { padding: 14px 16px; }
  .hub-rail { display: none; }
  .hub-ch { padding-top: 72vh; }
  .hub-ch--open { padding-top: 46vh; }
  .hub-card { position: sticky; top: var(--card-top, 56vh); width: auto; margin: 0 16px; padding: 22px 20px; border: 1px solid var(--color-border); border-radius: 14px; background: color-mix(in srgb, var(--color-bg) 86%, transparent); backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px); }
  .hub-ch--open .hub-card { position: relative; top: auto; padding: 0 4px; border: 0; background: transparent; backdrop-filter: none; -webkit-backdrop-filter: none; }
  .hub-head { font-size: 30px; }
  .hub-text + .hub-text, .hub-spark { display: none; }
  .hub-title { font-size: 40px; margin: 16px 0 18px; }
  .hub-lede { font-size: 17px; }
  .hub-foot { padding: 28px 20px 36px; }
}

@media (prefers-reduced-motion: reduce) {
  .hub-site *, .hub-site *::before, .hub-site *::after { animation: none !important; transition: none !important; }
}
`;
