export interface ContentRepoRef {
  org: string;
  name: string;
}

/**
 * A user's contentRepo is either a bare repo name (owned by the pilot
 * org) or an org-qualified `org/name` override.
 */
export function resolveContentRepoRef(
  contentRepo: string,
  githubOrg: string,
): ContentRepoRef {
  const slash = contentRepo.indexOf("/");
  if (slash === -1) {
    return { org: githubOrg, name: contentRepo };
  }
  return {
    org: contentRepo.slice(0, slash),
    name: contentRepo.slice(slash + 1),
  };
}

export function renderContentRepoRef(
  contentRepo: string,
  githubOrg: string,
): string {
  const { org, name } = resolveContentRepoRef(contentRepo, githubOrg);
  return `${org}/${name}`;
}
