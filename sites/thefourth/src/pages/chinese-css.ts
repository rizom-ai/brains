import { KEYHOLE_CLIP } from "../shapes";

/**
 * The inner pages as Sam drew them in Chinese: no italics or tight tracking,
 * display lines at a looser leading, and measures in em, since a Han
 * character is about an em wide where a Latin one is half that.
 */
const sharedCSS = `
:lang(zh-TW) .tf-em { font-style: normal; }
:lang(zh-TW) .tf-next__eyebrow { font-style: normal; letter-spacing: 0; }
:lang(zh-TW) .tf-next__headline { max-width: 14.4em; line-height: 1.25; letter-spacing: 0; }
:lang(zh-TW) .tf-intro__eyebrow { font-style: normal; letter-spacing: 0; }
:lang(zh-TW) .tf-intro__headline { font-size: clamp(30px, 3.6vw, 54px); line-height: 1.25; letter-spacing: 0; max-width: 13.6em; }
:lang(zh-TW) .tf-h2 { line-height: 1.25; letter-spacing: 0; }
:lang(zh-TW) .tf-pcard { box-shadow: 0 1px 2px rgb(35 35 35 / 0.1), 0 16px 28px -16px rgb(35 35 35 / 0.42); }
`;

const talkCSS = `
:lang(zh-TW) :is(.tf-path__title, .tf-steps__number, .tf-test__headline) { line-height: 1.25; letter-spacing: 0; }
`;

const aboutCSS = `
:lang(zh-TW) .tf-wall__headline { font-style: normal; line-height: 1.25; letter-spacing: 0; }
:lang(zh-TW) .tf-wall__text { max-width: 24em; }
:lang(zh-TW) .tf-mission__statement { max-width: 17.6em; line-height: 1.25; letter-spacing: 0; }
:lang(zh-TW) .tf-mark-word { font-style: normal; letter-spacing: 0; }
:lang(zh-TW) :is(.tf-acts__numeral, .tf-fold__dot) { font-style: normal; }
:lang(zh-TW) .tf-diagram__title { font-style: normal; line-height: 1.25; }
:lang(zh-TW) .tf-diagram__caption > span:last-child { max-width: 35.2em; }
:lang(zh-TW) .tf-cast__headline { max-width: 10.4em; line-height: 1.25; letter-spacing: 0; }
:lang(zh-TW) .tf-cast__intro { max-width: 25.6em; font-style: normal; }
:lang(zh-TW) .tf-guide__name { line-height: 1.25; letter-spacing: 0; }
:lang(zh-TW) :is(.tf-guide__role, .tf-note-card__title, .tf-pin figcaption) { font-style: normal; }
:lang(zh-TW) .tf-offstage__headline { line-height: 1.25; letter-spacing: 0; }
`;

