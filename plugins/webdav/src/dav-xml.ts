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

function propsXml(resource: DavResourceProps): string {
  return [
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
