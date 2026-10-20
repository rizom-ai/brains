---
"@rizom/brain": patch
---

Studio links in documents and Chat render as styled links again; following an external link asks first in a proper dialog instead of dropping an unstyled prompt into the paragraph.

Studio names things the way people write them: "New note", "New FAQ", "New series", "Ask Content" and "Site Info" instead of "New Notes", "New faq", "New serie", "Ask Contents" and "Site Infos"; field and prompt labels keep acronyms ("OG Image", "Canonical URL", "AI", "LinkedIn"); choice lists show "Published" rather than "published"; and Studio copy uses American spelling ("Summarize body").

Studio names entries by their title instead of their id: skills by name and FAQs by question in lists and editor headings, Overview's recent activity ("Resilience Is Not Redundancy" · "Post updated"), and ⌘K search results. Administration names passkeys "Synced passkey" or "Device passkey" as Account does, and Site shows when the live copy was published and how many pages it has, keeping the build id with the render details.

Studio speaks plainly: a new entry asks for a "File name" and says where it saves; path errors, the delete confirmation and folder lists drop storage jargon; lists count "entries" once (no pager for a single page); Guest chat reads "Turn on guest chat", "$0.00" and "0 bytes of 4 MB"; Traffic says which days have no traffic collected; and dashboard cards link to "Open Site" and "Open Publishing" rather than "Open in Studio".

New entries open on Source, read "Not created yet" until they exist, offer a "Create" action and say why it is unavailable; a blank new entry is no longer "unsaved". ⌘K offers Studio's own pages (Overview, Chat, workspaces, Account, and every collection on search) and no longer spell-checks the query. Administration and Account agree on linked identities (a passkey is a sign-in credential), Account names only the sections it has, a new operator lands in Studio after registering their first passkey, and derived skills keep their names across reruns instead of being deleted and recreated.

Studio looks right in the details: the collapsed rail centers Commands, glyph buttons such as "•••" no longer wrap on phones, phone titles keep three lines before clamping, Chat's composer shows one focus ring, captioned figures (Guest chat, Traffic) line up in columns, a selected row reads as selected rather than as an error in the dark climate, and a failed site build shows its actual error instead of "Handler returned failure". A port set through `plugins.webserver.productionPort` now also sets the local site URL, so the first-passkey setup link printed at startup uses the right port.

The console strip's Studio door opens Studio itself rather than its `/cms` redirect alias, a singleton that does not exist yet is named by its title, and Overview names entries written by projections (derived skills and topics) by their titles too.

Only public turns and site visitors' questions become draft FAQs; an operator's own Studio Chat questions no longer land in the Inbox as FAQs.

Prompts whose title is still the old generated form are corrected at boot ("…AI Response", "…LinkedIn"); titles you edited are kept.

Obsidian vault bases take the same names as Studio's collections ("FAQs.base", "Site Content.base"); a base under its earlier name moves once, keeping any edits.
