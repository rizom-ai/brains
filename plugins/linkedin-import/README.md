# @brains/linkedin-import

Fills the owner's `anchor-profile` from their LinkedIn profile, from a Studio workspace only the Anchor sees.

## How it works

The Anchor connects LinkedIn from the **LinkedIn** workspace. The plugin runs LinkedIn's authorization-code flow for the `r_dma_portability_3rd_party` scope against the instance's own LinkedIn app:

1. **Connect LinkedIn** opens `/linkedin/oauth/start`, which requires the Anchor's session and sends them to LinkedIn's consent page with a single-use state that expires after ten minutes.
2. LinkedIn returns to `/linkedin/oauth/callback`. The callback accepts the state only once and only from the session that started the flow, exchanges the code server-side, and stores the token in the Anchor's account settings, encrypted. The token never reaches the browser.
3. The owner lands back in the workspace with a notice: connected, declined or failed.

With a connection, the plugin reads the owner's PROFILE snapshot from LinkedIn's DMA Member Data Portability (3rd Party) API and shows, for each of `name`, `headline`, `industry`, `location`, `website` and the profile story, the profile's value, LinkedIn's value and what an import would do:

- **Fill** — the profile has no value, or still holds the recipe seed's or starter profile's placeholder;
- **Keep yours** — the owner wrote a different value, which stays;
- **Same** — the profile already holds LinkedIn's value.

**Import from LinkedIn** asks for confirmation with the fields it would fill. Confirming re-reads LinkedIn and the profile and refuses when either changed since the preview; the write applies only while the profile is still the one the import read. **Disconnect LinkedIn** forgets the token. An expired or revoked token asks the owner to connect again.

The token is an Account setting named **LinkedIn**, so it can also be pasted there by hand. The workspace requires Admin permission and the Anchor flag; another Admin does not see it.

## Configuration

The plugin is in the catalog but in no bundle. It needs a LinkedIn developer app approved for the Member Data Portability (3rd Party) product, with this brain's callback URL registered:

```yaml
add:
  - linkedin-import
plugins:
  linkedin-import:
    oauth:
      clientId: ${LINKEDIN_IMPORT_CLIENT_ID}
      clientSecret: ${LINKEDIN_IMPORT_CLIENT_SECRET}
      redirectUri: https://brain.example.com/linkedin/oauth/callback
```

The redirect URI must end at `/linkedin/oauth/callback`. Account settings need `ACCOUNT_SETTINGS_ENCRYPTION_KEY`. Without `oauth` the plugin registers nothing. Only members in the European Economic Area can consent to the portability API.