/** The lit stage a Chinese inner page opens on, and the bar that follows. */
const stageCSS = `
.tf-intro--stage { position: relative; overflow: hidden; background-image: radial-gradient(ellipse 55% 75% at 50% 0%, rgb(255 255 255 / 0.3), rgb(255 255 255 / 0) 70%); }
.tf-intro--red { background-color: var(--palette-red); }
.tf-intro--mint { background-color: var(--palette-mint); }
.tf-intro--mustard { background-color: var(--palette-mustard); }
.tf-intro__valance { position: absolute; left: 0; right: 0; top: 0; height: clamp(34px, 4.6vw, 58px); z-index: 2; }
.tf-intro__valance svg { display: block; width: 100%; height: 100%; fill: var(--palette-ink); }
.tf-intro__curtain { position: absolute; top: 0; bottom: 0; width: clamp(18px, 4vw, 64px); z-index: 1; background: var(--palette-ink); }
.tf-intro__curtain--left { left: 0; clip-path: polygon(0 0, 100% 0, 80% 12%, 100% 25%, 78% 38%, 98% 50%, 80% 62%, 100% 75%, 78% 88%, 96% 100%, 0 100%); }
.tf-intro__curtain--right { right: 0; clip-path: polygon(0 0, 100% 0, 100% 100%, 4% 100%, 22% 88%, 0 75%, 20% 62%, 2% 50%, 22% 38%, 0 25%, 20% 12%); }
.tf-intro--stage .tf-intro__inner { position: relative; z-index: 3; padding-top: clamp(84px, 9vw, 132px); padding-bottom: clamp(64px, 7vw, 104px); gap: 26px; }
.tf-intro--stage .tf-intro__eyebrow { align-self: flex-start; display: inline-flex; align-items: center; gap: 12px; padding: 8px 20px 8px 14px; background: var(--palette-paper); border-radius: var(--radius-pill); box-shadow: 0 10px 20px -14px rgb(35 35 35 / 0.6); font-family: var(--font-sans); font-style: normal; font-weight: 800; font-size: clamp(20px, 2vw, 28px); letter-spacing: 0.02em; }
.tf-intro--stage .tf-intro__eyebrow .tf-pdot { width: 12px; height: 12px; }
.tf-intro--stage .tf-intro__headline { max-width: 14.4em; }
.tf-intro__line { display: block; }
.tf-intro__tail { display: block; margin-top: 0.12em; font-family: var(--font-story); font-style: normal; font-weight: 500; font-size: 0.86em; letter-spacing: 0; }
.tf-intro--mark-marker-mustard .tf-intro__mark { background: linear-gradient(transparent 64%, var(--palette-mustard) 64%, var(--palette-mustard) 92%, transparent 92%); padding: 0 0.04em; }
.tf-intro--mark-marker-white .tf-intro__mark { background: linear-gradient(transparent 64%, var(--palette-card) 64%, var(--palette-card) 92%, transparent 92%); padding: 0 0.04em; }
.tf-intro--mark-pill .tf-intro__mark { display: inline-block; background: var(--palette-card); border-radius: var(--radius-pill); padding: 0 0.32em; box-shadow: 0 10px 18px -12px rgb(35 35 35 / 0.6); transform: rotate(-2deg); }
.tf-intro__art { position: absolute; right: clamp(84px, 10vw, 180px); top: clamp(96px, 9vw, 140px); z-index: 3; }
.tf-intro__edge { position: absolute; left: 0; right: 0; bottom: -1px; width: 100%; height: 18px; display: block; z-index: 2; fill: var(--palette-paper); }
.tf-subnav { position: sticky; top: 0; z-index: 20; background: rgb(244 239 230 / 0.95); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); border-bottom: 1px solid rgb(35 35 35 / 0.12); }
.tf-subnav__inner { box-sizing: border-box; max-width: 1280px; margin: 0 auto; padding: 10px clamp(24px, 7vw, 112px); display: flex; align-items: center; gap: 8px; overflow-x: auto; }
.tf-subnav__label { flex: none; margin-right: 6px; font-size: 13px; font-weight: 700; color: var(--tf-zh-ink-warm); }
.tf-site .tf-subnav__link { flex: none; display: inline-flex; align-items: center; min-height: 40px; padding: 0 16px; border-radius: var(--radius-pill); border: 1.5px solid rgb(35 35 35 / 0.2); color: var(--palette-ink); text-decoration: none; font-weight: 700; font-size: 15px; white-space: nowrap; transition: background-color 0.15s ease; }
.tf-site .tf-subnav__link:hover { background: var(--palette-card); }
.tf-subnav__cta { flex: none; margin-left: auto; min-height: 40px; padding: 0 18px; font-size: 15px; white-space: nowrap; box-shadow: none; }
`;

