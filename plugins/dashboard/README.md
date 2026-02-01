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

Widgets are registered with the widget registry and rendered in the dashboard layout. Each widget has:

- `id` - Unique identifier
- `title` - Display title
- `renderer` - Preact component
- `dataSource` - Optional data fetching

## Templates

- `dashboard:layout` - Main dashboard layout with widget grid
