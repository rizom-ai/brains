import { CURTAIN_LEFT_CLIP, CURTAIN_RIGHT_CLIP, KEYHOLE_CLIP } from "./shapes";

/**
 * The paper frame and the cover's stage, drawn from the theme's tokens.
 * Scroll-driven motion (the curtains parting, the keyhole opening) runs only
 * where the browser supports view timelines; elsewhere the stage stands
 * still. Reduced motion stops every animation.
 */
export const siteCSS: string = `
.tf-site { position: relative; min-height: 100vh; display: flex; flex-direction: column; background-color: var(--color-bg); background-image: var(--paper-grain); background-size: var(--paper-grain-size); background-position: var(--paper-grain-position); color: var(--color-text); font-family: var(--font-sans); }
.tf-site a { color: inherit; }
.tf-site a:hover { color: var(--color-brand-dark); }
.tf-main { flex: 1; }

.tf-bar { position: absolute; top: 0; left: 0; right: 0; z-index: 10; box-sizing: content-box; max-width: var(--layout-max-width); margin: 0 auto; padding: 18px var(--layout-gutter); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.tf-mark { display: block; width: 52px; color: var(--color-logo); }
.tf-mark svg { display: block; width: 100%; height: auto; }
.tf-btn { display: inline-flex; align-items: center; gap: 12px; min-height: 52px; padding: 0 26px; border: 0; border-radius: var(--radius-pill); font-family: var(--font-sans); font-weight: 700; font-size: 16px; text-decoration: none; box-shadow: var(--shadow-paper); transition: transform 0.2s cubic-bezier(0.2, 0.9, 0.25, 1.3), box-shadow 0.2s ease, filter 0.2s ease; }
.tf-btn:hover { transform: translateY(-3px); filter: brightness(1.12); }
.tf-btn:active { transform: translateY(0); }
.tf-site .tf-btn--ink, .tf-site .tf-btn--ink:hover { background: var(--palette-ink); color: var(--palette-card); }
.tf-site .tf-btn--card, .tf-site .tf-btn--card:hover { background: var(--palette-card); color: var(--palette-ink); }
.tf-site .tf-btn--red, .tf-site .tf-btn--red:hover { background: var(--palette-red); color: var(--palette-ink); }
.tf-site .tf-btn--mustard, .tf-site .tf-btn--mustard:hover { background: var(--palette-mustard); color: var(--palette-ink); }
.tf-btn--large { min-height: 56px; padding: 0 28px; font-size: 17px; }
.tf-btn__key { display: block; width: 34px; }
.tf-btn__key svg { display: block; width: 100%; height: auto; overflow: visible; }
.tf-bar .tf-btn { min-height: 44px; padding: 0 20px; font-size: 14px; box-shadow: none; }
.tf-bar__end { display: flex; align-items: center; gap: 8px; }
.tf-lang { padding: 0 12px; font-weight: 600; font-size: 14px; }
.tf-site .tf-lang a { text-decoration: none; color: var(--palette-ink); }
.tf-site .tf-lang a:not([aria-current]), .tf-lang__sep { color: var(--palette-ink-subtle); }
.tf-site .tf-lang a:not([aria-current]):hover { color: var(--palette-ink); }
.tf-link { font-weight: 700; font-size: 16px; text-decoration: underline; text-decoration-thickness: 1.5px; text-underline-offset: 4px; transition: text-decoration-thickness 0.15s ease; }
.tf-link:hover { text-decoration-thickness: 3px; }
.tf-site a:focus-visible, .tf-site button:focus-visible { outline: 3px solid var(--palette-mustard); outline-offset: 3px; }

.tf-foot { background: var(--palette-red); color: var(--palette-ink); }
.tf-foot__inner { padding-top: clamp(40px, 4vw, 56px); padding-bottom: 28px; display: flex; flex-direction: column; gap: clamp(36px, 5vw, 72px); }
.tf-foot__top, .tf-foot__bottom { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 24px 40px; }
.tf-foot__top { align-items: flex-end; }
.tf-foot__brand { max-width: 26rem; display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
.tf-foot__name { font-weight: 800; font-size: clamp(40px, 4.4vw, 68px); line-height: 0.84; letter-spacing: -0.055em; text-transform: uppercase; }
.tf-foot__trade { padding-bottom: 4px; font-weight: 600; font-size: clamp(13px, 1.1vw, 16px); text-transform: uppercase; }
.tf-foot__email { font-weight: 700; font-size: clamp(15px, 1.2vw, 18px); text-underline-offset: 4px; }
.tf-foot__bottom { font-weight: 700; font-size: 13px; text-transform: uppercase; }
.tf-flink { transition: color 0.15s ease; }
.tf-site .tf-flink:hover { color: var(--palette-card); }

.tf-eyebrow { margin: 0; font-weight: 700; font-size: var(--text-label-sm); letter-spacing: var(--tracking-label); text-transform: uppercase; }

/* The cover: a 220vh scroll track holding one sticky stage. */
.tf-cover { position: relative; height: 220vh; view-timeline: --cover block; }
.tf-stage { position: sticky; top: 0; height: 100vh; min-height: 600px; overflow: hidden; background-color: var(--color-bg); background-image: var(--paper-grain); background-size: var(--paper-grain-size); background-position: var(--paper-grain-position); }
.tf-room { position: absolute; inset: 80px 0 0 0; }
.tf-cover__words { position: absolute; left: 15vw; right: 15vw; top: 50%; transform: translateY(-46%); z-index: 2; display: flex; flex-direction: column; align-items: center; text-align: center; }
.tf-headline { margin: 0; font-weight: 800; font-size: clamp(38px, 9vw, 146px); line-height: 0.84; letter-spacing: -0.055em; text-transform: uppercase; display: flex; flex-direction: column; align-items: center; }
.tf-headline__line { display: block; position: relative; }
.tf-initial { font-family: var(--font-story); font-style: italic; font-weight: 500; color: var(--palette-red); font-size: 1.08em; letter-spacing: -0.02em; margin-right: 0.02em; }
.tf-keyhole-slot { position: relative; display: inline-block; width: 0.42em; margin: 0 0.04em; vertical-align: -0.02em; z-index: 5; }
.tf-keyhole-slot .tf-glow, .tf-keyhole-slot .tf-zoom { display: block; }
.tf-keyhole { aspect-ratio: 2 / 3; width: 100%; background: var(--palette-red); clip-path: ${KEYHOLE_CLIP}; transform-origin: 50% 32%; }
.tf-keys { position: absolute; left: 50%; top: 50%; width: 0; height: 0; z-index: 3; --dx: 1.36em; }
.tf-key-slot { position: absolute; left: 0; top: 0; width: clamp(40px, 6.4vw, 104px); transform: translate(-50%, -50%); }
.tf-key { display: block; color: var(--palette-ink); filter: var(--shadow-cutout); transform: translate(calc(var(--x) - var(--dx)), var(--y)) rotate(var(--r)); }
.tf-key svg { display: block; width: 100%; height: auto; overflow: visible; }
.tf-cover__audience { margin: clamp(16px, 2.4vw, 32px) 0 0; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 0.1em 0.4em; font-size: clamp(16px, 1.8vw, 28px); }
.tf-cover__lead { font-weight: 600; white-space: nowrap; }
.tf-cover__audience em { font-family: var(--font-story); font-style: italic; font-weight: 500; letter-spacing: var(--tracking-story); }
.tf-paren { font-family: var(--font-story); font-weight: 400; font-size: 2.2em; line-height: 0.6; color: var(--palette-red); }
.tf-cover__cue { position: absolute; left: 50%; bottom: 4%; transform: translateX(-50%); margin: 0; z-index: 6; font-size: 22px; }
.tf-curtain { position: absolute; top: 0; bottom: 0; width: 14vw; z-index: 4; filter: var(--shadow-cutout); }
.tf-curtain::before { content: ""; position: absolute; inset: 0; background: var(--color-bg-dark); }
.tf-curtain--left { left: 0; }
.tf-curtain--left::before { clip-path: ${CURTAIN_LEFT_CLIP}; }
.tf-curtain--right { right: 0; }
.tf-curtain--right::before { clip-path: ${CURTAIN_RIGHT_CLIP}; }
.tf-valance { position: absolute; left: 0; right: 0; top: 0; height: clamp(56px, 9vh, 96px); z-index: 5; filter: var(--shadow-cutout); }
.tf-valance svg { display: block; width: 100%; height: 100%; fill: var(--color-bg-dark); }

@keyframes tf-glow { 0%, 100% { filter: drop-shadow(0 0 18px rgb(239 89 89 / 0.35)); } 50% { filter: drop-shadow(0 0 46px rgb(239 89 89 / 0.7)); } }
@keyframes tf-float { 0%, 100% { transform: translateY(0) rotate(-6deg); } 50% { transform: translateY(-12px) rotate(-2deg); } }
@keyframes tf-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(8px); } }
@keyframes tf-zoom { 0% { transform: scale(1); } 40% { transform: scale(3.5); } 70% { transform: scale(14); } 90% { transform: scale(44); } 100% { transform: scale(80); } }
@keyframes tf-suck { from { transform: translate(calc(var(--x) - var(--dx)), var(--y)) rotate(var(--r)) scale(1); opacity: 1; } to { transform: translate(0px, 0px) rotate(calc(var(--r) + 240deg)) scale(0.06); opacity: 0; } }
@keyframes tf-fadeout { from { opacity: 1; } to { opacity: 0; } }
@keyframes tf-cur-l { from { transform: translateX(0); } to { transform: translateX(-105%); } }
@keyframes tf-cur-r { from { transform: translateX(0); } to { transform: translateX(105%); } }
@keyframes tf-valance { from { transform: translateY(0); } to { transform: translateY(-110%); } }
.tf-glow { animation: tf-glow 3.2s ease-in-out infinite; }
.tf-float { animation: tf-float 7s ease-in-out infinite; }
.tf-bob { animation: tf-bob 1.8s ease-in-out infinite; }
@supports (animation-timeline: view()) {
  .tf-zoom { animation: tf-zoom linear both; animation-timeline: --cover; animation-range: contain 25% contain 77%; }
  .tf-key { animation: tf-suck cubic-bezier(0.5, 0, 0.85, 0.45) both; animation-timeline: --cover; animation-range: contain 2% contain 25%; }
  .tf-fadeout { animation: tf-fadeout linear both; animation-timeline: --cover; animation-range: contain 6% contain 28%; }
  .tf-cur-l { animation: tf-cur-l cubic-bezier(0.5, 0, 0.3, 1) both; animation-timeline: --cover; animation-range: contain 0% contain 28%; }
  .tf-cur-r { animation: tf-cur-r cubic-bezier(0.5, 0, 0.3, 1) both; animation-timeline: --cover; animation-range: contain 0% contain 28%; }
  .tf-valance { animation: tf-valance cubic-bezier(0.5, 0, 0.3, 1) both; animation-timeline: --cover; animation-range: contain 8% contain 32%; }
}

@media (max-width: 860px) {
  .tf-hide-sm { display: none !important; }
  .tf-cover__words { left: calc(14vw + 8px); right: calc(14vw + 8px); }
  .tf-headline { font-size: clamp(30px, 10.4vw, 96px); }
}

@media (prefers-reduced-motion: reduce) {
  .tf-site *, .tf-site *::before, .tf-site *::after { animation: none !important; transition: none !important; }
}
`;
