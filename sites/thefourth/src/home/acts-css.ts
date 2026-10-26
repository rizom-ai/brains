import { KEYHOLE_CLIP } from "../shapes";

/**
 * The acts' shared frame and Acts I and II, from the theme's tokens. The
 * spell's states are classes the spell script sets: ready (buttons shown),
 * broken (words scattered, jargon struck) and after (the keyhole open on
 * the translation). Each state's end position is its resting style, so with
 * reduced motion the translation simply appears.
 */
export const actsCSS: string = `
.tf-wrap { box-sizing: content-box; max-width: var(--layout-max-width); margin: 0 auto; padding-left: var(--layout-gutter); padding-right: var(--layout-gutter); }
.tf-act { position: relative; }
.tf-act-heading { display: flex; flex-direction: column; gap: 14px; position: relative; z-index: 3; }
.tf-act-line { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.tf-dot { width: 12px; height: 12px; border-radius: 50%; }
.tf-dot--card { background: var(--palette-card); }
.tf-dot--red { background: var(--palette-red); }
.tf-dot--mint { background: var(--palette-mint); }
.tf-dot--mustard { background: var(--palette-mustard); }
.tf-act-name { font-family: var(--font-story); font-weight: 600; font-size: 22px; }
.tf-story { margin: 0; font-family: var(--font-story); font-style: italic; font-weight: 500; letter-spacing: var(--tracking-story); }
.tf-act-heading .tf-story { font-size: clamp(28px, 3.4vw, 54px); line-height: 1.06; }
.tf-display { margin: 0; font-weight: 800; font-size: var(--text-display-2xl); line-height: 0.86; letter-spacing: -0.06em; }
.tf-lede { margin: 0; font-size: var(--text-body-lg); line-height: 1.55; max-width: 540px; }
.tf-actions { display: flex; flex-wrap: wrap; gap: 18px; align-items: center; }
.tf-torn { position: absolute; left: 0; right: 0; bottom: -1px; width: 100%; height: 30px; display: block; z-index: 6; filter: var(--shadow-cutout); fill: var(--color-bg); }
.tf-blink { transform-box: fill-box; transform-origin: center; animation: tf-blink 5s ease-in-out infinite; }
.tf-swing { transform-origin: 50% 0; animation: tf-sway 6s ease-in-out infinite; }
@keyframes tf-blink { 0%, 44%, 52%, 100% { transform: scaleY(1); } 48% { transform: scaleY(0.08); } }
@keyframes tf-sway { 0%, 100% { transform: rotate(-2deg); } 50% { transform: rotate(2deg); } }

/* Act I: the hero, rising over the cover's last stretch onto the red the keyhole opened into. */
.tf-act--one { z-index: 2; margin-top: -24vh; background: linear-gradient(rgb(239 89 89 / 0) 0, rgb(239 89 89 / 0) 24vh, var(--palette-red) 24vh); }
.tf-act-one { padding-top: clamp(48px, 6vw, 80px); padding-bottom: clamp(110px, 12vw, 170px); display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: clamp(40px, 5vw, 72px); align-items: center; }
.tf-act-one__words { min-width: 0; display: flex; flex-direction: column; gap: 28px; }
.tf-act--one .tf-display { font-size: clamp(44px, 7.4vw, 124px); line-height: 0.88; }
.tf-act--one .tf-lede { font-size: 19px; }
.tf-key-tag { position: relative; max-width: 520px; padding: 18px 0 0 54px; }
.tf-key-tag__thread { position: absolute; left: -6px; top: -14px; width: 74px; overflow: visible; fill: none; stroke: var(--palette-ink); stroke-width: 2; }
.tf-key-tag__key { position: absolute; left: -30px; top: 28px; width: 70px; transform: rotate(-58deg); color: var(--palette-ink); filter: var(--shadow-cutout); }
.tf-key-tag__key svg { display: block; width: 100%; height: auto; overflow: visible; }
.tf-key-tag__paper { position: relative; transform: rotate(-1.5deg); filter: var(--shadow-cutout); }
.tf-key-tag__card { background: var(--palette-paper); padding: 22px 28px 24px 46px; clip-path: polygon(30px 0, 100% 0, 100% 100%, 30px 100%, 0 50%); }
.tf-key-tag__hole { position: absolute; left: 14px; top: calc(50% - 7px); width: 14px; height: 14px; border-radius: 50%; background: var(--palette-red); box-shadow: inset 0 0 0 3px var(--palette-ink); }
.tf-key-tag__line { font-size: clamp(24px, 2.2vw, 32px); line-height: 1.1; }
.tf-key-tag__text { margin: 10px 0 0; font-size: 16px; line-height: 1.5; }
.tf-act-one__scene { min-width: 0; position: relative; width: 100%; max-width: 600px; height: clamp(400px, 46vw, 620px); justify-self: center; }
.tf-arch { position: absolute; left: 6%; bottom: 0; width: 88%; height: 74%; background: var(--palette-paper); border-radius: 999px 999px 0 0; box-shadow: var(--shadow-paper); }
.tf-act-one__sun { position: absolute; left: 14%; bottom: 18%; width: 22%; aspect-ratio: 1; border-radius: 50%; background: var(--palette-mustard); box-shadow: var(--shadow-paper); }
.tf-act-one__portrait { position: absolute; left: 30%; bottom: 0; width: 42%; }
.tf-portrait { aspect-ratio: 2 / 3; filter: var(--shadow-cutout); }
.tf-portrait img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; clip-path: ${KEYHOLE_CLIP}; filter: grayscale(1) contrast(1.08); }
.tf-act-one__portrait img { object-position: 42% 35%; }
.tf-act-one__eye { position: absolute; right: 2%; top: 4%; width: 28%; z-index: 3; filter: var(--shadow-cutout); }
.tf-act-one__eye svg { display: block; width: 100%; height: auto; overflow: visible; }

/* Act II: the curse of jargon and the key that unlocks it. */
.tf-act--two { overflow: hidden; }
.tf-act-two__top { padding-top: clamp(80px, 9vw, 110px); padding-bottom: 32px; }
.tf-spell { position: relative; min-height: clamp(520px, 52vw, 640px); display: flex; flex-direction: column; }
.tf-spell__stage { flex: 1 1 auto; display: flex; flex-direction: column; justify-content: center; gap: 36px; padding-bottom: 140px; position: relative; z-index: 1; }
.tf-spell__words { margin: 0; font-weight: 800; font-size: clamp(34px, 6vw, 100px); line-height: 0.98; letter-spacing: -0.045em; max-width: 1280px; }
.tf-word { display: inline-block; white-space: pre; transition: transform 1.1s cubic-bezier(0.2, 0.9, 0.25, 1.1), opacity 0.7s ease, color 0.3s ease, background-color 0.2s ease, padding 0.2s ease, box-shadow 0.3s ease; }
.tf-spell--broken .tf-word { opacity: 0.4; background: var(--palette-card); padding: 0 10px; box-shadow: 0 12px 18px -8px rgb(35 35 35 / 0.4); }
.tf-spell--broken .tf-word[data-jargon="true"] { opacity: 1; color: var(--color-brand-dark); text-decoration: line-through; }
.tf-spell__actions, .tf-spell__again { display: flex; flex-wrap: wrap; align-items: center; }
.tf-spell__actions { gap: 16px 22px; visibility: hidden; }
.tf-spell__again { gap: 14px; }
/* The buttons need the script; the translation's own buttons show with the translation. */
.tf-spell--ready .tf-spell__actions { visibility: visible; }
.tf-aside { font-size: 20px; }
.tf-spell__after { position: absolute; inset: 0; z-index: 5; overflow: hidden; visibility: hidden; }
.tf-spell--after .tf-spell__after { visibility: visible; }
.tf-spell__key { position: absolute; left: 50%; top: 55%; width: 180px; aspect-ratio: 2 / 3; clip-path: ${KEYHOLE_CLIP}; transform-origin: 50% 32%; transform: translate(-50%, -32%) scale(0); }
[data-light="red"] .tf-spell__key { background: var(--palette-red); }
[data-light="mint"] .tf-spell__key { background: var(--palette-mint); }
[data-light="mustard"] .tf-spell__key { background: var(--palette-mustard); }
.tf-spell--after .tf-spell__key { transform: translate(-50%, -32%) scale(34); animation: tf-keyopen 1.2s cubic-bezier(0.7, 0, 0.25, 1) both; }
.tf-spell__translation { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 22px; padding-bottom: 140px; }
.tf-spell__translation > .tf-story:first-child { font-size: clamp(22px, 2.4vw, 34px); }
.tf-spell__main { margin: 0; font-weight: 800; font-size: clamp(36px, 6.2vw, 106px); line-height: 0.94; letter-spacing: -0.05em; max-width: 1240px; }
.tf-spell__sub { font-size: clamp(24px, 3vw, 46px); }
.tf-spell--after .tf-land { animation: tf-land 1s cubic-bezier(0.2, 0.9, 0.25, 1.1) both; }
.tf-spell--after .tf-land:nth-child(1) { animation-delay: 0.7s; }
.tf-spell--after .tf-land:nth-child(2) { animation-delay: 0.8s; }
.tf-spell--after .tf-land:nth-child(3) { animation-delay: 1s; }
.tf-spell--after .tf-land:nth-child(4) { animation-delay: 1.2s; }

@keyframes tf-keyopen { from { transform: translate(-50%, -32%) scale(0); } to { transform: translate(-50%, -32%) scale(34); } }
@keyframes tf-land { 0% { opacity: 0; transform: translateY(50px) rotate(-2deg); } 70% { opacity: 1; transform: translateY(-4px); } 100% { opacity: 1; transform: none; } }
`;

