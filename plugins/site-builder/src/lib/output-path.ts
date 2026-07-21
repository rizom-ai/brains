import { resolve, sep } from "path";

export type SiteOutputPathKind = "route" | "asset";

export function describeUnsafeOutputPath(
  rawPath: string,
  kind: SiteOutputPathKind,
): string | undefined {
  if (rawPath.length === 0) return "path is empty";
  if (rawPath.includes("\0")) return "path contains a null byte";
  if (rawPath.includes("\\")) return "path contains a backslash";
  if (rawPath.includes("?") || rawPath.includes("#")) {
    return "path contains a query string or fragment";
  }

  if (kind === "route" && !rawPath.startsWith("/")) {
    return "route paths must start with /";
  }
  if (rawPath.startsWith("//")) return "path starts with //";

  const relativePath = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
  if (kind === "route" && relativePath.length === 0) return undefined;
  if (kind === "asset" && relativePath.length === 0) {
    return "asset path does not name a file";
  }

  const segments = relativePath.split("/");
  const finalIndex = segments.length - 1;
  if (kind === "asset" && segments[finalIndex]?.length === 0) {
    return "asset path does not name a file";
  }
  if (/^[A-Za-z]:$/.test(segments[0] ?? "")) {
    return "path starts with a Windows drive prefix";
  }
  for (const [index, segment] of segments.entries()) {
    if (segment === "." || segment === "..") {
      return `path contains a ${segment} segment`;
    }
    if (segment.length === 0 && index !== finalIndex) {
      return "path contains an empty segment";
    }
  }

  return undefined;
}

export function resolveSafeOutputFile(
  outputDir: string,
  rawPath: string,
): string {
  const reason = describeUnsafeOutputPath(rawPath, "asset");
  if (reason) {
    throw new Error(`Output path "${rawPath}" is unsafe: ${reason}`);
  }

  const relativePath = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
  const root = resolve(outputDir);
  const target = resolve(root, relativePath);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(
      `Output path "${rawPath}" resolves outside output directory`,
    );
  }
  return target;
}
