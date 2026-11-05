# @brains/linkedin-import

Fills the owner's `anchor-profile` from their LinkedIn profile, from a Studio workspace only the Anchor sees.

## How it works

The plugin reads the owner's PROFILE snapshot from LinkedIn's DMA Member Data Portability (3rd Party) API and maps it to `name`, `headline`, `industry`, `location`, `website` and the profile story.

The **LinkedIn** workspace shows, for each field, the profile's value, LinkedIn's value and what an import would do with it:

- **Fill** — the profile has no value, or still holds the recipe seed's or starter profile's placeholder;
- **Keep yours** — the owner wrote a different value, which stays;
- **Same** — the profile already holds LinkedIn's value.

**Import from LinkedIn** asks for confirmation with the fields it would fill. Confirming re-reads LinkedIn and the profile and refuses when either changed since the preview. The write only applies while the profile is still the one the import read.

The workspace requires Admin permission and the Anchor flag; another Admin does not see it.

## Configuration

The plugin is in the catalog but in no bundle. Add it and give it a LinkedIn member token with the `r_dma_portability_3rd_party` scope:

```yaml
add:
  - linkedin-import
plugins:
  linkedin-import:
    accessToken: ${LINKEDIN_PORTABILITY_TOKEN}
```

Without a token the plugin registers nothing. Only members in the European Economic Area can consent to the portability API.
