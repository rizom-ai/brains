# Ranger Seed Content

Default content copied on first boot when `brain-data/` is empty.

- `brain-character/` — Brain identity (overridden by instance seed content)
- `anchor-profile/` — Owner profile (overridden by instance seed content)
- `site-info/` — Site metadata (overridden by instance seed content)

After initial import, the database and git repo become the source of truth.
Instances can provide their own seed content to define identity.
