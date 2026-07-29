/** @jsxImportSource react */

export function UploadedFilePart({
  filename,
  mediaType,
  url,
}: {
  filename: string;
  mediaType: string;
  url?: string | undefined;
}): React.ReactElement {
  const content = (
    <>
      <span className="web-chat-attached-file-kicker">attached</span>
      <span className="web-chat-attached-file-name">{filename}</span>
    </>
  );

  if (url) {
    return (
      <a
        className="web-chat-attached-file"
        data-media-type={mediaType}
        href={url}
      >
        {content}
      </a>
    );
  }

  return (
    <span className="web-chat-attached-file" data-media-type={mediaType}>
      {content}
    </span>
  );
}
