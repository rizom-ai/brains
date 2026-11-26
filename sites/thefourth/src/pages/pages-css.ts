/**
 * The inner pages, from Sam's site design: a narrower column than the stage,
 * white cards ringed in ink, small-capital labels, pill chips and the dark
 * band for the next step. Off the homepage the header takes its own room.
 */
export const pagesCSS: string = `
.tf-site:not(.tf-site--home) .tf-bar { position: relative; box-sizing: border-box; width: 100%; max-width: calc(var(--layout-max-width) + 2 * var(--layout-gutter)); }
.tf-pwrap { box-sizing: border-box; max-width: 1280px; margin: 0 auto; padding-left: clamp(24px, 7vw, 112px); padding-right: clamp(24px, 7vw, 112px); }
.tf-pdot { flex: none; width: 11px; height: 11px; border-radius: 50%; }
.tf-pdot--red { background: var(--palette-red); }
.tf-pdot--mint { background: var(--palette-mint); }
.tf-pdot--mustard { background: var(--palette-mustard); }
.tf-pdot--ink { background: var(--palette-ink); }
.tf-plabel { margin: 0; font-weight: 700; font-size: 13px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--palette-ink); }
.tf-plabel--muted { color: #4f4b45; }
.tf-stack { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.tf-stack--loose { gap: 18px; }
.tf-stack--start { align-items: flex-start; gap: 18px; }
.tf-split { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 20px 56px; align-items: start; }
.tf-body { margin: 0; max-width: 640px; font-size: 19px; line-height: 1.65; }
.tf-body--large { font-size: 20px; }
.tf-h2 { margin: 0; max-width: 20ch; font-weight: 800; font-size: clamp(34px, 4.2vw, 64px); line-height: 1.05; letter-spacing: -0.03em; }
.tf-h2--small { font-size: clamp(32px, 3.6vw, 56px); }
.tf-pcard { box-sizing: border-box; min-width: 0; display: flex; flex-direction: column; gap: 16px; padding: clamp(24px, 3vw, 36px); background: var(--palette-card); border-radius: 6px; box-shadow: 0 0 0 1px rgb(35 35 35 / 0.13); }
.tf-tiles { display: flex; flex-wrap: wrap; gap: 8px 10px; }
.tf-site .tf-tile { display: inline-flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 18px; border: 1px solid rgb(35 35 35 / 0.14); border-radius: var(--radius-pill); background: rgb(255 255 255 / 0.7); color: var(--palette-ink); font-weight: 600; font-size: 15px; text-decoration: none; transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.25, 1.2), background-color 0.2s ease; }
.tf-site .tf-tile:hover { transform: translateY(-3px); background: var(--palette-card); color: var(--palette-ink); }
.tf-tile .tf-pdot { width: 9px; height: 9px; }

.tf-intro__inner { padding-top: clamp(48px, 7vw, 104px); padding-bottom: clamp(48px, 6vw, 88px); display: flex; flex-direction: column; gap: 28px; }
.tf-intro__inner .tf-tiles { margin-top: 12px; }
.tf-intro__eyebrow { margin: 0; display: flex; align-items: center; gap: 12px; font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: 22px; letter-spacing: -0.01em; }
.tf-intro__headline { margin: 0; max-width: 18ch; font-weight: 800; font-size: clamp(38px, 5vw, 76px); line-height: 1.02; letter-spacing: -0.035em; overflow-wrap: break-word; }
.tf-intro__lede { margin: 0; max-width: 640px; font-size: clamp(18px, 1.5vw, 21px); line-height: 1.55; }

.tf-band { border-top: 1px solid rgb(35 35 35 / 0.16); }
.tf-band__inner { padding-top: clamp(64px, 8vw, 112px); padding-bottom: clamp(64px, 8vw, 112px); display: flex; flex-direction: column; gap: clamp(32px, 4vw, 56px); }
.tf-band__inner.tf-split { display: grid; gap: 32px 72px; }

.tf-next { background: var(--palette-ink); color: var(--palette-card); }
.tf-next__inner { padding-top: clamp(72px, 9vw, 112px); padding-bottom: clamp(72px, 9vw, 112px); display: flex; flex-direction: column; align-items: center; gap: 22px; text-align: center; }
.tf-next__eyebrow { margin: 0; font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: 22px; }
.tf-next__headline { margin: 0; max-width: 18ch; font-weight: 800; font-size: clamp(36px, 4.6vw, 68px); line-height: 0.98; letter-spacing: -0.045em; }
.tf-next__text { margin: 0; max-width: 520px; font-size: 19px; line-height: 1.55; color: #e7e2d9; }
.tf-next .tf-btn { margin-top: 6px; }

.tf-stats { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 20px 32px; }
.tf-stat { display: flex; flex-direction: column; gap: 2px; min-width: 120px; }
.tf-stat__value { font-weight: 800; font-size: clamp(30px, 3vw, 42px); line-height: 1; letter-spacing: -0.04em; }
.tf-stat__label { max-width: 22ch; font-size: 14px; line-height: 1.4; color: #4f4b45; }
.tf-cases { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 28px; }
.tf-case__context { font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: 17px; line-height: 1.35; color: #4f4b45; }
.tf-case__story { margin: 0; font-size: 17px; line-height: 1.6; }
.tf-case__quote { margin: 0; display: flex; flex-direction: column; gap: 8px; padding-top: 18px; border-top: 1px solid rgb(35 35 35 / 0.14); }
.tf-case__quote blockquote { margin: 0; font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: 19px; line-height: 1.35; letter-spacing: -0.01em; }
.tf-case__quote figcaption { font-size: 14px; font-weight: 600; color: #4f4b45; }

.tf-world__head { display: flex; flex-direction: column; gap: 18px; }
.tf-world__label { display: inline-flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; }
.tf-world__label .tf-pdot { width: 12px; height: 12px; }
.tf-world__hear { display: flex; flex-direction: column; gap: 14px; }
.tf-hear { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 18px; }
.tf-hear li { padding: 20px 22px; background: var(--palette-card); border-radius: 4px; box-shadow: 0 0 0 1px rgb(35 35 35 / 0.13); font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: 20px; line-height: 1.35; letter-spacing: -0.01em; }
.tf-translation { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 18px; }
.tf-translation > div { display: flex; flex-direction: column; gap: 10px; padding: 24px; border-radius: 6px; box-shadow: 0 0 0 1px rgb(35 35 35 / 0.13); }
.tf-translation p { margin: 0; }
.tf-translation__before { background: var(--palette-card); }
.tf-translation__before .tf-plabel { color: #4f4b45; }
.tf-translation__before p { font-size: 24px; line-height: 1.3; color: #4f4b45; text-decoration: line-through; text-decoration-color: var(--palette-red-dark); text-decoration-thickness: 2px; }
.tf-translation__after { background: var(--palette-red); }
.tf-translation__after p { font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: 26px; line-height: 1.25; letter-spacing: -0.015em; }

.tf-paths .tf-pwrap { padding-top: clamp(16px, 2vw, 32px); padding-bottom: clamp(48px, 6vw, 88px); }
.tf-paths__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 24px; }
.tf-bar-mark { width: 40px; height: 6px; border-radius: 3px; }
.tf-bar-mark--red { background: var(--palette-red); }
.tf-bar-mark--mint { background: var(--palette-mint); }
.tf-bar-mark--mustard { background: var(--palette-mustard); }
.tf-bar-mark--ink { background: var(--palette-ink); }
.tf-path__title { margin: 0; font-weight: 800; font-size: 28px; line-height: 1.05; letter-spacing: -0.035em; }
.tf-path .tf-body { font-size: 18px; }
.tf-path__action { margin-top: auto; padding-top: 8px; }
.tf-steps { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 24px; }
.tf-steps li { display: flex; flex-direction: column; gap: 14px; padding: 24px; border-top: 3px solid var(--palette-ink); font-size: 19px; line-height: 1.5; }
.tf-steps__number { font-weight: 800; font-size: 56px; line-height: 0.9; letter-spacing: -0.05em; }
.tf-test { background: var(--palette-mustard); }
.tf-test__inner { padding-top: clamp(56px, 7vw, 96px); padding-bottom: clamp(56px, 7vw, 96px); display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 24px 64px; align-items: end; }
.tf-test__headline { margin: 0; font-weight: 800; font-size: clamp(36px, 4.6vw, 72px); line-height: 0.95; letter-spacing: -0.05em; }
.tf-contact { margin: 0; display: flex; flex-direction: column; }
.tf-contact__row { display: grid; grid-template-columns: minmax(96px, 0.4fr) 1fr; gap: 16px; align-items: baseline; padding: 16px 0; border-top: 1px solid rgb(35 35 35 / 0.16); }
.tf-contact__row dd { margin: 0; min-width: 0; font-size: 19px; line-height: 1.5; overflow-wrap: anywhere; }
.tf-contact__row .tf-link { font-size: 19px; }
.tf-em { font-family: var(--font-story); font-style: italic; font-weight: 500; }
.tf-stack--tight { gap: 6px; }
.tf-stack--snug { gap: 12px; }
.tf-body--card { font-size: 18px; }
.tf-body--lead { max-width: 560px; font-size: 21px; }

.tf-index .tf-pwrap { padding-bottom: clamp(48px, 6vw, 88px); }
.tf-index__nav { display: flex; flex-direction: column; gap: 22px; max-width: 900px; }
.tf-index__row { display: flex; flex-direction: column; gap: 10px; }
.tf-site .tf-index__step { align-self: flex-start; display: inline-flex; align-items: center; gap: 10px; min-height: 36px; color: var(--palette-ink); text-decoration: none; }
.tf-index__step .tf-pdot { width: 10px; height: 10px; }
.tf-index__word { font-weight: 800; font-size: 24px; letter-spacing: -0.02em; }
.tf-index__name { font-family: var(--font-story); font-style: italic; font-size: 20px; color: #4f4b45; }
/* Sam's three columns clip the longer titles on a phone, where the tiles
   go two to a row instead. */
.tf-index__tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
@media (max-width: 640px) { .tf-index__tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.tf-site .tf-index__tile { min-width: 0; display: flex; flex-direction: column; gap: 4px; padding: 14px 16px 16px; border: 1px solid rgb(35 35 35 / 0.13); border-radius: 6px; background: var(--palette-card); color: var(--palette-ink); text-decoration: none; transition: transform 0.25s cubic-bezier(0.2, 0.9, 0.25, 1.2); }
.tf-site .tf-index__tile:hover { transform: translateY(-3px); color: var(--palette-ink); }
.tf-index__n { font-size: 14px; font-weight: 700; color: #4f4b45; }
.tf-index__title { font-weight: 800; font-size: clamp(17px, 2.1vw, 26px); line-height: 1.12; letter-spacing: -0.025em; }

.tf-step--tell { background: var(--palette-card); }
.tf-step__inner { padding-top: clamp(72px, 9vw, 120px); padding-bottom: clamp(72px, 9vw, 120px); display: flex; flex-direction: column; gap: clamp(40px, 5vw, 64px); }
.tf-step__head { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 24px 64px; align-items: end; }
.tf-step__name { display: inline-flex; align-items: center; gap: 12px; font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: 22px; }
.tf-step__badge { display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; border-radius: 50%; color: var(--palette-ink); }
.tf-step__badge svg { width: 34px; height: 34px; }
.tf-step__badge--red { background: var(--palette-red); }
.tf-step__badge--mint { background: var(--palette-mint); }
.tf-step__badge--mustard { background: var(--palette-mustard); }
.tf-step__badge--ink { background: var(--palette-ink); color: var(--palette-card); }
.tf-step__word { margin: 0; font-weight: 800; font-size: clamp(72px, 10vw, 160px); line-height: 0.82; letter-spacing: -0.06em; }
.tf-service { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 32px 64px; align-items: start; padding-top: clamp(36px, 4vw, 56px); border-top: 1px solid rgb(35 35 35 / 0.16); scroll-margin-top: 24px; }
.tf-service__words { min-width: 0; display: flex; flex-direction: column; gap: 22px; }
.tf-service__title { margin: 0; font-weight: 800; font-size: clamp(30px, 3vw, 44px); line-height: 1; letter-spacing: -0.04em; }
.tf-service__tagline { margin: 0; font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: clamp(22px, 2vw, 28px); line-height: 1.25; }
.tf-service__does { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; max-width: 600px; font-size: 19px; line-height: 1.6; }
.tf-service__gets { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 8px; }
.tf-service__gets li { display: inline-flex; align-items: center; min-height: 34px; padding: 0 14px; border: 1.5px solid var(--palette-ink); border-radius: var(--radius-pill); font-size: 15px; font-weight: 600; }
.tf-seen { align-self: start; }
.tf-seen__title { margin: 0; font-weight: 800; font-size: 22px; line-height: 1.15; letter-spacing: -0.02em; }
.tf-seen .tf-link { align-self: flex-start; }

.tf-loop { background: var(--palette-mint); }
.tf-loop__inner { padding-top: clamp(64px, 8vw, 100px); padding-bottom: clamp(64px, 8vw, 100px); display: flex; flex-direction: column; align-items: center; gap: 24px; text-align: center; }
.tf-loop__stations { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px; }
.tf-loop__stations li { display: inline-flex; align-items: center; gap: 10px; }
.tf-loop__station { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 18px; border-radius: var(--radius-pill); background: var(--palette-card); font-weight: 800; font-size: 18px; }
.tf-loop__station .tf-pdot { width: 10px; height: 10px; }
.tf-loop__arrow { font-weight: 700; font-size: 22px; }
.tf-loop .tf-body { max-width: 600px; }
.tf-note { padding-top: 40px; padding-bottom: 40px; display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 40px; font-size: 17px; color: #4f4b45; text-align: center; }
.tf-note strong { color: var(--palette-ink); }

.tf-plabel--pale { color: #cfc9be; }
.tf-plabel--light { color: var(--palette-card); }
.tf-bar-mark--wide { width: 48px; }
.tf-site .tf-link--start { align-self: flex-start; font-size: 17px; }
.tf-site .tf-pill { align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 12px; border: 1.5px solid var(--palette-ink); border-radius: var(--radius-pill); color: var(--palette-ink); font-size: 14px; font-weight: 700; text-decoration: none; }
.tf-pill .tf-pdot { width: 8px; height: 8px; }
.tf-site .tf-rule-link { display: flex; flex-direction: column; gap: 8px; max-width: 360px; color: var(--palette-ink); font-weight: 700; font-size: 17px; text-decoration: none; }
.tf-rule-link__rule { display: block; width: 100%; height: 6px; border-radius: 3px; }

.tf-howcase { background: var(--palette-ink); color: var(--palette-card); }
.tf-howcase__inner { padding-top: clamp(64px, 8vw, 104px); padding-bottom: clamp(64px, 8vw, 104px); display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 360px), 1fr)); gap: 32px 72px; align-items: center; }
.tf-howcase__stat { font-weight: 800; font-size: clamp(96px, 13vw, 200px); line-height: 0.85; letter-spacing: -0.06em; color: var(--palette-mint); }
.tf-howcase__label { font-size: 20px; font-weight: 600; }
.tf-howcase__text { margin: 0; max-width: 560px; font-size: 19px; line-height: 1.6; color: #e7e2d9; }
.tf-howcase__question { margin: 0; font-weight: 800; font-size: clamp(30px, 3.2vw, 46px); line-height: 1.05; letter-spacing: -0.03em; }
.tf-site .tf-howcase .tf-link { align-self: flex-start; font-size: 18px; color: var(--palette-card); }

.tf-story-band { gap: 48px; padding-top: clamp(64px, 8vw, 104px); padding-bottom: clamp(64px, 8vw, 104px); }
.tf-moves { margin: 0; padding: 0; list-style: none; max-width: 820px; }
.tf-move { position: relative; display: grid; grid-template-columns: 52px minmax(0, 1fr); gap: 20px; padding-bottom: 44px; }
.tf-move:last-child { padding-bottom: 0; }
.tf-move:not(:last-child)::before { content: ""; position: absolute; left: 25px; top: 52px; bottom: 0; width: 2px; background: rgb(35 35 35 / 0.25); }
.tf-move__number { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; border-radius: 50%; color: var(--palette-ink); font-weight: 800; font-size: 20px; }
.tf-move__words { min-width: 0; display: flex; flex-direction: column; gap: 10px; padding-top: 8px; }
.tf-move__title { margin: 0; font-weight: 800; font-size: clamp(24px, 2.4vw, 32px); line-height: 1.12; letter-spacing: -0.03em; }
.tf-story-band__quote { max-width: 720px; }
.tf-story-band__quote blockquote { font-size: 22px; }
.tf-aha { gap: 8px; max-width: 760px; padding: 28px 32px; border-radius: 8px; }
.tf-aha__title { font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: clamp(26px, 2.6vw, 36px); line-height: 1.15; }

.tf-pattern { background: var(--palette-card); border-top: 1px solid rgb(35 35 35 / 0.12); border-bottom: 1px solid rgb(35 35 35 / 0.12); }
.tf-pattern__inner { padding-top: clamp(56px, 7vw, 96px); padding-bottom: clamp(56px, 7vw, 96px); display: flex; flex-direction: column; gap: 44px; }
.tf-pattern__headline { margin: 0; max-width: 30ch; font-weight: 800; font-size: clamp(28px, 3vw, 44px); line-height: 1.05; letter-spacing: -0.03em; }
.tf-pattern__figure { margin: 0; }
.tf-howgrid { display: grid; grid-template-columns: minmax(0, 1fr) 36px minmax(0, 1.7fr); gap: 40px 24px; align-items: start; }
.tf-into { align-self: center; font-size: 30px; font-weight: 700; }
.tf-shape { margin: 0; padding: 8px 0 0; list-style: none; }
.tf-shape__step { position: relative; display: grid; grid-template-columns: 40px 1fr; gap: 16px; padding-bottom: 34px; }
.tf-shape__step:last-child { padding-bottom: 0; }
.tf-shape__step:not(:last-child)::before { content: ""; position: absolute; left: 19px; top: 40px; bottom: 0; width: 2px; background: rgb(35 35 35 / 0.25); }
.tf-shape__number { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: var(--palette-ink); color: var(--palette-card); font-weight: 800; font-size: 17px; }
.tf-shape__number--mint { background: var(--palette-mint); color: var(--palette-ink); }
.tf-shape__words { display: flex; flex-direction: column; gap: 4px; padding-top: 6px; }
.tf-shape__title { font-weight: 800; font-size: 22px; line-height: 1.15; letter-spacing: -0.02em; }
.tf-shape__text { font-size: 18px; line-height: 1.5; color: #4f4b45; }
.tf-shape__reach { display: grid; grid-template-columns: 40px 1fr; gap: 16px; align-items: start; }
.tf-shape__big { font-weight: 800; font-size: clamp(28px, 3vw, 42px); line-height: 1.02; letter-spacing: -0.035em; }
.tf-rings { position: relative; width: 100%; aspect-ratio: 5 / 4; overflow: hidden; border-radius: 8px; background: var(--palette-paper); }
.tf-ring { position: absolute; left: 12%; top: 50%; aspect-ratio: 1; border-radius: 50%; transform: translate(-50%, -50%); border: 1.5px solid rgb(35 35 35 / 0.22); }
.tf-ring--3 { width: 184%; background: rgb(97 242 173 / 0.16); z-index: 1; }
.tf-ring--2 { width: 112%; background: rgb(97 242 173 / 0.3); z-index: 2; }
.tf-ring--1 { width: 60%; background: rgb(97 242 173 / 0.55); z-index: 3; }
.tf-ring--pulse { width: 190%; border: 3px solid var(--palette-mint); z-index: 4; pointer-events: none; animation: tf-pulse 4.8s cubic-bezier(0.2, 0.6, 0.3, 1) infinite; }
.tf-ring--later { animation-delay: 2.4s; }
@keyframes tf-pulse { 0% { transform: translate(-50%, -50%) scale(0.12); opacity: 0.9; } 100% { transform: translate(-50%, -50%) scale(1); opacity: 0; } }
.tf-rings__story { position: absolute; left: 12%; top: 50%; z-index: 5; width: 21%; aspect-ratio: 1; border-radius: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; justify-content: center; padding: 4px; box-sizing: border-box; background: var(--palette-ink); color: var(--palette-card); text-align: center; font-family: var(--font-story); font-style: italic; font-size: clamp(14px, 1.6vw, 22px); line-height: 1.1; }
.tf-ringlabel { position: absolute; top: 50%; z-index: 6; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; font-weight: 800; font-size: clamp(14px, 1.45vw, 20px); line-height: 1.15; letter-spacing: -0.015em; }
.tf-ringlabel--creators { left: 32%; width: 17%; }
.tf-ringlabel--audiences { left: 55%; width: 20%; }
.tf-ringlabel--beyond { left: 84%; width: 26%; }
.tf-ringlabel__phones { display: flex; gap: 4px; }
.tf-ringlabel__phones svg { box-sizing: border-box; width: 30px; height: 30px; padding: 6px; border: 1.5px solid var(--palette-ink); border-radius: 50%; background: var(--palette-card); }
.tf-legend { display: none; margin: 0; padding: 0; list-style: none; flex-direction: column; gap: 8px; font-size: 17px; font-weight: 700; }
.tf-legend--audiences { color: #2e7d5b; }
.tf-legend--beyond { color: #4f4b45; }

.tf-method { align-items: start; }
.tf-method__tagline { margin: 0; font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: clamp(24px, 2.2vw, 32px); line-height: 1.2; }
.tf-points { margin: 0; padding: 0; list-style: none; }
.tf-points li { display: grid; grid-template-columns: 44px 1fr; gap: 14px; align-items: start; padding: 20px 0; border-top: 1px solid rgb(35 35 35 / 0.16); font-size: 18px; line-height: 1.55; }
.tf-points__n { padding-top: 4px; font-weight: 800; font-size: 15px; color: #4f4b45; }
.tf-chains { margin: 0; display: flex; flex-direction: column; }
.tf-chain { display: flex; flex-direction: column; gap: 12px; padding: 24px 0; border-top: 1px solid rgb(35 35 35 / 0.16); }
.tf-chain__links { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.tf-chain--usual .tf-chain__links { opacity: 0.75; }
.tf-chain__link { display: inline-flex; align-items: center; min-height: 46px; padding: 0 16px; border: 1px solid rgb(35 35 35 / 0.22); border-radius: 6px; background: var(--palette-card); font-weight: 700; font-size: 16px; }
.tf-chain__link--lead { border-color: var(--palette-ink); background: var(--palette-ink); color: var(--palette-card); }
.tf-chain__arrow { font-size: 20px; font-weight: 700; color: #4f4b45; }
.tf-chain__note { margin: 0; font-size: 16px; color: #4f4b45; }
.tf-match { display: flex; flex-direction: column; gap: 8px; padding: clamp(24px, 3vw, 40px); border-radius: 8px; background: var(--palette-ink); color: var(--palette-card); }
.tf-match__row { display: grid; grid-template-columns: minmax(90px, 0.6fr) 1fr 28px 1fr; gap: 12px; align-items: center; padding: 16px 0; border-top: 1px solid rgb(255 255 255 / 0.18); font-size: 17px; line-height: 1.45; }
.tf-match__row--head { align-items: end; padding: 12px 0 8px; border-top: 0; }
.tf-match__row--head .tf-match__layer { font-size: 13px; font-weight: 400; letter-spacing: 0; text-transform: none; color: #cfc9be; }
.tf-match__layer { font-size: 12px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--palette-mint); }
.tf-match__name { font-weight: 800; font-size: clamp(20px, 2vw, 28px); line-height: 1.1; letter-spacing: -0.03em; }
.tf-match__arrow { text-align: center; font-size: 18px; color: var(--palette-mustard); }
.tf-match__result { margin: 12px 0 0; font-size: 16px; line-height: 1.5; color: #e7e2d9; }
.tf-match__result strong { color: var(--palette-card); }

.tf-benefits { margin: 0; padding: 0; list-style: none; border-bottom: 1px solid rgb(35 35 35 / 0.18); }
.tf-benefit { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); gap: 16px 56px; align-items: start; padding: 32px 0; border-top: 1px solid rgb(35 35 35 / 0.18); }
.tf-benefit__title { margin: 0; font-weight: 800; font-size: clamp(26px, 2.6vw, 34px); line-height: 1.08; letter-spacing: -0.03em; }
.tf-benefit__tagline { margin: 0; font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: clamp(22px, 2vw, 27px); line-height: 1.3; }
.tf-benefit__by { color: #4f4b45; }

@media (max-width: 860px) {
  .tf-howgrid { grid-template-columns: minmax(0, 1fr); }
  .tf-into { display: none; }
  /* Sam's benefit rows span two columns of an auto-fit grid, which on a
     phone adds a column and pushes the proof off the screen. */
  .tf-benefit { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 560px) {
  .tf-ringlabel { display: none; }
  .tf-legend { display: flex; }
  /* The match table's four columns leave the cells a word wide on a phone:
     each layer heads its own row, the two sides of the match below it. */
  .tf-match__row { grid-template-columns: minmax(0, 1fr) 20px minmax(0, 1fr); gap: 8px 10px; font-size: 16px; }
  .tf-match__layer { grid-column: 1 / -1; }
  .tf-match__row--head .tf-match__layer { display: none; }
  .tf-match__name { font-size: 19px; }
}

.tf-grain { background-color: var(--palette-paper); background-image: radial-gradient(rgb(35 35 35 / 0.05) 0.8px, transparent 1px), radial-gradient(rgb(255 255 255 / 0.6) 0.8px, transparent 1px); background-size: 5px 5px, 9px 9px; background-position: 0 0, 2px 3px; }
.tf-wall { position: relative; height: clamp(520px, 78vh, 760px); overflow: hidden; }
.tf-wall__bricks { position: absolute; inset: 0; display: block; }
.tf-wall__chip { position: absolute; z-index: 2; background: #3a3836; animation: tf-chip 1.2s cubic-bezier(0.2, 0.7, 0.4, 1) 0.2s both; }
@keyframes tf-chip { 0% { transform: translate(0, 0) rotate(0); opacity: 1; } 100% { transform: translate(var(--cx), var(--cy)) rotate(var(--cr)); opacity: 0; } }
.tf-wall__break { position: absolute; left: 50%; top: 50%; z-index: 3; box-sizing: border-box; width: min(86%, 980px); height: 78%; translate: -50% -50%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; padding: 8% 10%; background: var(--palette-red); text-align: center; clip-path: polygon(6% 16%, 18% 4%, 30% 11%, 44% 0%, 57% 8%, 71% 2%, 84% 12%, 97% 8%, 94% 30%, 100% 48%, 93% 66%, 99% 86%, 84% 92%, 70% 100%, 54% 91%, 38% 99%, 24% 90%, 8% 96%, 3% 78%, 0% 58%, 6% 40%, 0% 24%); animation: tf-break 1.1s cubic-bezier(0.2, 0.9, 0.25, 1.1) 0.15s both; }
@keyframes tf-break { 0% { transform: scale(0.55) rotate(-2deg); opacity: 0; } 60% { transform: scale(1.04) rotate(0.5deg); opacity: 1; } 100% { transform: scale(1) rotate(0deg); opacity: 1; } }
.tf-wall__headline { margin: 0; font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: clamp(44px, 7.4vw, 120px); line-height: 0.95; letter-spacing: -0.03em; }
.tf-wall__headline span { display: block; }
.tf-wall__text { margin: 0; max-width: 30ch; font-size: clamp(17px, 1.6vw, 22px); line-height: 1.5; font-weight: 600; }

.tf-mission { padding-top: clamp(72px, 9vw, 120px); padding-bottom: clamp(72px, 9vw, 120px); display: flex; flex-direction: column; gap: 48px; }
.tf-mission__statement { margin: 0; max-width: 22ch; font-weight: 800; font-size: clamp(34px, 4.4vw, 64px); line-height: 1.08; letter-spacing: -0.035em; }
.tf-mark-word { padding: 0 0.06em; font-family: var(--font-story); font-style: italic; font-weight: 500; letter-spacing: -0.02em; }
.tf-mark-word--red { background: linear-gradient(transparent 62%, var(--palette-red) 62%, var(--palette-red) 92%, transparent 92%); }
.tf-mark-word--mustard { background: linear-gradient(transparent 62%, var(--palette-mustard) 62%, var(--palette-mustard) 92%, transparent 92%); }
.tf-mark-word--mint { background: linear-gradient(transparent 62%, var(--palette-mint) 62%, var(--palette-mint) 92%, transparent 92%); }
.tf-mission__paragraphs { max-width: 640px; }
.tf-mission__figures { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 380px), 1fr)); gap: 28px; }
.tf-diagram { min-width: 0; margin: 0; display: flex; flex-direction: column; gap: 16px; padding: 24px; border: 1px solid rgb(35 35 35 / 0.12); border-radius: 8px; background: rgb(255 255 255 / 0.6); }
.tf-diagram__label { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
.tf-diagram__label .tf-pdot { width: 10px; height: 10px; }
.tf-diagram__caption { display: flex; flex-direction: column; gap: 6px; font-size: 17px; line-height: 1.55; }
.tf-diagram__caption > span:last-child { max-width: 44ch; }
.tf-diagram__title { font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: clamp(24px, 2.2vw, 30px); line-height: 1.1; }
.tf-acts { box-sizing: border-box; height: 220px; padding-bottom: 8px; display: grid; grid-template-columns: 1fr 1fr 1fr 1.5fr; gap: 8px; align-items: end; }
.tf-acts__act { box-sizing: border-box; height: 64%; display: flex; flex-direction: column; justify-content: space-between; padding: 10px; border: 1px dashed rgb(35 35 35 / 0.3); border-radius: 5px; background: rgb(35 35 35 / 0.05); color: #6b6660; }
.tf-acts__act--fourth { height: 96%; border: 0; background: var(--palette-red); color: var(--palette-ink); box-shadow: 0 16px 24px -14px rgb(35 35 35 / 0.55); }
.tf-acts__numeral { font-family: var(--font-story); font-style: italic; font-weight: 600; font-size: 24px; line-height: 1; }
.tf-acts__act--fourth .tf-acts__numeral { font-size: 44px; }
.tf-acts__name { min-width: 0; font-size: 13px; font-weight: 700; line-height: 1.2; overflow-wrap: break-word; }
.tf-fold { display: block; width: 100%; height: 220px; padding: 0; border: 0; background: transparent; perspective: 1400px; color: var(--palette-ink); font: inherit; }
.tf-fold__paper { position: relative; display: block; width: 100%; height: 100%; }
.tf-fold__half, .tf-fold__flap { position: absolute; top: 0; width: 50%; height: 100%; }
.tf-fold__half--left { left: 0; background: var(--palette-card); box-shadow: inset 0 0 0 1px rgb(35 35 35 / 0.14); border-radius: 6px 0 0 6px; }
.tf-fold__flap { left: 50%; z-index: 2; transform-origin: 0 50%; transform-style: preserve-3d; transition: transform 1.2s cubic-bezier(0.6, 0, 0.2, 1); }
.tf-fold[aria-pressed="true"] .tf-fold__flap { transform: rotateY(-180deg); }
.tf-fold__face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; box-shadow: inset 0 0 0 1px rgb(35 35 35 / 0.14); }
.tf-fold__face--front { background: var(--palette-card); border-radius: 0 6px 6px 0; }
.tf-fold__face--back { background: #f7f2e8; border-radius: 6px 0 0 6px; transform: rotateY(180deg); }
.tf-fold__dot { position: absolute; top: 50%; z-index: 2; width: 48px; height: 48px; transform: translate(-50%, -50%); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-family: var(--font-story); font-style: italic; font-weight: 600; font-size: 22px; }
.tf-fold__dot--a { left: 56%; background: var(--palette-red); }
.tf-fold__dot--b { left: 44%; background: var(--palette-mint); }
.tf-fold__dot--met { left: 56%; background: var(--palette-mint); box-shadow: 0 0 0 6px rgb(97 242 173 / 0.35); font-size: 17px; }
.tf-fold__path { position: absolute; left: 28%; right: -72%; top: 50%; z-index: 1; border-top: 3px dashed rgb(35 35 35 / 0.4); transition: opacity 0.4s ease; }
.tf-fold[aria-pressed="true"] .tf-fold__path { opacity: 0; }
.tf-fold__label { position: absolute; right: 10px; bottom: 10px; z-index: 3; padding: 5px 12px; border-radius: var(--radius-pill); background: var(--palette-ink); color: var(--palette-card); font-size: 13px; font-weight: 700; }
.tf-mission__grown { margin: 0; display: flex; align-items: center; gap: 14px; font-size: 18px; line-height: 1.55; }
.tf-mission__grown .tf-pdot { width: 10px; height: 10px; }

.tf-cast { padding-top: clamp(80px, 10vw, 136px); padding-bottom: clamp(80px, 10vw, 136px); display: flex; flex-direction: column; gap: clamp(48px, 6vw, 80px); }
.tf-cast__head { display: flex; flex-direction: column; align-items: center; gap: 16px; text-align: center; }
.tf-cast__label { padding: 8px 18px; border-top: 2px solid var(--palette-ink); border-bottom: 2px solid var(--palette-ink); font-weight: 800; font-size: 13px; letter-spacing: 0.3em; text-transform: uppercase; }
.tf-cast__headline { margin: 0; max-width: 13ch; font-weight: 800; font-size: clamp(44px, 6vw, 96px); line-height: 0.92; letter-spacing: -0.05em; }
.tf-cast__intro { margin: 0; max-width: 32ch; font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: clamp(21px, 2vw, 28px); line-height: 1.3; }
.tf-cast__guides { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 400px), 1fr)); gap: 72px 88px; align-items: start; }
.tf-guide { min-width: 0; display: flex; flex-direction: column; gap: 26px; }
/* Sam's portrait sits 22px in from its disc at full width, which pushed it
   past a phone's edge; the portrait now keeps inside its column. */
.tf-guide__portrait { position: relative; box-sizing: border-box; width: min(100%, 340px); padding: 22px 0 0 22px; }
.tf-guide__disc { position: absolute; left: 0; top: 0; width: 74%; aspect-ratio: 1; border-radius: 50%; }
.tf-guide__disc--red { background: var(--palette-red); }
.tf-guide__disc--mint { background: var(--palette-mint); }
.tf-guide__frame { position: relative; aspect-ratio: 3 / 4; transform: rotate(-2deg); filter: drop-shadow(0 12px 14px rgb(35 35 35 / 0.28)) drop-shadow(0 2px 2px rgb(35 35 35 / 0.18)); }
.tf-guide__frame--right { transform: rotate(2deg); }
.tf-guide__frame img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 25%; border-radius: 999px 999px 0 0; filter: grayscale(1) contrast(1.08); }
.tf-guide__starring { font-weight: 700; font-size: 13px; letter-spacing: 0.2em; text-transform: uppercase; color: #4f4b45; }
.tf-guide__name { margin: 0; font-weight: 800; font-size: clamp(42px, 4.6vw, 68px); line-height: 0.92; letter-spacing: -0.05em; }
.tf-guide__native { font-family: "Noto Sans TC", var(--font-sans); font-weight: 700; font-size: 0.42em; letter-spacing: 0.04em; vertical-align: middle; }
.tf-guide__role { font-family: var(--font-story); font-style: italic; font-weight: 500; font-size: 21px; line-height: 1.35; }
.tf-stubs { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 10px; }
.tf-stub { display: inline-flex; align-items: center; min-height: 38px; padding: 0 20px; background: var(--palette-card); font-size: 15px; font-weight: 700; letter-spacing: 0.01em; -webkit-mask: radial-gradient(circle 7px at 0 50%, transparent 97%, #000) left / 51% 100% no-repeat, radial-gradient(circle 7px at 100% 50%, transparent 97%, #000) right / 51% 100% no-repeat; mask: radial-gradient(circle 7px at 0 50%, transparent 97%, #000) left / 51% 100% no-repeat, radial-gradient(circle 7px at 100% 50%, transparent 97%, #000) right / 51% 100% no-repeat; }
.tf-tape { position: absolute; top: -12px; left: var(--tape-left, 30%); z-index: 2; width: 92px; height: 26px; transform: translateX(-50%) rotate(var(--tape-turn, -3deg)); background: rgb(236 226 200 / 0.85); box-shadow: 0 1px 2px rgb(35 35 35 / 0.15); }
.tf-note-card { position: relative; box-sizing: border-box; max-width: 460px; margin-top: 10px; padding: 26px 24px 20px; background: var(--palette-card); box-shadow: 0 14px 24px -16px rgb(35 35 35 / 0.5); transform: rotate(-1.2deg); }
.tf-note-card__title { display: block; margin-bottom: 6px; font-family: var(--font-story); font-style: italic; font-size: 19px; }
.tf-note-card p { margin: 0; font-size: 17px; line-height: 1.55; }

.tf-offstage { padding-top: clamp(72px, 9vw, 112px); padding-bottom: clamp(72px, 9vw, 112px); display: flex; flex-direction: column; gap: 56px; }
.tf-offstage__head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 20px 32px; }
.tf-offstage__words { max-width: 620px; }
.tf-offstage__headline { margin: 0; font-weight: 800; font-size: clamp(36px, 4.4vw, 64px); line-height: 0.95; letter-spacing: -0.045em; }
.tf-offstage .tf-btn { margin-bottom: 6px; }
.tf-pins { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: center; row-gap: 8px; padding: 20px 0 10px; }
.tf-pin { position: relative; flex: 0 0 auto; box-sizing: border-box; width: var(--pin-width); margin: var(--pin-margin); padding: 10px 10px 44px; background: var(--palette-card); transform: rotate(var(--pin-turn)); box-shadow: 0 16px 28px -16px rgb(35 35 35 / 0.55), 0 1px 2px rgb(35 35 35 / 0.12); transition: transform 0.35s cubic-bezier(0.2, 0.9, 0.25, 1.2); }
.tf-pin:hover { transform: rotate(0deg) translateY(-6px); }
.tf-pin img { display: block; width: 100%; aspect-ratio: var(--pin-ratio); object-fit: cover; filter: grayscale(1) contrast(1.08); }
.tf-pin figcaption { position: absolute; left: 14px; right: 14px; bottom: 12px; font-family: var(--font-story); font-style: italic; font-size: 16px; transform: rotate(-1deg); }
/* On a phone the overlapping, offset photos ran past the screen's edge;
   they hang two by two instead, still tilted, inside the column. */
@media (max-width: 640px) {
  .tf-pins { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 22px 14px; padding-top: 24px; }
  .tf-pin { width: auto; margin: 0; padding: 6px 6px 10px; }
  .tf-pin figcaption { position: static; margin-top: 8px; font-size: 14px; line-height: 1.15; }
  .tf-tape { width: 64px; height: 20px; }
  .tf-acts { height: 180px; gap: 6px; }
  .tf-acts__act { padding: 8px 6px; }
  .tf-acts__name { font-size: 12px; }
}
`;
