// Embed a value as a JSON literal inside an inline <script>. JSON.stringify
// alone leaves `<` and `/` intact, so a value containing `</script>` (or a
// U+2028/U+2029 line separator) could break out of the script element.
const SCRIPT_BREAKOUT = new RegExp("[<>&\\u2028\\u2029]", "g");

export function serializeForScript(value: unknown): string {
  return JSON.stringify(value).replace(
    SCRIPT_BREAKOUT,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}
