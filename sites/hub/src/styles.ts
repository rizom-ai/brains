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

.hub-foot { position: relative; z-index: 5; display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; padding: 32px clamp(16px, 6vw, 96px) 40px; font-family: var(--font-label); font-size: 11.5px; line-height: 1.6; letter-spacing: 0.03em; color: var(--color-text-light); }
.hub-foot__links { display: flex; flex-wrap: wrap; gap: 16px; }
.hub-foot__links a { color: var(--color-text-muted); }
.hub-foot__links a:hover { color: var(--color-accent); }

@media (max-width: 859px) {
  .hub-site { font-size: 16px; }
  .hub-bar { padding: 14px 16px; }
  .hub-ch--open { padding-top: 46vh; }
  .hub-card { position: relative; top: auto; width: auto; margin: 0 16px; padding: 0 4px; }
  .hub-title { font-size: 40px; margin: 16px 0 18px; }
  .hub-lede { font-size: 17px; }
  .hub-foot { padding: 28px 20px 36px; }
}

@media (prefers-reduced-motion: reduce) {
  .hub-site *, .hub-site *::before, .hub-site *::after { animation: none !important; transition: none !important; }
}
`;
