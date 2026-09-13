// Conservative lexical admission, NOT an SQL parser or statement splitter.
// The original SQL is executed unchanged only after the entire input is checked.
// Trigger BEGIN/END blocks and Tcl-style parameter suffixes are deliberately not
// supported by this proof; never guess their boundaries and execute a prefix.
export class SqlAdmissionError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "SqlAdmissionError";
  }
}
function identifier(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}
export function assertOrdinarySql(sql: string): void {
  if (sql.includes("\0"))
    throw new SqlAdmissionError("NUL is not admitted in SQL text");
  let previous = "";
  let cases = 0;
  for (let i = 0; i < sql.length;) {
    const char = sql.charAt(i);
    if (char.charCodeAt(0) >= 128)
      throw new SqlAdmissionError(
        "Unquoted non-ASCII SQL text is not supported by the proof",
      );
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    if (sql.startsWith("--", i)) {
      i += 2;
      while (
        i < sql.length &&
        sql.charAt(i) !== "\n" &&
        sql.charAt(i) !== "\r"
      ) {
        if (sql.charCodeAt(i) >= 128)
          throw new SqlAdmissionError(
            "Non-ASCII line comments require verified tokenizer support",
          );
        i++;
      }
      continue;
    }
    if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) throw new SqlAdmissionError("Unterminated SQL comment");
      i = end + 2;
      continue;
    }
    if (char === "'" || char === '"' || char === "`" || char === "[") {
      const end = char === "[" ? "]" : char;
      let terminated = false;
      i++;
      while (i < sql.length) {
        if (sql.charAt(i++) !== end) continue;
        if (char !== "[" && sql.charAt(i) === end) {
          i++;
          continue;
        }
        terminated = true;
        break;
      }
      if (!terminated)
        throw new SqlAdmissionError("Unterminated SQL literal or identifier");
      previous = "quoted";
      continue;
    }
    if (char === "$" || char === ":" || char === "@" || char === "?") {
      i++;
      while (i < sql.length && identifier(sql.charAt(i))) i++;
      if (sql.charAt(i) === "(" || sql.startsWith("::", i))
        throw new SqlAdmissionError(
          "Complex parameter spelling is not supported by the proof",
        );
      previous = "parameter";
      continue;
    }
    if (identifier(char)) {
      const start = i++;
      while (i < sql.length && identifier(sql.charAt(i))) i++;
      const word = sql.slice(start, i).toUpperCase();
      if (word === "CASE") cases++;
      if (word === "END") {
        if (cases === 0)
          throw new SqlAdmissionError(
            "Raw transaction controls require typed lease operations",
          );
        cases--;
      }
      if (
        ["BEGIN", "COMMIT", "SAVEPOINT", "RELEASE"].includes(word) ||
        (word === "ROLLBACK" && previous !== "OR" && previous !== "CONFLICT")
      ) {
        throw new SqlAdmissionError(
          "Raw transaction controls require typed lease operations",
        );
      }
      previous = word;
      continue;
    }
    if (char === ";") cases = 0;
    previous = char;
    i++;
  }
}