/** Act III: the guide's three ways in on mint discs, then the worlds. */
export const actThreeCSS: string = `
.tf-act-three { padding-top: 72px; padding-bottom: clamp(110px, 12vw, 170px); display: flex; flex-direction: column; gap: clamp(56px, 7vw, 88px); }
.tf-act-three__top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 28px; }
.tf-act-three__intro { margin: 0; max-width: 380px; font-size: 18px; line-height: 1.55; }
.tf-guide-spell { position: relative; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: flex-start; gap: 16px 36px; }
.tf-guide-spell--mirrored { flex-direction: row-reverse; justify-content: flex-end; }
.tf-guide-spell__disc { position: absolute; left: -3%; bottom: 6%; width: clamp(160px, 24vw, 380px); aspect-ratio: 1; border-radius: 50%; background: var(--palette-mint); box-shadow: var(--shadow-paper); z-index: 0; }
.tf-guide-spell--mirrored .tf-guide-spell__disc { left: auto; right: -3%; }
.tf-guide-spell__word { position: relative; z-index: 1; font-weight: 800; font-size: clamp(76px, 19vw, 300px); line-height: 0.8; letter-spacing: -0.07em; }
.tf-guide-spell__mark { position: relative; z-index: 2; width: clamp(64px, 8vw, 120px); margin-bottom: 24px; color: var(--palette-ink); filter: var(--shadow-cutout); }
.tf-guide-spell__mark svg { display: block; width: 100%; height: auto; overflow: visible; }
.tf-guide-spell__text { position: relative; z-index: 3; flex: 0 1 300px; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding-bottom: 20px; font-size: 18px; line-height: 1.5; }
.tf-talk { transform-box: view-box; transform-origin: 76px 105px; animation: tf-talk 1.6s ease-in-out infinite; }
@keyframes tf-talk { 0%, 100% { transform: scaleX(1); } 50% { transform: scaleX(0.7); } }
.tf-sectors { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 20px; border-top: 1px solid rgb(35 35 35 / 0.2); padding-top: 28px; }
.tf-sectors .tf-story { font-size: 22px; }
.tf-sectors__list { display: flex; flex-wrap: wrap; gap: 10px; margin: 0; padding: 0; list-style: none; }
.tf-chip { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 18px; background: var(--palette-card); border-radius: var(--radius-pill); font-weight: 600; font-size: var(--text-label-md); box-shadow: var(--shadow-paper); transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.25, 1.2); }
.tf-chip:hover { transform: translateY(-3px); }
.tf-chip__dot { width: 9px; height: 9px; border-radius: 50%; }
.tf-chip__dot--red { background: var(--palette-red); }
.tf-chip__dot--mint { background: var(--palette-mint); }
.tf-chip__dot--mustard { background: var(--palette-mustard); }
.tf-chip__dot--ink { background: var(--palette-ink); }
`;

