/**
 * Chinese pages set their characters in Noto Sans TC and Noto Serif TC,
 * behind the Latin faces, so Latin letters keep Inter Tight and Playfair.
 * The fonts load only on a page whose language is Chinese: the theme's
 * stylesheet stays as it is for English, and the TC stylesheets (large, even
 * with Google's unicode ranges) never reach an English page.
 */
const CHINESE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;800&family=Noto+Serif+TC:wght@500;600&display=swap";

export const chineseCSS: string = `
:root:lang(zh-TW) { --font-sans: "Inter Tight", "Noto Sans TC", "Helvetica Neue", Arial, sans-serif; --font-story: "Playfair Display", "Noto Serif TC", Georgia, serif; }
.tf-site { --tf-zh-ink-warm: #4f4b45; --tf-zh-paper-dim: #e7e2d9; --tf-zh-gloss-on-ink: #cfc9be; --tf-zh-strike: #b83232; }
:lang(zh-TW) :is(h1, h2, h3) { text-wrap: balance; line-break: strict; }
:lang(zh-TW) :is(p, li, blockquote) { text-wrap: pretty; }
:lang(zh-TW) section[id] { scroll-margin-top: 84px; }
.tf-site .tf-nl:has(.tf-nl__gloss) { flex-direction: column; justify-content: center; }
.tf-nl__gloss { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; line-height: 1.2; color: var(--tf-zh-ink-warm); }
.tf-mlink__gloss { margin-left: 10px; font-size: 15px; font-weight: 500; color: var(--tf-zh-gloss-on-ink); }
:lang(zh-TW) .tf-foot__name { line-height: 1.25; letter-spacing: 0; }
`;

export const chineseFontScript: string = `<script>
(function () {
  if (document.documentElement.lang.toLowerCase().indexOf("zh") === 0) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "${CHINESE_FONTS_URL}";
    document.head.appendChild(link);
  }
})();
</script>`;
