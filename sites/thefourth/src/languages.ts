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