/** Who: Bobby on the stage, and each world's cards lifted and lit. */
const whoCSS = `
.tf-bobby { position: relative; width: 380px; height: 230px; animation: tf-bobby 2.6s ease-in-out 2; }
.tf-bobby svg { position: absolute; left: 0; top: 0; width: 380px; height: 230px; overflow: visible; filter: drop-shadow(0 12px 14px rgb(35 35 35 / 0.25)); }
.tf-spill { position: absolute; border-radius: 50%; background: var(--palette-card); display: flex; align-items: center; justify-content: center; line-height: 1; box-shadow: 0 2px 2px rgb(35 35 35 / 0.15), 0 12px 18px -10px rgb(35 35 35 / 0.5); transform: rotate(var(--r)); animation: tf-spill 3.2s ease-in-out 2; }
@keyframes tf-spill { 0%, 100% { transform: translate(0, 0) rotate(var(--r)); } 50% { transform: translate(6px, -8px) rotate(var(--r)); } }
@keyframes tf-bobby { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@media (prefers-reduced-motion: reduce) { .tf-bobby, .tf-spill { animation: none; } }
:lang(zh-TW) .tf-world .tf-h2 { max-width: 16em; }
:lang(zh-TW) .tf-world .tf-split .tf-stack { gap: 10px; }
:lang(zh-TW) .tf-hear li { box-shadow: 0 1px 2px rgb(35 35 35 / 0.1), 0 16px 28px -16px rgb(35 35 35 / 0.42); font-style: normal; letter-spacing: 0; }
:lang(zh-TW) .tf-hear li:nth-child(3n+1) { transform: rotate(-1deg); }
:lang(zh-TW) .tf-hear li:nth-child(3n+2) { transform: rotate(0.8deg); }
:lang(zh-TW) .tf-hear li:nth-child(3n) { transform: rotate(-0.5deg); }
:lang(zh-TW) .tf-translation { gap: 16px; align-items: stretch; }
:lang(zh-TW) .tf-translation__before { background: transparent; box-shadow: none; border: 1.5px solid rgb(35 35 35 / 0.25); }
:lang(zh-TW) .tf-translation__after { box-shadow: 0 1px 2px rgb(35 35 35 / 0.1), 0 16px 28px -16px rgb(35 35 35 / 0.42); }
:lang(zh-TW) .tf-translation__after p { font-style: normal; letter-spacing: 0; }
:lang(zh-TW) .tf-world .tf-case { border-top: 6px solid transparent; }
:lang(zh-TW) .tf-world:has(.tf-world__label .tf-pdot--mint) .tf-case { border-top-color: var(--palette-mint); }
:lang(zh-TW) .tf-world:has(.tf-world__label .tf-pdot--mustard) .tf-case { border-top-color: var(--palette-mustard); }
:lang(zh-TW) .tf-world:has(.tf-world__label .tf-pdot--red) .tf-case { border-top-color: var(--palette-red); }
:lang(zh-TW) .tf-world:has(.tf-world__label .tf-pdot--ink) .tf-case { border-top-color: var(--palette-ink); }
:lang(zh-TW) :is(.tf-case__context, .tf-case__quote blockquote) { font-style: normal; letter-spacing: 0; }
:lang(zh-TW) .tf-stat__value { letter-spacing: 0; }
:lang(zh-TW) .tf-stat__label { max-width: 17.6em; }
:lang(zh-TW) .tf-stat__label:only-child { max-width: 19.2em; }
`;

/**
 * What: the steps as badges on a red stage that runs on into the index, the
 * cycle over the tiles, each tile and case lit in its step's color, and the
 * English names under the Chinese.
 */
