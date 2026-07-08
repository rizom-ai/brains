/**
 * Typed client for the CMS editor API served by plugins/cms.
 * All routes live under /cms/api and require an operator session cookie.
 */

export interface EntityTypeInfo {
  entityType: string;
  label: string;
  isSingleton: boolean;
  hasBody: boolean;
  count: number;
}

export interface FieldDescriptor {
  name: string;
  label: string;
  widget: string;
  required?: boolean;
  default?: unknown;
  options?: string[];
  field?: FieldDescriptor;
  fields?: FieldDescriptor[];
}

export interface TypeSchema {
  entityType: string;
  format: "raw" | "frontmatter";
  isSingleton: boolean;
  hasBody: boolean;
  fields: FieldDescriptor[];
}

export interface EntitySummary {
  id: string;
  entityType: string;
  frontmatter: Record<string, unknown>;
  updated: string;
}

export interface EntityDetail extends EntitySummary {
  body: string;
  contentHash: string;
  created: string;
}

export interface ValidationIssue {
  path: Array<string | number>;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly issues: ValidationIssue[];

  constructor(status: number, message: string, issues: ValidationIssue[] = []) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const record = (payload ?? {}) as {
      error?: string;
      issues?: ValidationIssue[];
    };
    throw new ApiError(
      response.status,
      record.error ?? response.statusText,
      record.issues ?? [],
    );
  }
  return payload as T;
}

export async function fetchTypes(): Promise<EntityTypeInfo[]> {
  const { types } = await requestJson<{ types: EntityTypeInfo[] }>(
    "/cms/api/types",
  );
  return types;
}

export async function fetchSchema(entityType: string): Promise<TypeSchema> {
  return requestJson<TypeSchema>(
    `/cms/api/schema?type=${encodeURIComponent(entityType)}`,
  );
}

export async function fetchEntities(
  entityType: string,
): Promise<EntitySummary[]> {
  const { entities } = await requestJson<{ entities: EntitySummary[] }>(
    `/cms/api/entities?type=${encodeURIComponent(entityType)}`,
  );
  return entities;
}

export async function fetchEntity(
  entityType: string,
  id: string,
): Promise<EntityDetail> {
  const { entity } = await requestJson<{ entity: EntityDetail }>(
    `/cms/api/entities?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(id)}`,
  );
  return entity;
}

export async function updateEntity(input: {
  entityType: string;
  id: string;
  frontmatter: Record<string, unknown>;
  body?: string;
  baseContentHash?: string;
}): Promise<{ entityId: string; jobId: string }> {
  return requestJson<{ entityId: string; jobId: string }>("/cms/api/entities", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function createEntity(input: {
  entityType: string;
  frontmatter: Record<string, unknown>;
  body?: string;
}): Promise<{ entityId: string; jobId: string }> {
  return requestJson<{ entityId: string; jobId: string }>("/cms/api/entities", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function uploadFile(
  file: File,
): Promise<{ entityId: string; jobId?: string }> {
  const form = new FormData();
  form.set("file", file);
  return requestJson<{ entityId: string; jobId?: string }>("/cms/api/upload", {
    method: "POST",
    body: form,
  });
}

export async function deleteEntity(
  entityType: string,
  id: string,
): Promise<{ deleted: boolean }> {
  return requestJson<{ deleted: boolean }>(
    `/cms/api/entities?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
}
