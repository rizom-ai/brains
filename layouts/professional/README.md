# @brains/professional-site

Professional site plugin with homepage template and datasource.

## Features

- **Homepage Template**: Pre-built professional homepage layout
- **Profile Integration**: Pulls data from brain profile
- **Responsive Design**: Mobile-friendly professional layout
- **Theme Support**: Works with theme system

## Usage

```typescript
import { professionalSitePlugin } from "@brains/professional-site";

const config = defineConfig({
  plugins: [professionalSitePlugin()],
});
```

## Templates

- `professional-site:homepage` - Professional homepage with bio, links, and featured content

## Data Sources

- `professional-site:homepage` - Aggregates profile, posts, and projects for homepage