const whatCSS = `
.tf-badges { position: relative; width: 250px; height: 150px; }
.tf-badge { position: absolute; width: 92px; height: 92px; border-radius: 50%; color: var(--palette-ink); display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 2px rgb(35 35 35 / 0.15), 0 16px 24px -12px rgb(35 35 35 / 0.5); }
.tf-badge svg { width: 46px; height: 46px; }
.tf-badge--1 { left: 0; top: 30px; background: var(--palette-mustard); transform: rotate(-8deg); }
.tf-badge--2 { left: 78px; top: 0; background: var(--palette-paper); transform: rotate(4deg); }
.tf-badge--3 { left: 156px; top: 46px; background: var(--palette-mint); transform: rotate(-3deg); }
:lang(zh-TW) .tf-intro--stage:has(+ .tf-index) .tf-intro__inner { padding-bottom: 0; }
:lang(zh-TW) .tf-intro--stage:has(+ .tf-index) .tf-intro__edge { display: none; }
:lang(zh-TW) .tf-intro--stage + .tf-index { position: relative; overflow: hidden; background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1440 24' preserveAspectRatio='none'%3E%3Cpolygon fill='%23F4EFE6' points='0,24 0,14 60,6 120,12 180,4 240,10 300,6 360,13 420,5 480,11 540,7 600,14 660,6 720,10 780,4 840,12 900,7 960,13 1020,5 1080,11 1140,6 1200,12 1260,5 1320,10 1380,6 1440,12 1440,24'/%3E%3C/svg%3E") left bottom / 100% 18px no-repeat; }
:lang(zh-TW) .tf-intro--red + .tf-index { background-color: var(--palette-red); }
:lang(zh-TW) .tf-intro--stage + .tf-index::before, :lang(zh-TW) .tf-intro--stage + .tf-index::after { content: ""; position: absolute; top: 0; bottom: 0; width: clamp(18px, 4vw, 64px); z-index: 1; background: var(--palette-ink); }
:lang(zh-TW) .tf-intro--stage + .tf-index::before { left: 0; clip-path: polygon(0 0, 100% 0, 80% 12%, 100% 25%, 78% 38%, 98% 50%, 80% 62%, 100% 75%, 78% 88%, 96% 100%, 0 100%); }
:lang(zh-TW) .tf-intro--stage + .tf-index::after { right: 0; clip-path: polygon(0 0, 100% 0, 100% 100%, 4% 100%, 22% 88%, 0 75%, 20% 62%, 2% 50%, 22% 38%, 0 25%, 20% 12%); }
:lang(zh-TW) .tf-intro--stage + .tf-index .tf-pwrap { position: relative; z-index: 3; padding-top: 26px; padding-bottom: clamp(64px, 7vw, 104px); }
.tf-cycle { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.tf-cycle + .tf-index__nav { margin-top: 38px; }
.tf-cycle__station { display: inline-flex; align-items: center; gap: 8px; min-height: 42px; padding: 0 18px; border-radius: var(--radius-pill); background: var(--palette-card); font-family: var(--font-sans); font-weight: 800; font-size: 18px; }
.tf-cycle__station .tf-pdot { width: 10px; height: 10px; }
.tf-cycle__sep { font-size: 20px; font-weight: 800; }
.tf-cycle__repeat { display: inline-flex; align-items: center; gap: 6px; margin-left: 4px; font-weight: 800; font-size: 18px; }
.tf-cycle__repeat > span { font-size: 22px; }
:lang(zh-TW) .tf-index__word { letter-spacing: 0; }
:lang(zh-TW) .tf-index__name { font-style: normal; }
:lang(zh-TW) .tf-site .tf-index__tile { position: relative; justify-content: flex-start; gap: 14px; min-height: 112px; padding: 16px 16px 14px; border: 0; border-top: 5px solid transparent; box-shadow: 0 1px 2px rgb(35 35 35 / 0.1), 0 14px 24px -16px rgb(35 35 35 / 0.5); }
:lang(zh-TW) .tf-index__row--mustard .tf-index__tile { border-top-color: var(--palette-mustard); }
:lang(zh-TW) .tf-index__row--red .tf-index__tile { border-top-color: var(--palette-red); }
:lang(zh-TW) .tf-index__row--mint .tf-index__tile { border-top-color: var(--palette-mint); }
:lang(zh-TW) .tf-index__row--ink .tf-index__tile { border-top-color: var(--palette-ink); }
:lang(zh-TW) .tf-index__n { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: auto; font-weight: 800; font-size: 13px; }
:lang(zh-TW) .tf-index__n::after { content: "↓" / ""; font-size: 15px; font-weight: 400; color: var(--tf-zh-ink-warm); }
:lang(zh-TW) .tf-index__title { font-size: clamp(17px, 2vw, 24px); line-height: 1.25; letter-spacing: 0; }
.tf-index__en { margin-top: -8px; font-weight: 700; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--tf-zh-ink-warm); }
@media (max-width: 640px) {
  :lang(zh-TW) .tf-index__tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  :lang(zh-TW) .tf-site .tf-index__tile { padding: 12px 10px; min-height: 84px; }
  :lang(zh-TW) .tf-index__en { display: none; }
}
:lang(zh-TW) :is(.tf-step, .tf-service) { scroll-margin-top: 84px; }
:lang(zh-TW) .tf-step__name { font-style: normal; }
:lang(zh-TW) .tf-step__word { line-height: 1.25; letter-spacing: 0; }
.tf-step__local { font-size: 0.3em; font-weight: 700; letter-spacing: 0; vertical-align: middle; }
:lang(zh-TW) .tf-service__title { letter-spacing: 0; }
.tf-service__en { margin: -10px 0 0; font-weight: 700; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--tf-zh-ink-warm); }
:lang(zh-TW) .tf-service__tagline { font-style: normal; }
:lang(zh-TW) .tf-seen { border-top: 6px solid transparent; }
:lang(zh-TW) .tf-service--mustard .tf-seen { border-top-color: var(--palette-mustard); }
:lang(zh-TW) .tf-service--red .tf-seen { border-top-color: var(--palette-red); }
:lang(zh-TW) .tf-service--mint .tf-seen { border-top-color: var(--palette-mint); }
:lang(zh-TW) .tf-service--ink .tf-seen { border-top-color: var(--palette-ink); }
:lang(zh-TW) .tf-seen__title { line-height: 1.25; letter-spacing: 0; }
:lang(zh-TW) .tf-loop .tf-next__headline { max-width: none; }
`;

/**
 * How: a key turning in its keyhole on a mint stage, the pattern as a track,
 * the methods as a comparison and a flow, and three circles round a promise.
 */
