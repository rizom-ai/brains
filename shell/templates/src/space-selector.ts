const regexCache = new Map<string, RegExp>();

export function matchSpaceSelector(selector: string, spaceId: string): boolean {
  if (selector === spaceId) return true;

  let regex = regexCache.get(selector);
  if (!regex) {
    const escaped = selector.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
    regexCache.set(selector, regex);
  }
  return regex.test(spaceId);
}
