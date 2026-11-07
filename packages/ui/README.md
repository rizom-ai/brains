# @rizom/brain-ui

React components for Rizom Brain sites and plugin views. They render with the
selected theme's tokens (`text-theme`, `bg-theme-subtle`, `text-brand`), so a
section built from them follows whichever theme the brain runs.

## Install

```bash
bun add @rizom/brain-ui
```

`react` and `react-dom` are peer dependencies: the brain supplies the one React
tree a site renders into.

## Components

| Export            | Renders                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `Card`            | A card container, optionally a link (`href`), in a `vertical`, `horizontal` or `compact` variant                              |
| `CardTitle`       | The card heading, optionally a link                                                                                           |
| `CardMetadata`    | A metadata row under the title                                                                                                |
| `TagsList`        | Tags as pills, truncated after `maxVisible`                                                                                   |
| `MarkdownContent` | Markdown as sanitized prose; in a brain's site build, `entity://image/<id>` references render as the build's optimized images |
| `formatDate`      | A date as `short`, `medium`, `long` or `full` text, in `en-US` and UTC, optionally with the time                              |

Each component's props type is exported beside it (`CardProps`,
`CardTitleProps`, `CardMetadataProps`, `TagsListProps`,
`MarkdownContentProps`), as are `FormatDateOptions` and `DateFormatStyle`.

```tsx
import {
  Card,
  CardMetadata,
  CardTitle,
  MarkdownContent,
  TagsList,
  formatDate,
} from "@rizom/brain-ui";

export function BookmarkCard(props: {
  title: string;
  url: string;
  savedAt: string;
  tags: string[];
  note: string;
}) {
  return (
    <Card>
      <CardTitle href={props.url}>{props.title}</CardTitle>
      <CardMetadata>
        Saved {formatDate(props.savedAt, { style: "medium" })}
      </CardMetadata>
      <TagsList tags={props.tags} />
      <MarkdownContent markdown={props.note} />
    </Card>
  );
}
```

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