/** Act IV: the stories as tilted cards on a twelve-column board. */
export const actFourCSS: string = `
.tf-torn--ink { fill: var(--color-bg-dark); }
.tf-act-four { padding-top: 40px; padding-bottom: clamp(120px, 13vw, 180px); display: flex; flex-direction: column; gap: 52px; }
.tf-cards { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 28px; align-items: start; }
.tf-card { position: relative; display: flex; flex-direction: column; background: var(--palette-card); box-shadow: var(--shadow-paper); transition: transform 0.4s cubic-bezier(0.2, 0.9, 0.25, 1.2); }
.tf-card:hover { transform: rotate(0deg) translateY(-6px); z-index: 6; }
.tf-card .tf-eyebrow { margin-bottom: 18px; }
.tf-card--feature { grid-column: 1 / 8; grid-row: 1; padding: clamp(28px, 3vw, 40px); transform: rotate(-1.2deg); z-index: 2; }
.tf-card--figure { grid-column: 8 / 13; grid-row: 1; margin-top: 80px; padding: 32px; transform: rotate(2.4deg); z-index: 1; }
.tf-card--ink { grid-column: 1 / 5; grid-row: 2; margin-top: -10px; background: var(--color-bg-dark); color: var(--color-text-on-dark); transform: rotate(2deg); z-index: 3; }
.tf-card--story { grid-column: 4 / 11; grid-row: 2; margin-top: 70px; padding: clamp(28px, 3vw, 40px); background: var(--palette-red); transform: rotate(-0.8deg); z-index: 4; overflow: hidden; }
.tf-card__figure { font-weight: 800; font-size: clamp(52px, 6vw, 96px); line-height: 0.85; letter-spacing: -0.05em; }
.tf-card__figure--large { font-size: clamp(64px, 10vw, 160px); letter-spacing: -0.06em; }
.tf-unit { color: var(--palette-red); }
.tf-card__line { margin-top: 18px; font-size: clamp(22px, 2.2vw, 32px); line-height: 1.15; }
.tf-card__text { margin-top: 12px; font-size: 17px; line-height: 1.45; max-width: 520px; }
.tf-card__photo { margin: calc(-1 * clamp(28px, 3vw, 40px)) calc(-1 * clamp(28px, 3vw, 40px)) 28px; height: 220px; overflow: hidden; }
.tf-card__photo img { display: block; width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.08); mix-blend-mode: multiply; }
.tf-card__headline { font-weight: 800; font-size: clamp(36px, 5vw, 80px); line-height: 0.9; letter-spacing: -0.05em; }
.tf-card__headline em { font-family: var(--font-story); font-style: italic; font-weight: 500; letter-spacing: var(--tracking-story); }
.tf-card--story .tf-card__text { margin-top: 18px; line-height: 1.5; }
@media (max-width: 860px) {
  .tf-stack > * { grid-column: 1 / -1 !important; grid-row: auto !important; margin-top: 0 !important; }
}
`;

