/** Base Studio styles; responsive and visual layers remain authored as CSS. */
export const styles = `
  .studio { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .boot-status { padding: 48px; }
  .spacer { flex: 1; }

  /* ── frame ── */
  .studio-body { flex: 1; min-height: 0; display: grid; align-items: stretch; }

  /* ── rail ── */

  /* ── listing ── */
  .listing { padding: 26px 30px 34px; }
  .listing-empty { padding: 22px 4px; }
  .row { display: grid; grid-template-columns: 44px 1fr 150px; gap: 18px; align-items: baseline; width: 100%; padding: 15px 4px 14px; border: 0; border-bottom: 1px solid var(--console-rule-strong); background: none; text-align: left; cursor: pointer; transition: background .12s ease; font-family: var(--console-ui); }
  .row:hover { background: var(--console-rule); }
  .row .idx { font-family: var(--console-mono); font-size: 11px; color: var(--console-text-muted); }
  .row .title { font-family: var(--console-display); font-variation-settings: "SOFT" 50, "opsz" 30; font-weight: 520; font-size: 17.5px; letter-spacing: -0.005em; color: var(--console-text); }
  .row:hover .title { color: var(--console-accent-dim); }
  .row .title small { display: block; font-family: var(--console-mono); font-size: 11px; font-weight: 400; color: var(--console-text-muted); margin-top: 3px; letter-spacing: 0; }
  .row .updated { font-size: 12.5px; color: var(--console-text-dim); }

  /* ── editor ── */
  .editor { display: grid; grid-template-columns: 330px 1fr; grid-template-rows: 1fr auto; min-height: 0; }
  .colophon { border-right: 1px solid var(--console-rule-strong); background: var(--console-card-soft); padding: 26px 26px 60px; }
  .capability-fields { border: 0; margin: 0; padding: 0; min-inline-size: 0; }
  .form-title { font-family: var(--console-mono); font-size: 10px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--console-text-muted); display: flex; justify-content: space-between; padding-bottom: 18px; }
  .form-title span:last-child { color: var(--console-accent); }
  .backlink { display: block; width: 100%; border: 0; background: none; text-align: left; font-family: var(--console-mono); font-size: 11.5px; color: var(--console-text-dim); padding: 0 0 14px; cursor: pointer; }
  .backlink:hover { color: var(--console-accent-dim); }

  /* ── fields ── */
  .field { display: block; padding: 14px 0 16px; border-top: 1px solid var(--console-rule-strong); }
  .field-label { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; font-weight: 500; letter-spacing: 0.02em; color: var(--console-text-dim); margin-bottom: 7px; }
  .field-label .req, .field-label em.req { font-family: var(--console-mono); font-style: normal; font-size: 10px; color: var(--console-accent); }
  .field-label .kind, .field-label em.kind { font-family: var(--console-mono); font-style: normal; font-size: 10px; color: var(--console-text-muted); font-weight: 400; }
  .field textarea[disabled] { font-family: var(--console-mono); }
  .field-inline { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .field-inline .field-label { margin-bottom: 0; }
  .field-image .image-ref { display: flex; align-items: center; gap: 8px; margin: 0 0 8px; }
  .field-image .image-ref code { font-family: var(--console-mono); font-size: 11px; background: var(--console-card); border: 1px solid var(--console-rule-strong); padding: 3px 8px; border-radius: 4px; overflow-wrap: anywhere; }
  .field-image .image-ref button { font-family: var(--console-ui); font-size: 12px; border: 1px solid var(--console-rule-strong); background: none; color: var(--console-text-dim); border-radius: 5px; padding: 3px 9px; cursor: pointer; }
  .field-image .image-ref button:hover { color: var(--console-accent-dim); border-color: color-mix(in srgb, var(--console-accent) 40%, transparent); }
  .field-image input[type="file"] { width: 100%; font-family: var(--console-mono); font-size: 11px; color: var(--console-text-muted); border: 1px dashed var(--console-rule-strong); border-radius: 8px; background: var(--console-card); padding: 12px 11px; }
  .field-with-assist .field { padding-bottom: 9px; }
  .field-assist-controls { display: flex; align-items: center; gap: 8px; padding: 0 0 12px; }
  .field-assist-suggestion { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 12px; padding: 9px; border: 1px solid var(--console-rule-accent); border-radius: 7px; background: var(--console-accent-soft); }
  .field-assist-copy { flex: 1 0 100%; font-size: 12px; line-height: 1.45; color: var(--console-text); }
  .field-assist-tags { display: flex; flex: 1 0 100%; flex-wrap: wrap; gap: 5px; }
  .field-assist-tags code { font-family: var(--console-mono); font-size: 10px; padding: 3px 6px; border-radius: 4px; background: var(--console-card); color: var(--console-text); }

  /* ── manuscript / body editor ── */
  .manuscript { display: flex; flex-direction: column; min-width: 0; }
  .manuscript-empty { padding: 30px 34px; }
  .body-editor { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  .body-toolbar { display: flex; align-items: center; gap: 4px; padding: 12px 26px; border-bottom: 1px solid var(--console-rule-strong); }
  .doc-meta { margin-left: auto; font-family: var(--console-mono); font-size: 11px; color: var(--console-text-muted); }
  .assist-bar { display: flex; align-items: center; gap: 10px; padding: 10px 26px; border-bottom: 1px solid var(--console-rule-strong); background: var(--console-rule); }
  .assist-bar input { flex: 1; min-width: 180px; }
  .assist-bar select { max-width: 220px; }
  .assist-run { padding: 8px 14px; white-space: nowrap; }
  .assist-run[disabled] { opacity: .5; cursor: not-allowed; transform: none; box-shadow: none; }
  .assist-presets { display: inline-flex; gap: 4px; }
  .assist-meta { font-family: var(--console-mono); font-size: 11px; color: var(--console-text-muted); white-space: nowrap; }
  .assist-suggestion, .assist-agent-answer { display: flex; align-items: center; gap: 12px; padding: 12px 26px; border-bottom: 1px solid var(--console-rule-strong); }
  .assist-suggestion { background: var(--console-ok-soft); }
  .assist-agent-answer { background: var(--console-accent-soft); }
  .assist-preview, .assist-answer-copy { max-height: 150px; overflow: auto; font-size: 13px; color: var(--console-text); }
  .assist-answer-copy > strong { display: block; margin-bottom: 6px; font-family: var(--console-mono); font-size: 10px; letter-spacing: .04em; color: var(--console-accent-dim); }
  .assist-preview p, .assist-answer-copy p { margin-bottom: 6px; }
  .assist-status { padding: 8px 26px; border-bottom: 1px solid var(--console-rule-strong); }
  .body-panes { display: grid; flex: 1; min-height: 420px; }
  .body-panes.split { grid-template-columns: 1fr 1fr; }
  .body-source { color: var(--console-text); background: none; border-right: 1px solid var(--console-rule-strong); min-height: 420px; min-width: 0; }
  .body-panes:not(.split) .body-source { border-right: 0; }
  .body-source .cm-editor { height: 100%; min-height: 420px; background: transparent; color: var(--console-text); }
  .body-source .cm-editor.cm-focused { outline: none; }
  .body-source .cm-scroller { font-family: var(--console-mono); font-size: 13px; line-height: 1.75; }
  .body-source .cm-content { padding: 30px 34px; caret-color: var(--console-accent); }
  .body-source .cm-line { padding: 0; }
  .body-source .cm-selectionBackground, .body-source .cm-focused .cm-selectionBackground { background: color-mix(in srgb, var(--console-accent) 22%, transparent); }
  .body-preview { padding: 30px 34px; overflow-wrap: anywhere; }
  .body-preview h1, .body-preview h2, .body-preview h3 { font-family: var(--console-display); font-variation-settings: "SOFT" 70, "opsz" 90; font-weight: 580; letter-spacing: -0.01em; line-height: 1.12; margin: 0 0 18px; }
  .body-preview h1 { font-size: 30px; }
  .body-preview h2 { font-size: 23px; margin-top: 26px; }
  .body-preview h3 { font-size: 18px; margin-top: 22px; }
  .body-preview p { font-size: 15px; line-height: 1.72; color: var(--console-text); margin-bottom: 14px; max-width: 62ch; }
  .body-preview p em { font-family: var(--console-display); font-style: italic; }
  .body-preview blockquote { border-left: 2px solid var(--console-accent); padding: 2px 0 2px 18px; margin: 18px 0; color: var(--console-text-dim); font-family: var(--console-display); font-style: italic; font-size: 16.5px; }
  .body-preview ul, .body-preview ol { padding-left: 22px; margin-bottom: 14px; }
  .body-preview li { font-size: 15px; line-height: 1.72; }
  .body-preview code { font-family: var(--console-mono); font-size: 12.5px; background: color-mix(in srgb, var(--console-text) 6%, transparent); padding: 1px 5px; border-radius: 4px; }
  .body-preview pre { background: var(--console-text); color: var(--console-frame); border-radius: 8px; padding: 14px 16px; margin-bottom: 16px; overflow-x: auto; }
  .body-preview pre code { background: none; color: inherit; }

  /* ── pipeline (action bar) ── */
  .pipeline { grid-column: 1 / -1; display: flex; align-items: center; gap: 16px; border-top: 2px solid var(--console-text); background: var(--console-text); color: var(--console-frame); padding: 0 20px; min-height: 58px; }
  .pipeline [data-slot="button"][data-variant="danger"] { border-color: color-mix(in srgb, var(--console-bg) 30%, transparent); color: color-mix(in srgb, var(--console-bg) 75%, transparent); }
  .pipeline [data-slot="button"][data-variant="danger"]:hover { background: color-mix(in srgb, var(--console-err) 25%, transparent); color: var(--console-frame); }
  .pipeline .status { font-family: var(--console-mono); font-size: 11.5px; }
  .pipeline .status-ok { color: color-mix(in srgb, var(--console-ok) 75%, var(--console-frame)); }
  .pipeline .status-error { color: color-mix(in srgb, var(--console-err) 70%, var(--console-frame)); }

  /* ── instrument strip: entity db → exported to file → committed ── */
  .stations-wrap { display: flex; align-items: center; min-width: 0; }
  .stations { display: flex; align-items: center; margin-left: 14px; }
  .station { display: inline-flex; align-items: center; gap: 9px; font-family: var(--console-mono); font-size: 11px; letter-spacing: 0.06em; color: color-mix(in srgb, var(--console-bg) 45%, transparent); white-space: nowrap; }
  .station .dot { width: 9px; height: 9px; border-radius: 50%; border: 1.5px solid color-mix(in srgb, var(--console-bg) 35%, transparent); transition: all .2s ease; }
  .station.done { color: color-mix(in srgb, var(--console-bg) 95%, transparent); }
  .station.done .dot { background: var(--console-ok); border-color: var(--console-ok); box-shadow: 0 0 10px color-mix(in srgb, var(--console-ok) 70%, transparent); }
  .station.active { color: var(--console-frame); }
  .station.active .dot { border-color: var(--console-warn); background: var(--console-warn); animation: console-pulse 1.2s ease-in-out infinite; }
  .station.no-git { font-style: italic; margin-left: 28px; }
  .track { height: 1px; width: 64px; background: color-mix(in srgb, var(--console-bg) 22%, transparent); margin: 0 14px; position: relative; overflow: hidden; display: inline-block; }
  .track .flow { position: absolute; inset: 0; background: linear-gradient(90deg, transparent, var(--console-ok) 50%, transparent); transform: translateX(-100%); }
  .track.flowing .flow { animation: flow 0.9s ease-in-out infinite; }
  @keyframes flow { to { transform: translateX(100%); } }
  .commit-ref { font-family: var(--console-mono); font-size: 11px; color: color-mix(in srgb, var(--console-bg) 55%, transparent); margin-left: 22px; white-space: nowrap; }
  .commit-ref b { color: var(--console-frame); font-weight: 500; }

  /* ── status ── */
  .status { color: var(--console-text-dim); font-size: 13px; }
  .status-error { color: var(--console-accent-dim); }
  .status-ok { color: var(--console-ok); }
`;
