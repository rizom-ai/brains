const DEFAULT_MAX_LENGTH = 2000;

/**
 * Split a message into chunks that fit within a character limit.
 * Useful for chat platforms with message length restrictions (Discord, Slack, etc.).
 *
 * Strategy:
 * 1. If under limit, return as-is
 * 2. Split into blocks (paragraphs), treating fenced code blocks as atomic
 * 3. Greedily accumulate blocks into chunks
 * 4. If a single block exceeds the limit, split at line then word boundaries
 */
export function chunkMessage(
  message: string,
  maxLength = DEFAULT_MAX_LENGTH,
): string[] {
  if (message.length <= maxLength) {
    return [message];
  }

  const blocks = splitIntoBlocks(message);
  const chunks: string[] = [];
  let current = "";

  for (const block of blocks) {
    const separator = current ? "\n\n" : "";
    if (current.length + separator.length + block.length <= maxLength) {
      current += separator + block;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (block.length <= maxLength) {
      current = block;
      continue;
    }

    // Oversized block — split at line boundaries
    splitOversizedBlock(block, maxLength, chunks, (remainder) => {
      current = remainder;
    });
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function splitOversizedBlock(
  block: string,
  maxLength: number,
  chunks: string[],
  setRemainder: (value: string) => void,
): void {
  let current = "";
  const lines = block.split("\n");

  for (const line of lines) {
    const sep = current ? "\n" : "";
    if (current.length + sep.length + line.length <= maxLength) {
      current += sep + line;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (line.length <= maxLength) {
      current = line;
      continue;
    }

    // Oversized line — split at word boundaries
    splitOversizedLine(line, maxLength, chunks, (remainder) => {
      current = remainder;
    });
  }

  setRemainder(current);
}

function splitOversizedLine(
  line: string,
  maxLength: number,
  chunks: string[],
  setRemainder: (value: string) => void,
): void {
  let current = "";
  const words = line.split(" ");

  for (const word of words) {
    const sep = current ? " " : "";
    if (current.length + sep.length + word.length <= maxLength) {
      current += sep + word;
      continue;
    }

    if (current) chunks.push(current);

    if (word.length > maxLength) {
      // Hard-split words that exceed the limit
      for (let i = 0; i < word.length; i += maxLength) {
        const slice = word.slice(i, i + maxLength);
        if (i + maxLength >= word.length) {
          current = slice;
        } else {
          chunks.push(slice);
        }
      }
    } else {
      current = word;
    }
  }

  setRemainder(current);
}

/**
 * Split message into blocks at paragraph boundaries (\n\n),
 * treating fenced code blocks (```) as atomic units.
 */
function splitIntoBlocks(message: string): string[] {
  const blocks: string[] = [];
  const lines = message.split("\n");
  let current = "";
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
    }

    if (!inCodeBlock && line === "" && current) {
      blocks.push(current);
      current = "";
      continue;
    }

    current += (current ? "\n" : "") + line;
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
}
