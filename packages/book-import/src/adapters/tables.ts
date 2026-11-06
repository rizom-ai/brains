/** A table's caption between its rows: B., or B. Zweite Klasse II tritt ein. */
const TABLE_CAPTION = /^[A-H]\.(?:\s|$)/u;
/**
 * A paragraph's cells, if it is a table's row: parted by bars. Only a row
 * read from the scan keeps its bars; elsewhere a bar is a speck.
 */
export function tableCells(text: string): string[] | null {
  if (!/ \| |^\| | \|$/u.test(text)) return null;
  return text.split("|").map((cell) => cell.trim());
}

/** A table's rows as a markdown table: its first row heads it unless it holds figures, then its head is empty. */
export function markdownTable(rows: string[][]): string {
  const width = Math.max(...rows.map((cells) => cells.length));
  const line = (cells: string[]): string =>
    `| ${[...cells, ...Array<string>(width - cells.length).fill("")].join(" | ")} |`;
  const [first = [], ...rest] = rows;
  const headed = !first.some((cell) => /\d/u.test(cell));
  const head = headed ? first : [];
  const body = headed ? rest : rows;
  return [
    line(head),
    line(Array<string>(width).fill("---")),
    ...body.map(line),
  ].join("\n");
}

/**
 * Paragraphs with each run of a table's rows, read from the scan with their
 * cells parted by bars, made one markdown table; a lettered caption
 * between two rows is one of its rows.
 */
export function tabled<Paragraph extends { text: string }>(
  paragraphs: Paragraph[],
): Paragraph[] {
  const isRow = (index: number): boolean =>
    tableCells(paragraphs[index]?.text ?? "") !== null;
  const inTable = (index: number): boolean =>
    isRow(index) ||
    (TABLE_CAPTION.test(paragraphs[index]?.text ?? "") &&
      isRow(index - 1) &&
      isRow(index + 1));
  const runs = paragraphs.reduce<Paragraph[][]>(
    (done, paragraph, index) =>
      inTable(index) && inTable(index - 1) && done.length > 0
        ? [...done.slice(0, -1), [...(done.at(-1) ?? []), paragraph]]
        : [...done, [paragraph]],
    [],
  );
  return runs.flatMap((run) => {
    const rows = run.map(
      (paragraph) => tableCells(paragraph.text) ?? [paragraph.text],
    );
    const [first] = run;
    return first && rows.some((cells) => cells.length >= 2)
      ? [{ ...first, text: markdownTable(rows) }]
      : run;
  });
}
