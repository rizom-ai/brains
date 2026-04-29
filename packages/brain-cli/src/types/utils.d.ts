export namespace z {
  export interface SafeParseSuccess<T> {
    success: true;
    data: T;
  }
  export interface SafeParseError {
    success: false;
    error: ZodError;
  }
  export type SafeParseReturnType<T> = SafeParseSuccess<T> | SafeParseError;
  export interface ZodType<T = unknown> {
    parse(data: unknown): T;
    safeParse(data: unknown): SafeParseReturnType<T>;
  }
  export type ZodSchema<T = unknown> = ZodType<T>;
  export type ZodTypeAny = ZodType<unknown>;
  export type ZodRawShape = Record<string, ZodTypeAny>;
  export type infer<T extends ZodTypeAny> =
    T extends ZodType<infer Output> ? Output : never;
  export type input<T extends ZodTypeAny> =
    T extends ZodType<infer Output> ? Output : never;
  export type output<T extends ZodTypeAny> =
    T extends ZodType<infer Output> ? Output : never;
  export interface ZodObject<
    TShape extends ZodRawShape = ZodRawShape,
  > extends ZodType<Record<keyof TShape, unknown>> {
    shape: TShape;
  }
}

export const z: {
  object<TShape extends z.ZodRawShape>(shape: TShape): z.ZodObject<TShape>;
  string(): z.ZodType<string>;
  number(): z.ZodType<number>;
  boolean(): z.ZodType<boolean>;
  unknown(): z.ZodType<unknown>;
  array<T extends z.ZodTypeAny>(schema: T): z.ZodType<Array<z.infer<T>>>;
  record<T extends z.ZodTypeAny>(
    schema: T,
  ): z.ZodType<Record<string, z.infer<T>>>;
  enum<T extends readonly [string, ...string[]]>(
    values: T,
  ): z.ZodType<T[number]>;
  optional<T extends z.ZodTypeAny>(
    schema: T,
  ): z.ZodType<z.infer<T> | undefined>;
};
export class ZodError extends Error {}
export type ZodType<T = unknown> = z.ZodType<T>;
export type ZodSchema<T = unknown> = z.ZodSchema<T>;
export type ZodRawShape = z.ZodRawShape;
export type ZodTypeAny = z.ZodTypeAny;
export type ZodInfer<T extends z.ZodTypeAny> = z.infer<T>;
export type ZodInput<T extends z.ZodTypeAny> = z.input<T>;
export type ZodOutput<T extends z.ZodTypeAny> = z.output<T>;

export enum LogLevel {
  DEBUG = "debug",
  INFO = "info",
  WARN = "warn",
  ERROR = "error",
}
export type LogFormat = "pretty" | "json";
export interface LoggerOptions {
  context?: string;
  level?: LogLevel | string;
  format?: LogFormat;
}
export class Logger {
  static createFresh(options?: LoggerOptions): Logger;
  debug(message: string, data?: unknown): void;
  info(message: string, data?: unknown): void;
  warn(message: string, data?: unknown): void;
  error(message: string, data?: unknown): void;
}

export function getErrorMessage(error: unknown): string;
export function toError(error: unknown): Error;
export function createId(): string;
export function createPrefixedId(prefix: string): string;
export function createBatchId(): string;
export function slugify(text: string): string;
export function generateIdFromText(text: string): string;
export function pluralize(word: string): string;
export function toDisplayName(value: string): string;
export function formatLabel(value: string): string;
export function truncateText(text: string, maxLength: number): string;
export function calculateReadingTime(text: string): number;
export function interpolateEnvVar(
  value: string,
  env?: Record<string, string | undefined>,
): string;
export function interpolateEnv<T>(
  value: T,
  env?: Record<string, string | undefined>,
): T;

export interface ParsedMarkdown {
  content: string;
  data: Record<string, unknown>;
}
export function parseMarkdown(markdown: string): ParsedMarkdown;
export function generateMarkdown(
  content: string,
  data?: Record<string, unknown>,
): string;
export function extractTitle(markdown: string): string | undefined;
export function markdownToHtml(markdown: string): string | Promise<string>;
export function stripMarkdown(markdown: string): string;
export function toYaml(value: unknown): string;
export function fromYaml<T = unknown>(yaml: string): T;
export function isValidYaml(yaml: string): boolean;
export function parseYamlDocument<T = unknown>(yaml: string): T;

export interface ProgressNotification {
  progress?: number;
  total?: number;
  message?: string;
}
export type ProgressCallback = (
  notification: ProgressNotification,
) => void | Promise<void>;
export interface IJobProgressMonitor {
  report(notification: ProgressNotification): Promise<void>;
}
export class ProgressReporter {
  static from(callback: ProgressCallback): ProgressReporter;
  report(notification: ProgressNotification): Promise<void>;
}
export class JobResult {
  static success<T = unknown>(data?: T): T;
  static failure(message: string): never;
}
