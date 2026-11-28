/**
 * The homepage as Sam drew it in Chinese: no italics or tight tracking (no
 * true CJK italic, and Han characters crowd), smaller display lines at a
 * looser leading, a quicker cover with a second cue over the red, Act II's
 * old copy beside the locked good copy, Act III's claim beside its card, and
 * Act IV's cards titled, with stats and each quote under its client.
 */
export const homeChineseCSS: string = `
.tf-cover__cue2 { display: none; }
@keyframes tf-cuein { 0% { opacity: 0; } 30% { opacity: 1; } 65% { opacity: 1; } 100% { opacity: 0; } }

:lang(zh-TW) .tf-story { font-style: normal; letter-spacing: 0; }
:lang(zh-TW) :is(.tf-crossroads__headline, .tf-epilogue__headline, .tf-card__headline, .tf-cover__audience) em { font-style: normal; letter-spacing: 0; }
:lang(zh-TW) :is(.tf-card__quote-mark, .tf-card__quote) { font-style: normal; letter-spacing: 0; }
:lang(zh-TW) .tf-act-heading .tf-story { font-size: clamp(18px, 1.6vw, 22px); line-height: 1.5; letter-spacing: 0.02em; }

:lang(zh-TW) .tf-cover { height: 200vh; }
:lang(zh-TW) .tf-cover__lead:empty { display: none; }
:lang(zh-TW) .tf-cover__audience em { font-family: var(--font-sans); font-weight: 700; letter-spacing: 0.04em; }
:lang(zh-TW) .tf-cover__cue2 { position: absolute; left: 0; right: 0; bottom: 7%; z-index: 9; margin: 0; flex-direction: column; align-items: center; gap: 6px; color: var(--palette-ink); font-weight: 700; font-size: 16px; pointer-events: none; opacity: 0; }
:lang(zh-TW) .tf-cover__cue2 .tf-bob { display: inline-flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; border: 2px solid var(--palette-ink); font-size: 20px; }
@supports (animation-timeline: view()) {
  :lang(zh-TW) .tf-zoom { animation-range: contain 20% contain 66%; }
  :lang(zh-TW) .tf-key { animation-range: contain 2% contain 20%; }
  :lang(zh-TW) .tf-fadeout { animation-range: contain 5% contain 22%; }
  :lang(zh-TW) .tf-cover__cue2 { display: flex; animation: tf-cuein linear both; animation-timeline: --cover; animation-range: contain 40% contain 70%; }
}

:lang(zh-TW) .tf-act--one { margin-top: -36vh; background: linear-gradient(rgb(239 89 89 / 0) 0, rgb(239 89 89 / 0) calc(36vh - 2px), var(--palette-red) calc(36vh - 2px)); }
:lang(zh-TW) .tf-act-one { padding-top: clamp(40px, 5vw, 64px); padding-bottom: clamp(64px, 7vw, 100px); }
:lang(zh-TW) .tf-act--one .tf-display { font-size: clamp(40px, 6vw, 96px); line-height: 1.2; letter-spacing: 0; }
:lang(zh-TW) .tf-key-tag__line { font-size: 16px; line-height: 1.5; }
:lang(zh-TW) .tf-key-tag__text { margin: 8px 0 0; font-weight: 800; font-size: clamp(20px, 1.9vw, 26px); line-height: 1.4; }

:lang(zh-TW) .tf-act-two__top { padding-top: clamp(56px, 6vw, 72px); padding-bottom: 24px; }
:lang(zh-TW) .tf-act--two .tf-act-heading .tf-story { font-size: clamp(28px, 3.4vw, 54px); line-height: 1.06; letter-spacing: 0; }
:lang(zh-TW) .tf-spell { min-height: clamp(460px, 44vw, 560px); }
:lang(zh-TW) .tf-spell__stage { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(0, 1fr); gap: 28px; align-items: stretch; align-content: center; padding-top: 12px; padding-bottom: 56px; }
:lang(zh-TW) .tf-spell__old { background: var(--palette-card); border-radius: 10px; padding: clamp(24px, 3vw, 40px); display: flex; flex-direction: column; justify-content: center; gap: 22px; box-shadow: var(--shadow-paper); }
:lang(zh-TW) .tf-spell__meta { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
:lang(zh-TW) .tf-pill { display: inline-flex; align-items: center; min-height: 32px; padding: 0 14px; border-radius: var(--radius-pill); font-weight: 800; font-size: 14px; letter-spacing: 0.08em; }
:lang(zh-TW) .tf-pill--old { background: var(--palette-card); color: var(--tf-zh-strike); border: 2px solid var(--tf-zh-strike); }
:lang(zh-TW) .tf-pill--new { background: var(--palette-ink); color: var(--palette-card); }
:lang(zh-TW) .tf-spell__note { font-weight: 700; font-size: 15px; color: var(--tf-zh-ink-warm); }
:lang(zh-TW) .tf-spell__words { font-size: clamp(26px, 3.2vw, 48px); line-height: 1.12; letter-spacing: 0; max-width: none; }
:lang(zh-TW) .tf-spell__new { border: 2px dashed rgb(35 35 35 / 0.35); border-radius: 10px; background: rgb(255 255 255 / 0.4); padding: clamp(24px, 3vw, 40px); display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 18px; }
:lang(zh-TW) .tf-spell__lock { display: block; width: 46px; height: 69px; background: var(--palette-ink); clip-path: polygon(29.3% 57.9%, 15.9% 50.5%, 7.8% 40.3%, 6.0% 32.6%, 7.3% 24.9%, 11.6% 17.7%, 18.6% 11.5%, 27.7% 6.7%, 38.5% 3.7%, 50.0% 2.7%, 61.5% 3.7%, 72.3% 6.7%, 81.4% 11.5%, 88.4% 17.7%, 92.7% 24.9%, 94.0% 32.6%, 92.2% 40.3%, 84.1% 50.5%, 70.7% 57.9%, 92.0% 98.7%, 8.0% 98.7%); }
:lang(zh-TW) .tf-spell__prompt { margin: 0; font-weight: 700; font-size: clamp(18px, 1.6vw, 22px); line-height: 1.5; white-space: pre-line; }
:lang(zh-TW) .tf-spell__new .tf-spell__actions { display: contents; }
:lang(zh-TW) .tf-btn--unlock { min-height: 64px; padding: 0 32px; font-weight: 800; font-size: 19px; box-shadow: 0 0 0 4px var(--palette-mustard), 0 18px 28px -12px rgb(35 35 35 / 0.45); }
:lang(zh-TW) .tf-spell__hint { font-size: 15px; color: var(--tf-zh-ink-warm); }
:lang(zh-TW) .tf-spell__lead { display: flex; flex-direction: column; gap: 12px; }
:lang(zh-TW) .tf-spell__was { font-size: 16px; line-height: 1.5; color: rgb(35 35 35 / 0.7); }
:lang(zh-TW) .tf-spell__was strong { color: var(--palette-ink); }
:lang(zh-TW) .tf-spell__struck { text-decoration: line-through; text-decoration-color: var(--tf-zh-strike); text-decoration-thickness: 2px; }
:lang(zh-TW) .tf-spell__lead-text { font-weight: 700; font-size: 17px; }
:lang(zh-TW) .tf-spell__main { line-height: 1.12; letter-spacing: 0; }
:lang(zh-TW) .tf-spell--after .tf-land:nth-child(1) { animation-delay: 0.6s; }
@media (max-width: 860px) { :lang(zh-TW) .tf-spell__stage { grid-template-columns: 1fr; } }

:lang(zh-TW) .tf-act-three { padding-top: 48px; padding-bottom: clamp(56px, 6vw, 80px); gap: clamp(28px, 3.5vw, 44px); }
:lang(zh-TW) .tf-act-three__lead { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr); gap: 28px 64px; align-items: end; }
:lang(zh-TW) .tf-act-three__claim { display: flex; flex-direction: column; gap: 24px; }
:lang(zh-TW) .tf-act-three__headline { margin: 0; font-weight: 800; font-size: clamp(34px, 4.2vw, 64px); line-height: 1.25; max-width: 13em; }
:lang(zh-TW) .tf-act-three__card { background: var(--palette-card); border-radius: 10px; padding: clamp(22px, 2.6vw, 32px); display: flex; flex-direction: column; gap: 14px; box-shadow: var(--shadow-paper); }
:lang(zh-TW) .tf-act-three__note { margin: 0; font-size: 18px; line-height: 1.6; }
:lang(zh-TW) .tf-act-three__prompt { font-weight: 800; font-size: 20px; padding-top: 6px; border-top: 1px solid rgb(35 35 35 / 0.15); }
:lang(zh-TW) .tf-guide-spell__word { line-height: 1.12; letter-spacing: 0; }
:lang(zh-TW) .tf-guide-spell__gloss { font-size: 0.3em; font-weight: 700; letter-spacing: 0; vertical-align: middle; }
@media (max-width: 860px) { :lang(zh-TW) .tf-act-three__lead { grid-template-columns: 1fr; } }

:lang(zh-TW) .tf-act-four { padding-top: 32px; padding-bottom: clamp(72px, 8vw, 110px); }
:lang(zh-TW) .tf-act--four .tf-act-heading .tf-story { font-family: var(--font-sans); font-weight: 800; font-size: clamp(34px, 4.4vw, 68px); line-height: 1.25; letter-spacing: 0; }
:lang(zh-TW) .tf-cards__column { grid-row: 2; display: flex; flex-direction: column; gap: 28px; min-width: 0; }
:lang(zh-TW) .tf-cards__column--left { grid-column: 1 / 6; margin-top: 10px; }
:lang(zh-TW) .tf-cards__column--right { grid-column: 6 / 13; margin-top: 60px; }
:lang(zh-TW) .tf-cards__column > .tf-card { grid-column: auto; grid-row: auto; margin-top: 0; }
:lang(zh-TW) .tf-card > .tf-eyebrow:not(.tf-card__by) { margin-bottom: 10px; font-size: 13px; letter-spacing: 0.06em; text-transform: none; }
:lang(zh-TW) .tf-card--ink > .tf-eyebrow { color: var(--tf-zh-paper-dim); }
:lang(zh-TW) .tf-card__title { display: block; margin-bottom: 14px; font-weight: 800; font-size: clamp(20px, 1.8vw, 26px); line-height: 1.35; }
:lang(zh-TW) :is(.tf-card--feature, .tf-card--story) .tf-card__title { font-size: clamp(22px, 2.2vw, 32px); }
:lang(zh-TW) .tf-card__figure { line-height: 1.05; letter-spacing: 0; }
:lang(zh-TW) .tf-card__figure--large { font-size: clamp(64px, 9vw, 144px); }
:lang(zh-TW) .tf-card--story .tf-card__figure { font-size: clamp(64px, 8vw, 128px); }
:lang(zh-TW) .tf-card__text { margin-top: 10px; line-height: 1.5; max-width: none; }
:lang(zh-TW) :is(.tf-card--feature, .tf-card--story) .tf-card__text { font-size: clamp(18px, 1.6vw, 22px); }
:lang(zh-TW) .tf-card__stats { display: flex; flex-wrap: wrap; gap: 12px 28px; margin-top: 18px; padding-top: 16px; border-top: 1px solid rgb(35 35 35 / 0.25); }
:lang(zh-TW) .tf-card--ink .tf-card__stats { border-top-color: rgb(255 255 255 / 0.2); }
:lang(zh-TW) .tf-card__stat { display: flex; flex-direction: column; gap: 2px; font-size: 14px; }
:lang(zh-TW) .tf-card__stat strong { font-weight: 800; font-size: 26px; line-height: 1.1; }
:lang(zh-TW) .tf-cards__column > .tf-card--quote-left { align-self: flex-start; width: min(100%, 360px); margin: 0 0 0 28px; transform: rotate(-2.6deg); }
:lang(zh-TW) .tf-cards__column > .tf-card--quote-right { align-self: flex-end; width: min(100%, 380px); margin: 0 24px 0 0; transform: rotate(3.4deg); }
@media (max-width: 860px) {
  :lang(zh-TW) .tf-cards__column { grid-column: auto; grid-row: auto; margin-top: 0; }
  :lang(zh-TW) .tf-cards__column > .tf-card--quote-left, :lang(zh-TW) .tf-cards__column > .tf-card--quote-right { align-self: stretch; width: auto; margin: 0; transform: none; }
}

:lang(zh-TW) .tf-crossroads { padding-top: clamp(64px, 7vw, 84px); padding-bottom: clamp(64px, 7vw, 96px); }
:lang(zh-TW) .tf-crossroads__headline { font-size: clamp(44px, 6.4vw, 104px); line-height: 1.2; letter-spacing: 0; }
:lang(zh-TW) .tf-epilogue { padding-top: clamp(64px, 7vw, 84px); padding-bottom: clamp(72px, 8vw, 100px); }
:lang(zh-TW) .tf-epilogue__headline { font-size: clamp(40px, 6vw, 96px); line-height: 1.2; letter-spacing: 0; }
`;
