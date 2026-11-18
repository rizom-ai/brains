/** One resource in a PROPFIND answer. */
export interface DavResourceProps {
  href: string;
  displayName: string;
  collection: boolean;
  contentLength?: number;
  contentType?: string;
  etag?: string;
  lastModified?: Date;
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

/** Escape text for element content; every value here is written as one. */
export function escapeXml(value: string): string {
  return value.replace(/[&<>]/g, (char) => XML_ESCAPES[char] ?? char);
}

const LOCK_KIND =
  "<D:lockscope><D:exclusive/></D:lockscope><D:locktype><D:write/></D:locktype>";

function propsXml(resource: DavResourceProps): string {
  return [
    `<D:supportedlock><D:lockentry>${LOCK_KIND}</D:lockentry></D:supportedlock>`,
    `<D:displayname>${escapeXml(resource.displayName)}</D:displayname>`,
    resource.collection
      ? "<D:resourcetype><D:collection/></D:resourcetype>"
      : "<D:resourcetype/>",
    resource.contentLength !== undefined
      ? `<D:getcontentlength>${resource.contentLength}</D:getcontentlength>`
      : "",
    resource.contentType
      ? `<D:getcontenttype>${escapeXml(resource.contentType)}</D:getcontenttype>`
      : "",
    resource.etag ? `<D:getetag>${escapeXml(resource.etag)}</D:getetag>` : "",
    resource.lastModified
      ? `<D:getlastmodified>${resource.lastModified.toUTCString()}</D:getlastmodified>`
      : "",
  ].join("");
}

/** A 207 Multi-Status body (RFC 4918 §13) naming every resource's live properties. */
export function multistatusXml(resources: readonly DavResourceProps[]): string {
  const responses = resources
    .map(
      (resource) =>
        `<D:response><D:href>${escapeXml(resource.href)}</D:href>` +
        `<D:propstat><D:prop>${propsXml(resource)}</D:prop>` +
        `<D:status>HTTP/1.1 200 OK</D:status></D:propstat></D:response>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">${responses}</D:multistatus>`;
}

/** An error body naming the precondition a request broke (RFC 4918 §16). */
export function davErrorXml(condition: string): string {
  return `<?xml version="1.0" encoding="utf-8"?><D:error xmlns:D="DAV:"><D:${condition}/></D:error>`;
}

/** The answer to LOCK: the lock just granted or refreshed (RFC 4918 §9.10). */
export function lockDiscoveryXml(lock: {
  token: string;
  seconds: number;
  href: string;
}): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><D:prop xmlns:D="DAV:">` +
    `<D:lockdiscovery><D:activelock>${LOCK_KIND}<D:depth>0</D:depth>` +
    `<D:timeout>Second-${lock.seconds}</D:timeout>` +
    `<D:locktoken><D:href>${escapeXml(lock.token)}</D:href></D:locktoken>` +
    `<D:lockroot><D:href>${escapeXml(lock.href)}</D:href></D:lockroot>` +
    `</D:activelock></D:lockdiscovery></D:prop>`
  );
}

/** The answer to PROPPATCH: every change to the resource was accepted (RFC 4918 §9.2). */
export function propertiesAcceptedXml(href: string): string {
  return (
    `<?xml version="1.0" encoding="utf-8"?><D:multistatus xmlns:D="DAV:">` +
    `<D:response><D:href>${escapeXml(href)}</D:href>` +
    `<D:status>HTTP/1.1 200 OK</D:status></D:response></D:multistatus>`
  );
}
