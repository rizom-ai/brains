import {
  CURTAIN_LEFT_CLIP,
  CURTAIN_RIGHT_CLIP,
  KEYHOLE_CLIP,
  VALANCE_CLIP,
} from "./shapes";

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

.tf-bar { position: absolute; top: 0; left: 0; right: 0; z-index: 10; box-sizing: border-box; max-width: var(--layout-max-width); margin: 0 auto; padding: 22px var(--layout-gutter); display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.tf-mark { display: block; width: 52px; color: var(--color-logo); }
.tf-mark svg { display: block; width: 100%; height: auto; }
.tf-mark--small { width: 46px; color: var(--color-text-on-dark); }
.tf-pill { display: inline-flex; align-items: center; min-height: 46px; padding: 0 22px; border-radius: var(--radius-pill); font-weight: 700; font-size: var(--text-body-sm); text-decoration: none; }
.tf-site .tf-pill--ink { background: var(--color-text); color: var(--color-text-inverse); }
.tf-site .tf-pill--ink:hover { background: var(--color-brand); color: var(--color-text); }

.tf-foot { box-sizing: border-box; width: 100%; background: var(--color-footer); color: var(--color-footer-text); padding: 28px var(--layout-gutter) 48px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 24px; font-size: var(--text-label-md); }
.tf-site .tf-foot a:hover { color: var(--color-brand); }

.tf-eyebrow { margin: 0; font-weight: 700; font-size: var(--text-label-sm); letter-spacing: var(--tracking-label); text-transform: uppercase; }

/* The cover: a 200vh scroll track holding one sticky stage. */
.tf-cover { position: relative; height: 200vh; view-timeline: --cover block; }
.tf-stage { position: sticky; top: 0; height: 100vh; min-height: 640px; overflow: hidden; background-color: var(--color-bg); background-image: var(--paper-grain); background-size: var(--paper-grain-size); background-position: var(--paper-grain-position); }
.tf-room { position: absolute; inset: 90px 0 0 0; }
.tf-hole { position: absolute; left: 50%; top: 46%; transform: translate(-50%, -50%); z-index: 2; }
.tf-keyhole { aspect-ratio: 2 / 3; width: clamp(140px, 14vw, 210px); background: var(--palette-red); clip-path: ${KEYHOLE_CLIP}; transform-origin: 50% 60%; }
.tf-cover__eyebrow { position: absolute; left: 0; right: 0; top: 6%; text-align: center; z-index: 3; }
.tf-cover__title { position: absolute; left: calc(14vw + clamp(16px, 3vw, 48px)); bottom: 12%; z-index: 6; max-width: 30vw; margin: 0; font-weight: 800; font-size: var(--text-display-2xl); line-height: 0.82; letter-spacing: var(--tracking-display); }
.tf-cover__subtitle { position: absolute; right: calc(14vw + clamp(16px, 3vw, 48px)); bottom: 13%; z-index: 6; max-width: 24vw; margin: 0; text-align: right; font-family: var(--font-story); font-style: italic; font-weight: 500; letter-spacing: var(--tracking-story); font-size: var(--text-story-md); line-height: 1.12; }
.tf-cover__cue { position: absolute; left: 50%; bottom: 4%; transform: translateX(-50%); margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; z-index: 3; font-size: 20px; }
.tf-curtain { position: absolute; top: 0; bottom: 0; width: 14vw; z-index: 4; filter: var(--shadow-cutout); }
.tf-curtain::before { content: ""; position: absolute; inset: 0; background: var(--color-bg-dark); }
.tf-curtain--left { left: 0; }
.tf-curtain--left::before { clip-path: ${CURTAIN_LEFT_CLIP}; }
.tf-curtain--right { right: 0; }
.tf-curtain--right::before { clip-path: ${CURTAIN_RIGHT_CLIP}; }
.tf-valance { position: absolute; left: 0; right: 0; top: 0; height: 48px; z-index: 5; filter: var(--shadow-cutout); }
.tf-valance::before { content: ""; position: absolute; inset: 0; background: var(--color-bg-dark); clip-path: ${VALANCE_CLIP}; }
.tf-prop { position: absolute; z-index: 3; color: var(--palette-ink); }
.tf-prop svg { display: block; width: 100%; height: auto; overflow: visible; }
.tf-prop .tf-float { filter: brightness(0) drop-shadow(0 10px 10px rgb(35 35 35 / 0.25)); }
.tf-prop--watch { left: 22%; top: 22%; width: 70px; }
.tf-prop--key { right: 22%; top: 30%; width: 110px; }
.tf-hand { transform-origin: 60px 84px; transform-box: view-box; animation: tf-spin 8s linear infinite; }
.tf-hand--slow { animation-duration: 48s; }

@keyframes tf-glow { 0%, 100% { filter: drop-shadow(0 0 18px rgb(239 89 89 / 0.35)); } 50% { filter: drop-shadow(0 0 46px rgb(239 89 89 / 0.7)); } }
@keyframes tf-float { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-12px) rotate(2deg); } }
@keyframes tf-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(8px); } }
@keyframes tf-spin { to { transform: rotate(360deg); } }
@keyframes tf-zoom { from { transform: scale(1); } to { transform: scale(30); } }
@keyframes tf-fadeout { from { opacity: 1; } to { opacity: 0; } }
@keyframes tf-cur-l { from { transform: translateX(0); } to { transform: translateX(-105%); } }
@keyframes tf-cur-r { from { transform: translateX(0); } to { transform: translateX(105%); } }
.tf-glow { animation: tf-glow 3.2s ease-in-out infinite; }
.tf-float { animation: tf-float 7s ease-in-out infinite; }
.tf-float--late { animation-delay: -3s; }
.tf-bob { animation: tf-bob 1.8s ease-in-out infinite; }
@supports (animation-timeline: view()) {
  .tf-zoom { animation: tf-zoom cubic-bezier(0.6, 0, 0.9, 0.6) both; animation-timeline: --cover; animation-range: contain 25% contain 100%; }
  .tf-fadeout { animation: tf-fadeout linear both; animation-timeline: --cover; animation-range: contain 10% contain 40%; }
  .tf-cur-l { animation: tf-cur-l cubic-bezier(0.5, 0, 0.3, 1) both; animation-timeline: --cover; animation-range: contain 0% contain 35%; }
  .tf-cur-r { animation: tf-cur-r cubic-bezier(0.5, 0, 0.3, 1) both; animation-timeline: --cover; animation-range: contain 0% contain 35%; }
}

@media (max-width: 860px) {
  .tf-cover__title { left: calc(14vw + 14px); right: calc(14vw + 14px); bottom: 27%; max-width: none; font-size: clamp(48px, 15vw, 96px); }
  .tf-cover__subtitle { left: calc(14vw + 14px); right: calc(14vw + 14px); bottom: 12%; max-width: none; text-align: left; font-size: clamp(20px, 5.6vw, 28px); }
  .tf-prop--watch { left: 18%; top: 14%; width: 52px; }
  .tf-prop--key { right: 18%; top: 18%; width: 80px; }
}

@media (prefers-reduced-motion: reduce) {
  .tf-site *, .tf-site *::before, .tf-site *::after { animation: none !important; transition: none !important; }
}
`;
