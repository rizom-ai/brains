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

**Inspect LinkedIn data shapes** reads the skills, positions, education and certifications domains and returns, for each, the field names, value types, how often each field occurs and every distinct record form with values replaced by placeholders such as `<string>` or `<month-year>`. It never returns a member value; it exists to write import fixtures for those domains.

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

The redirect URI must end at `/linkedin/oauth/callback`.

A brain without its own LinkedIn app connects through the managed broker instead (see `@brains/oauth-broker`). Configure `broker` in place of `oauth`, never both:

```yaml
plugins:
  linkedin-import:
    broker:
      url: https://connect.example.com
      instanceId: ada
      secret: ${LINKEDIN_IMPORT_BROKER_SECRET}
      returnUri: https://ada.example.com/linkedin/oauth/broker/return
```

The return URI must end at `/linkedin/oauth/broker/return` and match the address the broker holds for this instance. Connect then starts at the broker, LinkedIn returns to the broker, and the broker sends the owner back with a one-time grant this brain redeems for the token. Account settings need `ACCOUNT_SETTINGS_ENCRYPTION_KEY`. Without `oauth` the plugin registers nothing. Only members in the European Economic Area can consent to the portability API.
