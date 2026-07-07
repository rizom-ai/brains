export interface AtprotoBlobRef {
  $type?: "blob" | undefined;
  ref: { $link: string };
  mimeType: string;
  size: number;
}

export interface AtprotoBrainCardSkill extends Record<string, unknown> {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  examples?: string[];
}

export interface AtprotoBrainCardBrain extends Record<string, unknown> {
  did: string;
  name: string;
  role: string;
  purpose: string;
  values: string[];
}

export interface AtprotoBrainCardAnchor extends Record<string, unknown> {
  did: string;
  name: string;
  kind: "professional" | "team" | "collective";
}

export interface AtprotoBrainCardRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.card";
  siteUrl: string;
  brain: AtprotoBrainCardBrain;
  anchor: AtprotoBrainCardAnchor;
  skills: AtprotoBrainCardSkill[];
  model: string;
  version: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainDeckRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.deck";
  title: string;
  slug?: string;
  description?: string;
  body: string;
  format?: "text/markdown";
  author?: string;
  event?: string;
  publishedAt?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainLinkRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.link";
  title: string;
  url: string;
  description?: string;
  summary?: string;
  domain?: string;
  capturedAt?: string;
  source?: { ref: string; label: string };
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainNoteRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.note";
  title: string;
  body: string;
  format?: "text/markdown";
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainPostRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.post";
  title: string;
  summary?: string;
  body: string;
  format?: "text/markdown";
  brainDid?: string;
  anchorDid?: string;
  canonicalUrl?: string;
  topics?: string[];
  coverImage?: {
    blob: AtprotoBlobRef;
    alt?: string;
    width?: number;
    height?: number;
  };
  series?: string;
  seriesIndex?: number;
  sourceEntityType?: "post";
  sourceEntityId?: string;
  createdAt: string;
  publishedAt?: string;
}

export interface AtprotoBrainProjectRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.project";
  title: string;
  slug?: string;
  description?: string;
  body: string;
  format?: "text/markdown";
  year: number;
  url?: string;
  publishedAt?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainSeriesRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.series";
  title: string;
  slug?: string;
  description?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainSocialPostRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.socialPost";
  title: string;
  platform: string;
  body: string;
  format?: "text/markdown";
  status?: string;
  publishedAt?: string;
  platformPostId?: string;
  sourceLocalEntityType?: string;
  sourceLocalEntityId?: string;
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface AtprotoBrainTopicRecord extends Record<string, unknown> {
  $type?: "ai.rizom.brain.topic";
  title: string;
  body: string;
  format?: "text/markdown";
  brainDid?: string;
  anchorDid?: string;
  sourceEntityType?: string;
  sourceEntityId?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CanonicalAtprotoRecordMap {
  "ai.rizom.brain.card": AtprotoBrainCardRecord;
  "ai.rizom.brain.deck": AtprotoBrainDeckRecord;
  "ai.rizom.brain.link": AtprotoBrainLinkRecord;
  "ai.rizom.brain.note": AtprotoBrainNoteRecord;
  "ai.rizom.brain.post": AtprotoBrainPostRecord;
  "ai.rizom.brain.project": AtprotoBrainProjectRecord;
  "ai.rizom.brain.series": AtprotoBrainSeriesRecord;
  "ai.rizom.brain.socialPost": AtprotoBrainSocialPostRecord;
  "ai.rizom.brain.topic": AtprotoBrainTopicRecord;
}

export type CanonicalAtprotoRecord =
  CanonicalAtprotoRecordMap[keyof CanonicalAtprotoRecordMap];
