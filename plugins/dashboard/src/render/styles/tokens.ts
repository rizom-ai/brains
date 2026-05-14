export const DASHBOARD_TOKENS = `
:root {
  /*
   * Dashboard consumes brand/theme tokens when present, but keeps
   * standalone fallbacks so the plugin can render outside the site pipeline.
   * Existing component styles use the shorter legacy aliases below.
   */
  --dashboard-bg:          var(--color-bg, #0a0819);
  --dashboard-card:        var(--color-bg-card, var(--color-bg-subtle, #14112b));
  --dashboard-card-soft:   var(--color-bg-subtle, #1b1638);
  --dashboard-bg-deep:     var(--color-bg-deep, var(--color-bg-dark, #05040f));
  --dashboard-text:        var(--color-text, #f1eadd);
  --dashboard-text-dim:    var(--color-text-muted, #bfb7a6);
  --dashboard-text-muted:  var(--color-text-light, #7a7263);
  --dashboard-text-faint:  var(--color-border, #4a4459);
  --dashboard-accent:      var(--color-accent, #ff8b3d);
  --dashboard-success:     var(--color-success, #68cc8b);
  --dashboard-warning:     var(--color-warning-text-emphasis, #f5c158);
  --dashboard-error:       var(--color-error, #e26d6d);
  --dashboard-neutral:     var(--dashboard-text-muted);
  --dashboard-font-display: var(--font-display, "Fraunces", "Times New Roman", serif);
  --dashboard-font-body:    var(--font-body, "IBM Plex Sans", -apple-system, system-ui, sans-serif);
  --dashboard-font-mono:    var(--font-label, "JetBrains Mono", ui-monospace, monospace);

  --ink:          var(--dashboard-bg);
  --ink-raised:   var(--dashboard-card);
  --ink-soft:     var(--dashboard-card-soft);
  --ink-deep:     var(--dashboard-bg-deep);
  --paper:        var(--dashboard-text);
  --paper-dim:    var(--dashboard-text-dim);
  --paper-mute:   var(--dashboard-text-muted);
  --paper-faint:  var(--dashboard-text-faint);
  --rule:         color-mix(in srgb, var(--dashboard-text) 7%, transparent);
  --rule-strong:  color-mix(in srgb, var(--dashboard-text) 14%, transparent);
  --rule-accent:  color-mix(in srgb, var(--dashboard-accent) 45%, transparent);
  --accent:       var(--dashboard-accent);
  --accent-dim:   color-mix(in srgb, var(--dashboard-accent) 72%, black);
  --accent-soft:  color-mix(in srgb, var(--dashboard-accent) 12%, transparent);
  --ok:           var(--dashboard-success);
  --warn:         var(--dashboard-warning);
  --err:          var(--dashboard-error);
  --neutral:      var(--dashboard-neutral);
  --shadow-card:  0 1px 0 rgba(255, 255, 255, 0.02) inset,
                  0 24px 48px -24px rgba(0, 0, 0, 0.55);
  color-scheme: dark;
}

[data-theme="light"] {
  --dashboard-bg:          var(--color-bg, #ece3cd);
  --dashboard-card:        var(--color-bg-card, var(--color-bg-subtle, #f6efdc));
  --dashboard-card-soft:   var(--color-bg-subtle, #e4dac1);
  --dashboard-bg-deep:     var(--color-bg-deep, var(--color-bg-subtle, #d4c8a8));
  --dashboard-text:        var(--color-text, #1a1528);
  --dashboard-text-dim:    var(--color-text-muted, #4a4257);
  --dashboard-text-muted:  var(--color-text-light, #7a7180);
  --dashboard-text-faint:  var(--color-border, #a79d98);
  --dashboard-accent:      var(--color-accent, #b8410c);
  --dashboard-success:     var(--color-success, #2f7b4d);
  --dashboard-warning:     var(--color-warning-text-emphasis, #8f5a10);
  --dashboard-error:       var(--color-error, #932f2f);
  --dashboard-neutral:     var(--dashboard-text-muted);
  --shadow-card:  0 1px 0 rgba(255, 250, 235, 0.6) inset,
                  0 1px 0 rgba(120, 90, 40, 0.05),
                  0 22px 40px -28px rgba(90, 60, 20, 0.28);
  color-scheme: light;
}
`;
