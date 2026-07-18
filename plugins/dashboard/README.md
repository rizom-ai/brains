# @brains/dashboard

Dashboard plugin with extensible widget system.

## Features

- **Widget Registry**: Register and manage dashboard widgets
- **Layout System**: Flexible grid-based widget layout
- **Data Sources**: Connect widgets to entity data
- **Theming**: Consistent styling with theme integration

## Usage

```typescript
import { dashboardPlugin } from "@brains/dashboard";

const config = defineConfig({
  plugins: [dashboardPlugin()],
});
```

## Widgets

Widgets are registered with the widget registry and rendered in the tabbed dashboard layout. Each widget has:

- `id` - Unique identifier within the registering plugin
- `pluginId` - Owning plugin identifier
- `title` - Display title
- `group` - Tab id (`knowledge`, `publishing`, `network`, `system`, or a custom group)
- `section` - Placement within the tab (`primary`, `secondary`, or `sidebar`)
- `rendererName` - Built-in renderer name or custom renderer key
- `component` - Preact component for custom renderers
- `clientStyles` - Optional package-owned CSS for the widget
- `clientScript` - Optional package-owned behavior beyond generic controls
- `dataProvider` - Async widget data function
- `digest` - Optional Overview digest lines for the widget's group card
- `needsOperator` - Optional count of items awaiting an operator decision; group tabs sum these into badges

The `group` field is required. A group tab exists only when at least one visible widget declares that group.

## Custom widget controls

Custom components receive `pluginId`, `widgetId`, and a DOM-safe `instanceId` through
`WidgetComponentProps`. Use the exported `WidgetTabs`, `WidgetFilter`, `WidgetList`,
`WidgetListItem`, `WidgetStatusPill`, and `WidgetEmptyState` primitives so IDs, ARIA
relationships, classes, and behavior attributes stay consistent.

`WidgetTabs` supports nested line or pill variants, hash activation, and ARIA
Arrow/Home/End keyboard navigation. `WidgetFilter` filters descendant `WidgetListItem`
rows by their `filterValues` and can reveal its optional `emptyState`; neither control
requires a widget-specific script. The underlying `data-ui-*` contract remains available
for genuinely custom markup, and each controller changes only elements owned by its
nearest root.

Without JavaScript, every top-level dashboard section remains visible beneath its anchor
and section heading. Nested `WidgetTabs` show their server-selected default panel, while
filters leave their rendered rows intact; enhancement adds tab switching, filtering, and
roving keyboard focus.

Use `clientStyles` for widget-specific CSS composed from the shared `--console-*` tokens.
Identical style strings are emitted once and only when a visible widget needs them.
`clientScript` remains available for specialized behavior such as visualization pointer
and keyboard inspection.

## Client assets

The dashboard serves its base CSS, generic controls, configured theme CSS, and visible
widget assets from same-origin content-addressed URLs under `<routePath>/assets/`. Asset
responses are immutable and retain previously emitted hashes for the process lifetime;
the dashboard HTML remains dynamic and uncached. Theme CSS has its own per-content URL, so
one brain's configured theme cannot overwrite another asset in a shared browser cache.

## Templates

- `dashboard:layout` - Main dashboard layout with widget grid
