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

/** Act III: the guide's spells on mint discs, then the worlds. */
export const actThreeCSS: string = `
.tf-act-three { padding-top: 80px; padding-bottom: 170px; display: flex; flex-direction: column; gap: 80px; }
.tf-act-three__top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 32px; }
.tf-act-three__intro { margin: 0; max-width: 400px; font-size: 19px; line-height: 1.55; }
.tf-guide-spell { position: relative; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: flex-start; gap: 16px 40px; }
.tf-guide-spell--mirrored { flex-direction: row-reverse; justify-content: flex-end; }
.tf-guide-spell__disc { position: absolute; left: -2%; bottom: 4%; width: clamp(200px, 26vw, 400px); aspect-ratio: 1; border-radius: 50%; background: var(--palette-mint); box-shadow: var(--shadow-paper); z-index: 0; }
.tf-guide-spell--mirrored .tf-guide-spell__disc { left: auto; right: -2%; }
.tf-guide-spell__word { position: relative; z-index: 1; font-weight: 800; font-size: clamp(110px, 20vw, 320px); line-height: 0.8; letter-spacing: -0.07em; }
.tf-guide-spell__mark { position: relative; z-index: 2; width: clamp(80px, 9vw, 140px); margin-bottom: 30px; color: var(--palette-ink); filter: brightness(0) drop-shadow(0 10px 10px rgb(35 35 35 / 0.25)); }
.tf-guide-spell__mark svg { display: block; width: 100%; height: auto; overflow: visible; }
.tf-guide-spell__text { position: relative; z-index: 3; flex: 0 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding-bottom: 24px; font-size: 18px; line-height: 1.5; }
.tf-sectors { display: flex; flex-wrap: wrap; align-items: center; gap: 16px 24px; }
.tf-sectors .tf-story { font-size: 22px; }
.tf-sectors__list { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }
.tf-chip { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 18px; background: var(--palette-card); border-radius: var(--radius-pill); font-weight: 600; font-size: var(--text-label-md); box-shadow: var(--shadow-paper); }
.tf-chip__dot { width: 9px; height: 9px; border-radius: 50%; }
.tf-chip__dot--red { background: var(--palette-red); }
.tf-chip__dot--mint { background: var(--palette-mint); }
.tf-chip__dot--mustard { background: var(--palette-mustard); }
.tf-chip__dot--ink { background: var(--palette-ink); }
.tf-flicker { animation: tf-flicker 2.6s ease-in-out infinite; }
@keyframes tf-flicker { 0%, 100% { opacity: 0.95; } 40% { opacity: 0.6; } 55% { opacity: 1; } 70% { opacity: 0.75; } }
@media (max-width: 860px) {
  .tf-act-three { padding-bottom: 120px; gap: 56px; }
  .tf-guide-spell__disc { width: 52vw; }
}
`;

/** Act IV: the stories as tilted cards on a twelve-column board. */
export const actFourCSS: string = `
.tf-torn--ink { fill: var(--color-bg-dark); }
.tf-act-four { padding-top: 60px; padding-bottom: 180px; display: flex; flex-direction: column; gap: 56px; }
.tf-cards { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 28px; align-items: start; }
.tf-card { position: relative; display: flex; flex-direction: column; background: var(--palette-card); box-shadow: var(--shadow-paper); transition: transform 0.4s cubic-bezier(0.2, 0.9, 0.25, 1.2); }
.tf-card:hover { transform: rotate(0deg) translateY(-6px); z-index: 6; }
.tf-card .tf-eyebrow { margin-bottom: 18px; }
.tf-card--feature { grid-column: 1 / 8; grid-row: 1; padding: 40px; transform: rotate(-1.2deg); z-index: 2; }
.tf-card--figure { grid-column: 8 / 13; grid-row: 1; margin-top: 80px; padding: 32px; transform: rotate(2.4deg); z-index: 1; }
.tf-card--ink { grid-column: 1 / 5; grid-row: 2; margin-top: -10px; background: var(--color-bg-dark); color: var(--color-text-on-dark); transform: rotate(2deg); z-index: 3; }
.tf-card--story { grid-column: 4 / 11; grid-row: 2; margin-top: 70px; padding: 40px; background: var(--palette-red); transform: rotate(-0.8deg); z-index: 4; }
.tf-card__figure { font-weight: 800; font-size: clamp(56px, 6vw, 96px); line-height: 0.85; letter-spacing: -0.05em; }
.tf-card__figure--large { font-size: clamp(80px, 10vw, 160px); letter-spacing: -0.06em; }
.tf-unit { color: var(--palette-red); }
.tf-card__line { margin-top: 18px; font-size: clamp(22px, 2.2vw, 32px); line-height: 1.15; }
.tf-card__text { margin-top: 12px; font-size: 17px; line-height: 1.45; max-width: 520px; }
.tf-card__photo { margin: -40px -40px 28px; height: 220px; overflow: hidden; }
.tf-card__photo img { display: block; width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.08); mix-blend-mode: multiply; }
.tf-card__headline { font-weight: 800; font-size: clamp(42px, 5vw, 80px); line-height: 0.9; letter-spacing: -0.05em; }
.tf-card__headline em { font-family: var(--font-story); font-style: italic; font-weight: 500; letter-spacing: var(--tracking-story); }
.tf-card--story .tf-card__text { margin-top: 18px; line-height: 1.5; }
@media (max-width: 860px) {
  .tf-stack > * { grid-column: 1 / -1 !important; grid-row: auto !important; margin-top: 0 !important; }
  .tf-card--feature, .tf-card--story { padding: 28px; }
  .tf-card__photo { margin: -28px -28px 24px; }
  .tf-card__figure--large { font-size: clamp(56px, 16vw, 120px); }
  .tf-act-four { padding-bottom: 120px; }
}
`;