const howCSS = `
.tf-intro__glyph { display: inline-block; width: 1.3em; margin-right: 0.18em; vertical-align: -0.08em; color: var(--palette-ink); }
.tf-intro__glyph svg { display: block; width: 100%; height: auto; overflow: visible; }
.tf-keystage { position: relative; width: 170px; height: 170px; border-radius: 50%; background: var(--palette-paper); box-shadow: 0 2px 2px rgb(35 35 35 / 0.15), 0 18px 28px -14px rgb(35 35 35 / 0.5); }
.tf-keystage__hole { position: absolute; left: 50%; top: 50%; width: 46px; height: 70px; transform: translate(-50%, -50%); background: var(--palette-ink); clip-path: ${KEYHOLE_CLIP}; }
.tf-keystage__key { position: absolute; right: 50%; top: 38%; width: 170px; transform-origin: 100% 50%; color: var(--palette-mustard); animation: tf-keyturn 4s ease-in-out 2; }
.tf-keystage__key svg { display: block; width: 100%; height: auto; }
@keyframes tf-keyturn { 0%, 100% { transform: rotate(-10deg); } 50% { transform: rotate(8deg); } }
@media (prefers-reduced-motion: reduce) { .tf-keystage__key { animation: none; } }

.tf-zpattern { border-top: 1px solid rgb(35 35 35 / 0.16); background: var(--palette-card); }
:is(.tf-zpattern, .tf-zmethod) .tf-pwrap { padding-top: clamp(64px, 8vw, 112px); padding-bottom: clamp(64px, 8vw, 112px); display: flex; flex-direction: column; gap: clamp(36px, 4.5vw, 60px); }
.tf-zpattern .tf-stack { gap: 12px; }
:is(.tf-zpattern, .tf-zmethod) .tf-plabel { letter-spacing: 0.14em; text-transform: none; }
.tf-zpattern__headline { margin: 0; font-weight: 800; font-size: clamp(28px, 3vw, 44px); line-height: 1.25; max-width: 24em; }
.tf-track { position: relative; margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px; }
.tf-track::before { content: ""; position: absolute; left: 17px; right: calc((100% - 84px) / 4 - 17px); top: 21px; height: 2px; background: repeating-linear-gradient(90deg, var(--palette-ink) 0 8px, transparent 8px 14px); }
.tf-track__step { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.tf-track__dotrow { height: 44px; display: flex; align-items: center; }
.tf-track__n { position: relative; z-index: 1; width: 34px; height: 34px; border-radius: 50%; background: var(--palette-ink); color: var(--palette-card); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; }
.tf-track__n--red { width: 44px; height: 44px; background: var(--palette-red); box-shadow: 0 0 0 8px rgb(239 89 89 / 0.18); }
.tf-track__name { font-weight: 800; font-size: clamp(26px, 2.4vw, 34px); line-height: 1.1; }
.tf-track__tag { font-size: 0.5em; font-weight: 700; letter-spacing: 0.06em; color: var(--tf-zh-ink-warm); }
.tf-track__title { font-size: 18px; }
.tf-track__text { font-size: 16px; line-height: 1.6; color: var(--tf-zh-ink-warm); }
.tf-brackets { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 28px; }
.tf-site .tf-bracket { display: flex; flex-direction: column; gap: 10px; text-decoration: none; color: var(--palette-ink); }
.tf-bracket--from-1 { grid-column-start: 1; } .tf-bracket--from-2 { grid-column-start: 2; } .tf-bracket--from-3 { grid-column-start: 3; } .tf-bracket--from-4 { grid-column-start: 4; }
.tf-bracket--span-2 { grid-column-end: span 2; } .tf-bracket--span-3 { grid-column-end: span 3; }
.tf-bracket__line { height: 10px; border: 2px solid var(--palette-ink); border-top: 0; border-radius: 0 0 6px 6px; }
.tf-bracket--red .tf-bracket__line { border-color: var(--palette-red); }
.tf-bracket__label { font-weight: 800; font-size: 15px; }
.tf-bracket--red .tf-bracket__arrow { color: var(--palette-red); }
.tf-repeat { margin: 0; display: flex; align-items: center; gap: 10px; font-size: 15px; color: var(--tf-zh-ink-warm); }
.tf-repeat__mark { font-size: 22px; color: var(--palette-ink); }
.tf-repeat strong { color: var(--palette-ink); }
@media (max-width: 900px) {
  .tf-track, .tf-brackets { grid-template-columns: 1fr; }
  .tf-track::before { left: 21px; right: auto; top: 0; bottom: 0; width: 2px; height: auto; background: repeating-linear-gradient(180deg, var(--palette-ink) 0 8px, transparent 8px 14px); }
  .tf-track__step { position: relative; padding-left: 60px; }
  .tf-track__dotrow { position: absolute; left: 0; top: 0; width: 44px; justify-content: center; }
  .tf-site .tf-bracket { grid-column: auto; }
  .tf-bracket__line { display: none; }
}

.tf-zmethod { border-top: 1px solid rgb(35 35 35 / 0.16); }
.tf-zmethod__head { display: flex; flex-direction: column; gap: 12px; }
.tf-zmethod__name { margin: 0; font-weight: 800; font-size: clamp(32px, 3.6vw, 56px); line-height: 1.25; }
.tf-zmethod__gloss { display: block; margin-top: 6px; font-size: 0.42em; font-weight: 700; letter-spacing: 0.04em; color: var(--tf-zh-ink-warm); }
.tf-zmethod__tagline { margin: 0; font-family: var(--font-story); font-style: normal; font-weight: 500; font-size: clamp(22px, 2vw, 28px); }
.tf-windows { margin: 0; display: flex; flex-direction: column; gap: 22px; padding: clamp(20px, 3vw, 36px); background: #eae3d8; border-radius: 14px; }
.tf-windows__row { display: grid; grid-template-columns: 150px minmax(0, 1fr) 110px; gap: 24px; align-items: center; }
.tf-windows__who { display: flex; flex-direction: column; gap: 2px; }
.tf-windows__who strong { font-weight: 800; font-size: 20px; }
.tf-windows__sub { font-size: 13px; color: var(--tf-zh-ink-warm); }
.tf-windows__chips { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 40px; }
.tf-windows__chip { position: relative; background: var(--palette-card); border: 1.5px solid rgb(35 35 35 / 0.22); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; min-width: 0; }
.tf-windows__stage { font-size: 13px; color: #8a8378; }
.tf-windows__chip strong { font-size: 17px; color: var(--tf-zh-ink-warm); }
.tf-windows__hand { position: absolute; left: -40px; width: 40px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; font-size: 11px; font-weight: 700; color: #8a8378; }
.tf-windows__dash { width: 26px; margin-top: 3px; border-top: 2px dashed #a9a196; }
.tf-windows__count { text-align: right; font-weight: 800; font-size: 34px; line-height: 1; }
.tf-windows__unit { display: block; margin-top: 4px; font-size: 13px; font-weight: 700; color: var(--tf-zh-ink-warm); }
.tf-windows__rule { border-top: 1px solid rgb(35 35 35 / 0.14); }
.tf-windows__lead { background: var(--palette-ink); color: var(--palette-card); border-radius: 10px; padding: 16px 20px; display: flex; flex-direction: column; gap: 10px; box-shadow: 0 1px 2px rgb(35 35 35 / 0.1), 0 16px 28px -16px rgb(35 35 35 / 0.42); }
.tf-windows__lead strong { font-size: 18px; }
.tf-windows__dots { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.tf-windows__dots > span { display: flex; align-items: center; gap: 8px; font-size: 13px; color: rgb(255 255 255 / 0.75); min-width: 0; }
.tf-windows__dots > span::before { content: ""; flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--palette-mint); }
.tf-windows figcaption { font-size: 15px; color: var(--tf-zh-ink-warm); }
.tf-cols { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 28px; }
.tf-cols li { border-top: 2px solid var(--palette-ink); padding-top: 14px; display: flex; flex-direction: column; gap: 6px; }
.tf-cols__n { font-weight: 800; font-size: 13px; color: var(--tf-zh-ink-warm); }
.tf-cols strong { font-size: 19px; }
.tf-cols__text { font-size: 16px; line-height: 1.6; }
@media (max-width: 900px) {
  .tf-windows__row { grid-template-columns: 1fr; gap: 12px; }
  .tf-windows__count { text-align: left; font-size: 24px; }
  .tf-windows__chips { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 28px 40px; }
  .tf-windows__chips li:nth-child(3) .tf-windows__hand { display: none; }
  .tf-windows__dots { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .tf-cols, .tf-cols--4 { grid-template-columns: 1fr; }
}

.tf-zmethod--dark { background: var(--palette-ink); color: var(--palette-card); border-top: 0; }
.tf-zmethod--dark .tf-zmethod__head { gap: 14px; }
.tf-zmethod--dark .tf-plabel { color: var(--palette-mint); }
.tf-zmethod__kicker { margin: 0; font-family: var(--font-story); font-weight: 500; font-size: clamp(24px, 2.4vw, 34px); }
.tf-zmethod__kicker .tf-zmethod__gloss { display: inline; margin: 0; font-family: var(--font-sans); font-weight: 700; font-size: 0.75em; letter-spacing: 0; color: inherit; }
.tf-zmethod--dark .tf-zmethod__name { font-size: clamp(40px, 5.6vw, 88px); line-height: 1.2; color: var(--palette-card); }
.tf-zmethod__mark { background: linear-gradient(transparent 62%, var(--palette-red) 62%, var(--palette-red) 92%, transparent 92%); }
.tf-views { display: flex; flex-direction: column; gap: 16px; }
.tf-views__label { margin: 0; font-size: 15px; color: rgb(255 255 255 / 0.7); }
.tf-views__badge { margin-left: 6px; padding: 2px 8px; border: 1px solid rgb(255 255 255 / 0.4); border-radius: 4px; font-size: 12px; }
.tf-views__cards { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr); gap: clamp(16px, 2.4vw, 32px); }
.tf-view { border-radius: 14px; display: flex; flex-direction: column; gap: 18px; }
.tf-view--usual { background: #34322f; color: #d9d3c9; padding: clamp(20px, 2.6vw, 30px); align-self: center; }
.tf-view--ours { background: var(--palette-paper); color: var(--palette-ink); border-top: 8px solid var(--palette-red); padding: clamp(24px, 3vw, 36px); box-shadow: 0 28px 60px -24px rgb(0 0 0 / 0.7); }
.tf-view__label { font-weight: 700; font-size: 13px; letter-spacing: 0.14em; color: #8a8378; }
.tf-view--ours .tf-view__label { color: var(--tf-zh-strike); }
.tf-view__creator { display: flex; align-items: center; gap: 12px; }
.tf-view__who { display: flex; flex-direction: column; }
.tf-view__avatar { width: 46px; height: 46px; border-radius: 50%; background: #5a5650; color: var(--palette-ink); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 20px; }
.tf-view--ours .tf-view__avatar { background: var(--palette-mint); }
.tf-view__creator strong { font-size: 17px; }
.tf-view__meta { font-size: 13px; opacity: 0.7; }
.tf-view__stats { display: flex; gap: 28px; }
.tf-view__stat { display: flex; flex-direction: column; gap: 2px; }
.tf-view__stat:has(.tf-view__blank) { gap: 6px; }
.tf-view__stat-label { font-size: 12px; color: #8a8378; }
.tf-view__stat strong { font-family: var(--font-sans); font-size: 22px; color: #d9d3c9; }
.tf-view__blank { width: 64px; height: 18px; border-radius: 4px; background: #5a5650; }
.tf-view__layers { display: flex; flex-direction: column; gap: 10px; }
.tf-view__layer { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 10px; align-items: start; }
.tf-view__layer-label { font-size: 13px; font-weight: 800; padding-top: 5px; }
.tf-view__tags { display: flex; flex-wrap: wrap; gap: 6px; }
.tf-view__tag { padding: 4px 10px; border-radius: var(--radius-pill); font-size: 14px; font-weight: 700; }
.tf-view__tag--mint { background: #c9f5de; } .tf-view__tag--mustard { background: #f1eaa0; } .tf-view__tag--red { background: #f8c4c4; } .tf-view__tag--ink { background: #d9d3c9; }
.tf-view__row { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 12px; padding: 12px 0; border-top: 1px solid rgb(255 255 255 / 0.12); }
.tf-view--ours .tf-view__row { border-top-color: rgb(35 35 35 / 0.14); }
.tf-view__row-label { font-size: 13px; font-weight: 700; color: #8a8378; }
.tf-view--ours .tf-view__row-label { color: var(--tf-zh-ink-warm); }
.tf-view__row-text { font-size: 16px; line-height: 1.55; }
.tf-view--ours .tf-view__row-text { font-weight: 700; }
.tf-flow { display: flex; flex-direction: column; gap: 14px; padding-top: 8px; }
.tf-flow__title { margin: 0; font-family: var(--font-sans); font-weight: 800; font-size: clamp(20px, 2vw, 26px); }
.tf-flow__strip { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto minmax(0, 1.5fr); gap: 16px; align-items: center; }
.tf-flow__inputs { display: flex; flex-direction: column; gap: 8px; }
.tf-flow__outputs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.tf-flow__box { display: flex; flex-direction: column; gap: 2px; padding: 10px 14px; border-radius: 10px; border: 1.5px solid rgb(255 255 255 / 0.28); min-width: 0; }
.tf-flow__box strong { font-size: 16px; }
.tf-flow__box span { font-size: 13px; color: rgb(255 255 255 / 0.65); }
.tf-flow__box--out { background: rgb(97 242 173 / 0.12); border-color: rgb(97 242 173 / 0.5); }
.tf-flow__box--out strong { color: var(--palette-mint); }
.tf-flow__box--out span { color: rgb(255 255 255 / 0.7); }
.tf-flow__arrow { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 13px; font-weight: 700; color: rgb(255 255 255 / 0.7); }
.tf-flow__arrow span { font-size: 22px; color: var(--palette-card); }
.tf-flow__engine { padding: 14px 18px; border-radius: var(--radius-pill); background: var(--palette-red); color: var(--palette-ink); font-family: var(--font-sans); font-weight: 800; font-size: 18px; white-space: nowrap; }
.tf-cols--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 24px; }
.tf-cols--4 li { border-top: 1px solid rgb(255 255 255 / 0.25); }
.tf-cols--4 .tf-cols__n { color: var(--palette-mint); }
.tf-cols--4 strong { font-size: 17px; }
.tf-cols--4 .tf-cols__text { font-size: 15px; color: rgb(255 255 255 / 0.75); }
@media (max-width: 900px) {
  .tf-views__cards { grid-template-columns: 1fr; }
  .tf-flow__strip { grid-template-columns: 1fr; justify-items: start; }
  .tf-flow__arrow { flex-direction: row; }
  .tf-flow__arrow span { transform: rotate(90deg); }
}

.tf-venn { container-type: inline-size; position: relative; width: min(100%, 820px); margin: 0 auto; aspect-ratio: 1 / 0.93; }
.tf-vc { position: absolute; width: 58%; aspect-ratio: 1; }
.tf-vc--mustard { --c: #e4da55; } .tf-vc--red { --c: #f48a8a; } .tf-vc--mint { --c: #8ff5c6; } .tf-vc--ink { --c: #b5b0a8; }
.tf-vbg { position: absolute; inset: 0; border-radius: 50%; background: var(--c); opacity: 0.7; }
.tf-v1 { left: 3%; top: 0; } .tf-v2 { right: 3%; top: 0; } .tf-v3 { left: 21%; top: 35%; }
.tf-vt { position: absolute; text-wrap: balance; display: flex; flex-direction: column; gap: 0.6cqw; width: 25cqw; font-size: max(13px, 1.9cqw); line-height: 1.5; }
.tf-vt strong { font-family: var(--font-sans); font-weight: 800; font-size: max(16px, 2.7cqw); line-height: 1.3; }
.tf-vn { font-weight: 800; font-size: max(12px, 1.6cqw); letter-spacing: 0.08em; opacity: 0.7; }
.tf-v1 .tf-vt { left: 12%; top: 24%; }
.tf-v2 .tf-vt { right: 12%; top: 24%; text-align: right; align-items: flex-end; }
.tf-v3 .tf-vt { width: 32cqw; left: 50%; transform: translateX(-50%); bottom: 12%; text-align: center; align-items: center; }
.tf-vcenter { position: absolute; left: 50%; top: 44%; transform: translate(-50%, -50%); width: 23cqw; aspect-ratio: 1; border-radius: 50%; background: var(--palette-ink); color: var(--palette-card); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 0.6cqw; padding: 3cqw; box-sizing: border-box; box-shadow: 0 0 0 1.2cqw var(--palette-paper), 0 20px 40px -18px rgb(35 35 35 / 0.6); }
.tf-vcenter strong { font-family: var(--font-sans); font-weight: 800; font-size: max(13px, 2.1cqw); line-height: 1.4; }
.tf-vcenter .tf-vn { color: var(--palette-mint); opacity: 1; }
@container (max-width: 560px) {
  .tf-venn { aspect-ratio: auto; display: flex; flex-direction: column; gap: 12px; }
  .tf-vc { position: relative; width: 100%; aspect-ratio: auto; left: auto !important; right: auto !important; top: auto !important; }
  .tf-vbg { border-radius: 14px; opacity: 1; }
  .tf-vcenter strong br { display: none; }
  .tf-vt, .tf-v1 .tf-vt, .tf-v2 .tf-vt, .tf-v3 .tf-vt { position: relative; inset: auto; transform: none; width: auto; padding: 18px 20px; text-align: left; align-items: flex-start; font-size: 15px; gap: 4px; }
  .tf-vt strong, .tf-vcenter strong { font-size: 19px; }
  .tf-vn { font-size: 12px; }
  .tf-vcenter { position: relative; left: auto; top: auto; transform: none; width: 100%; aspect-ratio: auto; border-radius: 14px; align-items: flex-start; text-align: left; padding: 18px 20px; box-shadow: none; }
}
`;

export const pagesChineseCSS: string =
  sharedCSS + aboutCSS + talkCSS + stageCSS + whoCSS + whatCSS + howCSS;
