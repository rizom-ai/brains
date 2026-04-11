import type { ExtractedTopicData } from "../schemas/extraction";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "for",
  "in",
  "of",
  "or",
  "the",
  "through",
]);

const GENERIC_SINGLE_TOKEN_TITLES = new Set([
  "agency",
  "automation",
  "collaboration",
  "culture",
  "design",
  "development",
  "innovation",
  "knowledge",
  "model",
  "practice",
  "research",
  "strategy",
  "systems",
  "technology",
  "tools",
  "value",
]);

const TOKEN_SYNONYMS: Record<string, string> = {
  agents: "agent",
  agentic: "agent",
  ai: "agent",
  artificial: "agent",
  bots: "agent",
  bot: "agent",
  collaborative: "collaboration",
  collaborating: "collaboration",
  humans: "human",
  intelligence: "agent",
};

export interface TopicSimilarityInput {
  title: string;
  keywords?: string[];
}

function normalizeToken(token: string): string | null {
  const normalized = TOKEN_SYNONYMS[token] ?? token;
  if (STOP_WORDS.has(normalized)) return null;
  if (normalized.length === 0) return null;
  return normalized;
}

function normalizeRhetoricalTitle(title: string): string | null {
  const match = title
    .trim()
    .toLowerCase()
    .match(/^([a-z0-9-]+)\s+(as|in)\s+.+$/i);
  if (!match) return null;

  const head = match[1];
  if (!head) return null;

  const headToken = normalizeToken(head);
  if (!headToken) return null;
  if (GENERIC_SINGLE_TOKEN_TITLES.has(headToken)) return null;

  return headToken;
}

export function tokenizeTopicText(text: string): string[] {
  const rawTokens = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  const tokens: string[] = [];
  const seen = new Set<string>();

  for (const rawToken of rawTokens) {
    const token = normalizeToken(rawToken);
    if (!token || seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }

  return tokens;
}

export function normalizeTopicTitle(title: string): string {
  const rhetorical = normalizeRhetoricalTitle(title);
  if (rhetorical) return rhetorical;
  return tokenizeTopicText(title).join(" ");
}

function toTokenSet(values: string[]): Set<string> {
  return new Set(values);
}

function isSubset(a: Set<string>, b: Set<string>): boolean {
  for (const token of a) {
    if (!b.has(token)) return false;
  }
  return true;
}

function intersectionSize(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count++;
  }
  return count;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  const shared = intersectionSize(a, b);
  const union = a.size + b.size - shared;
  return union === 0 ? 0 : shared / union;
}

function tokenizeKeywords(keywords: string[] = []): string[] {
  const tokens = new Set<string>();
  for (const keyword of keywords) {
    for (const token of tokenizeTopicText(keyword)) {
      tokens.add(token);
    }
  }
  return Array.from(tokens);
}

export function scoreTopicSimilarity(
  a: TopicSimilarityInput,
  b: TopicSimilarityInput,
): number {
  const titleTokensA = normalizeTopicTitle(a.title)
    .split(/\s+/)
    .filter(Boolean);
  const titleTokensB = normalizeTopicTitle(b.title)
    .split(/\s+/)
    .filter(Boolean);
  const titleSetA = toTokenSet(titleTokensA);
  const titleSetB = toTokenSet(titleTokensB);

  const normalizedTitleA = titleTokensA.join(" ");
  const normalizedTitleB = titleTokensB.join(" ");

  if (normalizedTitleA.length > 0 && normalizedTitleA === normalizedTitleB) {
    return 1;
  }

  const smallerTitleSet =
    titleSetA.size <= titleSetB.size ? titleSetA : titleSetB;
  const largerTitleSet =
    titleSetA.size <= titleSetB.size ? titleSetB : titleSetA;

  if (smallerTitleSet.size > 0 && isSubset(smallerTitleSet, largerTitleSet)) {
    if (smallerTitleSet.size >= 2) {
      return 0.94;
    }

    const [onlyToken] = Array.from(smallerTitleSet);
    if (onlyToken && !GENERIC_SINGLE_TOKEN_TITLES.has(onlyToken)) {
      return 0.9;
    }
  }

  const keywordSetA = toTokenSet(tokenizeKeywords(a.keywords));
  const keywordSetB = toTokenSet(tokenizeKeywords(b.keywords));

  const titleJaccard = jaccard(titleSetA, titleSetB);
  const keywordJaccard = jaccard(keywordSetA, keywordSetB);
  const titleToKeyword = Math.max(
    jaccard(titleSetA, keywordSetB),
    jaccard(titleSetB, keywordSetA),
  );

  return Math.max(
    titleJaccard,
    0.65 * titleJaccard + 0.25 * keywordJaccard + 0.1 * titleToKeyword,
  );
}

export function toSimilarityInput(
  topic: ExtractedTopicData,
): TopicSimilarityInput {
  return {
    title: topic.title,
    keywords: topic.keywords,
  };
}