/** The crossroads and the epilogue: the dark stage at the story's end. */
export const finaleCSS: string = `
.tf-act--crossroads, .tf-act--epilogue { background: var(--color-bg-dark); color: var(--color-text-on-dark); }
.tf-act--crossroads { overflow: hidden; }
.tf-site .tf-act--crossroads a:hover, .tf-site .tf-act--epilogue a:hover { color: inherit; }
.tf-crossroads { padding-top: 120px; padding-bottom: 170px; display: flex; flex-direction: column; gap: 40px; }
.tf-crossroads__row { display: flex; flex-wrap: wrap; align-items: center; gap: 48px; }
.tf-crossroads__words { flex: 1 1 520px; min-width: 0; position: relative; z-index: 2; display: flex; flex-direction: column; gap: 24px; }
.tf-crossroads__headline { margin: 0; font-weight: 800; font-size: clamp(80px, 12vw, 200px); line-height: 0.82; letter-spacing: -0.065em; }
.tf-crossroads__headline em, .tf-epilogue__headline em { font-family: var(--font-story); font-style: italic; font-weight: 500; letter-spacing: var(--tracking-story); }
.tf-crossroads .tf-lede { max-width: 460px; font-size: 20px; line-height: 1.5; }
.tf-site .tf-pill--mustard { background: var(--palette-mustard); color: var(--palette-ink); }
.tf-site .tf-pill--red { background: var(--palette-red); color: var(--palette-ink); }
.tf-crossroads__scene { flex: 0 1 420px; min-width: 260px; position: relative; height: 460px; }
.tf-spotlight { position: absolute; left: 50%; top: 50%; width: 140%; aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; background: radial-gradient(circle, var(--palette-mustard) 0 58%, rgb(214 201 29 / 0) 71%); }
.tf-pole { position: absolute; left: 50%; top: -60px; bottom: -200px; width: 14px; transform: translateX(-50%); background: var(--color-bg-dark); box-shadow: var(--shadow-paper); }
.tf-sign { position: absolute; color: var(--palette-ink); }
.tf-sign svg { display: block; width: 100%; height: auto; overflow: visible; }
.tf-sign--1 { left: 0; top: 30px; width: 90%; }
.tf-sign--2 { right: 0; top: 170px; width: 90%; }
.tf-sign--3 { left: 6%; top: 300px; width: 70%; }
.tf-sign--3 .tf-swing { animation-delay: -2s; }
.tf-swing--back { animation-name: tf-swing-back; animation-duration: 5.5s; }
@keyframes tf-swing-back { 0%, 100% { transform: rotate(8deg); } 50% { transform: rotate(-10deg); } }

.tf-act--epilogue { border-top: 1px solid rgb(255 255 255 / 0.12); }
.tf-epilogue { padding-top: 110px; padding-bottom: 72px; display: flex; flex-direction: column; gap: 72px; }
.tf-epilogue__row { display: flex; flex-wrap: wrap; gap: 56px; align-items: flex-end; justify-content: space-between; }
.tf-epilogue__headline { margin: 0; flex: 1 1 600px; min-width: 0; font-weight: 800; font-size: clamp(64px, 9.6vw, 160px); line-height: 0.84; letter-spacing: -0.06em; }
.tf-epilogue__headline em { color: var(--palette-mint); }
.tf-guides { flex: 0 1 360px; min-width: 0; display: flex; flex-direction: column; gap: 22px; }
.tf-guides__sticks { display: flex; gap: 22px; align-items: flex-end; }
.tf-guide { width: 120px; display: flex; flex-direction: column; align-items: center; transform-origin: 50% 100%; animation: tf-sway 6s ease-in-out infinite; }
.tf-guide--late { animation-delay: -2.5s; }
.tf-guide .tf-portrait { width: 100%; }
.tf-guide .tf-portrait img { object-position: 50% 24%; }
.tf-guide__stick { width: 6px; height: 60px; background: var(--palette-rule); }
.tf-guide--late .tf-guide__stick { height: 40px; }
.tf-guides__note { margin: 0; font-size: 17px; line-height: 1.55; }
.tf-epilogue__ways { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 24px; }
.tf-epilogue__contact { font-weight: 600; font-size: clamp(22px, 2.4vw, 34px); letter-spacing: -0.02em; }
@keyframes tf-sway { 0%, 100% { transform: rotate(-3deg); } 50% { transform: rotate(3deg); } }
@media (max-width: 860px) {
  .tf-crossroads { padding-top: 88px; padding-bottom: 120px; }
  .tf-crossroads__scene { height: 380px; }
  .tf-epilogue { padding-top: 88px; gap: 48px; }
}
`;
