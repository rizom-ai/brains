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
- `group` - Tab id (`knowledge`, `publishing`, `site`, `network`, `system`, or a custom group)
- `section` - Placement within the tab (`primary`, `secondary`, or `sidebar`)
- `rendererName` - Built-in renderer name or custom renderer key
- `component` - Preact component for custom renderers
- `dataProvider` - Async widget data function
- `digest` - Optional Overview digest lines for the widget's group card
- `needsOperator` - Optional count of items awaiting an operator decision; group tabs sum these into badges

The `group` field is required. A group tab exists only when at least one visible widget declares that group.

## Templates

- `dashboard:layout` - Main dashboard layout with widget grid
