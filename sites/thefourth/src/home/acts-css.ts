import { KEYHOLE_CLIP } from "../shapes";

/**
 * The acts' shared frame and Acts I and II, from the theme's tokens. The
 * spell's states are classes the spell script sets: ready (buttons shown),
 * broken (words scattered, jargon struck) and after (the keyhole open on
 * the translation). Each state's end position is its resting style, so with
 * reduced motion the translation simply appears.
 */
export const actsCSS: string = `
.tf-wrap { box-sizing: border-box; width: 100%; max-width: var(--layout-max-width); margin: 0 auto; padding-left: var(--layout-gutter); padding-right: var(--layout-gutter); }
.tf-act { position: relative; }
.tf-act-heading { display: flex; flex-direction: column; gap: 14px; position: relative; z-index: 3; }
.tf-act-line { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.tf-dot { width: 26px; height: 26px; border-radius: 50%; box-shadow: var(--shadow-paper); }
.tf-dot--card { background: var(--palette-card); }
.tf-dot--red { background: var(--palette-red); }
.tf-dot--mint { background: var(--palette-mint); }
.tf-dot--mustard { background: var(--palette-mustard); }
.tf-act-name { font-family: var(--font-story); font-weight: 600; font-size: 22px; }
.tf-story { margin: 0; font-family: var(--font-story); font-style: italic; font-weight: 500; letter-spacing: var(--tracking-story); }
.tf-act-heading .tf-story { font-size: var(--text-story-lg); line-height: 1.05; }
.tf-display { margin: 0; font-weight: 800; font-size: var(--text-display-2xl); line-height: 0.86; letter-spacing: -0.06em; }
.tf-lede { margin: 0; font-size: var(--text-body-lg); line-height: 1.55; max-width: 540px; }
button.tf-pill { border: 0; cursor: pointer; font-family: var(--font-sans); }
.tf-pill--large { min-height: 60px; padding: 0 32px; font-size: 18px; box-shadow: var(--shadow-paper); }
.tf-site .tf-pill--card { background: var(--palette-card); color: var(--color-text); }
.tf-torn { position: absolute; left: 0; right: 0; bottom: -1px; width: 100%; height: 30px; display: block; z-index: 6; filter: var(--shadow-cutout); fill: var(--color-bg); }

/* Act I: the hero, on the red the keyhole opened into. */
.tf-act--one { background: var(--palette-red); margin-top: -1px; }
.tf-act-one { padding-top: 120px; padding-bottom: 170px; display: flex; flex-wrap: wrap; gap: 56px; align-items: center; }
.tf-act-one__words { flex: 1 1 620px; min-width: 0; display: flex; flex-direction: column; gap: 32px; }
.tf-act-one__scene { flex: 0 1 400px; min-width: 260px; position: relative; height: 440px; }
.tf-arch { position: absolute; left: 10%; bottom: 0; width: 80%; height: 70%; background: var(--color-bg); border-radius: 999px 999px 0 0; box-shadow: var(--shadow-paper); }
.tf-act-one__portrait { position: absolute; left: 28%; bottom: 0; width: 44%; }
.tf-portrait { aspect-ratio: 2 / 3; filter: var(--shadow-cutout); }
.tf-portrait img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; clip-path: ${KEYHOLE_CLIP}; filter: grayscale(1) contrast(1.08); }
.tf-act-one__portrait img { object-position: 42% 35%; }
.tf-prop--balloon { right: 2%; top: 4%; width: 22%; }

/* Act II: the curse of jargon and the spell that breaks it. */
.tf-act--two { overflow: hidden; }
.tf-act-two__top { padding-top: 110px; padding-bottom: 40px; }
.tf-spell { position: relative; min-height: 640px; display: flex; flex-direction: column; }
.tf-spell__stage { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; gap: 40px; padding-bottom: 150px; position: relative; z-index: 1; }
.tf-spell__words { margin: 0; font-weight: 800; font-size: clamp(44px, 6.2vw, 104px); line-height: 0.98; letter-spacing: -0.045em; max-width: 1280px; }
.tf-word { display: inline-block; white-space: pre; transition: transform 1.1s cubic-bezier(0.2, 0.9, 0.25, 1.1), opacity 0.7s ease, color 0.3s ease, background-color 0.2s ease, padding 0.2s ease, box-shadow 0.3s ease; }
.tf-spell--broken .tf-word { opacity: 0.4; background: var(--palette-card); padding: 0 10px; box-shadow: 0 12px 18px -8px rgb(35 35 35 / 0.4); }
.tf-spell--broken .tf-word[data-jargon="true"] { opacity: 1; color: var(--color-brand-dark); text-decoration: line-through; }
.tf-spell__actions, .tf-spell__again { display: flex; flex-wrap: wrap; align-items: center; }
.tf-spell__actions { gap: 20px; visibility: hidden; }
.tf-spell__again { gap: 14px; }
/* The buttons need the script; the translation's own button shows with the translation. */
.tf-spell--ready .tf-spell__actions { visibility: visible; }
.tf-aside { font-size: 20px; }
.tf-prop--scissors { right: 6%; top: 10px; width: 130px; z-index: 2; }
.tf-snip { transform-origin: 70px 60px; transform-box: view-box; animation: tf-snip-a 2.4s ease-in-out infinite; }
.tf-snip--b { animation-name: tf-snip-b; }
.tf-swing { transform-origin: 50% 0; animation: tf-swing 4.5s ease-in-out infinite; filter: brightness(0) drop-shadow(0 10px 10px rgb(35 35 35 / 0.25)); }
.tf-pulse { animation: tf-pulse 2.4s ease-in-out infinite; }
.tf-spell__after { position: absolute; inset: 0; z-index: 5; overflow: hidden; visibility: hidden; }
.tf-spell--after .tf-spell__after { visibility: visible; }
.tf-spell__key { position: absolute; left: 50%; top: 55%; width: 180px; aspect-ratio: 2 / 3; clip-path: ${KEYHOLE_CLIP}; transform-origin: 50% 32%; transform: translate(-50%, -32%) scale(0); }
[data-light="red"] .tf-spell__key { background: var(--palette-red); }
[data-light="mint"] .tf-spell__key { background: var(--palette-mint); }
[data-light="mustard"] .tf-spell__key { background: var(--palette-mustard); }
.tf-spell--after .tf-spell__key { transform: translate(-50%, -32%) scale(34); animation: tf-keyopen 1.2s cubic-bezier(0.7, 0, 0.25, 1) both; }
.tf-spell__translation { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 24px; padding-bottom: 150px; }
.tf-spell__translation > .tf-story:first-child { font-size: clamp(24px, 2.4vw, 36px); }
.tf-spell__main { margin: 0; font-weight: 800; font-size: clamp(46px, 6.4vw, 110px); line-height: 0.92; letter-spacing: -0.05em; max-width: 1240px; }
.tf-spell__sub { font-size: clamp(28px, 3vw, 48px); }
.tf-spell--after .tf-land { animation: tf-land 1s cubic-bezier(0.2, 0.9, 0.25, 1.1) both; }
.tf-spell--after .tf-land:nth-child(1) { animation-delay: 0.7s; }
.tf-spell--after .tf-land:nth-child(2) { animation-delay: 0.8s; }
.tf-spell--after .tf-land:nth-child(3) { animation-delay: 1s; }
.tf-spell--after .tf-land:nth-child(4) { animation-delay: 1.2s; }

@keyframes tf-keyopen { from { transform: translate(-50%, -32%) scale(0); } to { transform: translate(-50%, -32%) scale(34); } }
@keyframes tf-land { 0% { opacity: 0; transform: translateY(50px) rotate(-2deg); } 70% { opacity: 1; transform: translateY(-4px); } 100% { opacity: 1; transform: none; } }
@keyframes tf-snip-a { 0%, 60%, 100% { transform: rotate(0); } 75% { transform: rotate(-10deg); } }
@keyframes tf-snip-b { 0%, 60%, 100% { transform: rotate(0); } 75% { transform: rotate(10deg); } }
@keyframes tf-swing { 0%, 100% { transform: rotate(-7deg); } 50% { transform: rotate(9deg); } }
@keyframes tf-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }

@media (max-width: 860px) {
  .tf-act-one { padding-top: 88px; padding-bottom: 120px; gap: 40px; }
  .tf-act-one__scene { height: 360px; }
  .tf-prop--scissors { width: 84px; right: 4%; }
  .tf-spell { min-height: 560px; }
}
`;