/** The crossroads and the epilogue: the dark stage at the story's end. */
export const finaleCSS: string = `
.tf-act--crossroads, .tf-act--epilogue { background: var(--color-bg-dark); color: var(--color-text-on-dark); }
.tf-act--crossroads { overflow: hidden; }
.tf-site .tf-act--crossroads a:hover, .tf-site .tf-act--epilogue a:hover { color: inherit; }
.tf-crossroads { padding-top: clamp(90px, 10vw, 120px); padding-bottom: clamp(100px, 11vw, 150px); display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 48px; align-items: center; }
.tf-crossroads__words { min-width: 0; position: relative; z-index: 2; display: flex; flex-direction: column; gap: 22px; }
.tf-crossroads__headline { margin: 0; font-weight: 800; font-size: clamp(64px, 10vw, 168px); line-height: 0.82; letter-spacing: -0.065em; }
.tf-crossroads__headline em, .tf-epilogue__headline em { font-family: var(--font-story); font-style: italic; font-weight: 500; letter-spacing: var(--tracking-story); }
.tf-crossroads .tf-lede { max-width: 440px; font-size: 19px; line-height: 1.5; }
.tf-crossroads__scene { position: relative; display: flex; justify-content: center; align-items: center; padding: 10px 0; }
.tf-glow-disc { position: absolute; left: 50%; top: 50%; width: min(115%, 560px); aspect-ratio: 1; transform: translate(-50%, -50%); border-radius: 50%; background: radial-gradient(circle, rgb(244 239 230 / 0.16) 0 48%, rgb(244 239 230 / 0) 70%); }
.tf-signpost { position: relative; display: block; width: min(100%, 380px); height: auto; overflow: visible; filter: drop-shadow(0 14px 16px rgb(0 0 0 / 0.35)); }
.tf-sign-sway { transform-box: view-box; animation: tf-sign-sway 8s ease-in-out infinite; }
@keyframes tf-sign-sway { 0%, 100% { transform: rotate(-1.5deg); } 50% { transform: rotate(1.5deg); } }

.tf-act--epilogue { border-top: 1px solid rgb(255 255 255 / 0.12); }
.tf-epilogue { padding-top: clamp(90px, 10vw, 120px); padding-bottom: clamp(100px, 11vw, 140px); display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); gap: 56px; align-items: center; }
.tf-epilogue__words { min-width: 0; display: flex; flex-direction: column; gap: 26px; }
.tf-epilogue__headline { margin: 0; font-weight: 800; font-size: clamp(52px, 7.6vw, 128px); line-height: 0.86; letter-spacing: -0.06em; }
.tf-epilogue__headline em { color: var(--palette-mint); }
.tf-epilogue__note { margin: 0; max-width: 460px; font-size: 18px; line-height: 1.55; }
.tf-epilogue__scene { position: relative; height: clamp(420px, 42vw, 560px); }
.tf-epilogue__disc { position: absolute; aspect-ratio: 1; border-radius: 50%; }
.tf-epilogue__disc--red { left: 6%; top: 8%; width: 46%; background: var(--palette-red); }
.tf-epilogue__disc--mint { right: 2%; bottom: 4%; width: 36%; background: var(--palette-mint); }
.tf-guide { position: absolute; margin: 0; transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.25, 1.2); }
.tf-guide--arch { left: 12%; top: 0; width: 42%; transform: rotate(-3deg); }
.tf-guide--disc { right: 4%; top: 22%; width: 40%; transform: rotate(3deg); }
.tf-guide:hover { transform: translateY(-6px) rotate(-1deg); }
.tf-guide__frame { filter: var(--shadow-cutout); }
.tf-guide__frame img { display: block; width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.08); }
.tf-guide--arch .tf-guide__frame { aspect-ratio: 3 / 4; }
.tf-guide--arch img { object-position: 50% 25%; border-radius: 999px 999px 0 0; }
.tf-guide--disc .tf-guide__frame { aspect-ratio: 1; }
.tf-guide--disc img { object-position: 50% 18%; border-radius: 50%; }
.tf-guide figcaption { margin-top: 12px; }
.tf-guide--disc figcaption { text-align: center; }
`;
