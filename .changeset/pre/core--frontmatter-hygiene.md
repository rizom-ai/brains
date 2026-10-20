---
"@rizom/brain": patch
---

An entity type can retire frontmatter fields it no longer uses. Stored entities carrying a retired field still load, and the brain removes the field from them on start, including from synced files. Blog posts retire `ogDescription`, `twitterCard` and `atprotoUri`, which nothing read; publishing a post to ATProto no longer writes its record URI back into the post.

Agents retire `cardObservedAt`, `cardLastCheckedAt`, `a2aEndpoint`, `did` (the agent page shows `brainDid`) and `anchorDid`. The card refresh loop now keeps its failure counts, unavailability and stale deadlines outside the agent, starting from the values the agent already carries.

Newsletters retire `buttondownId` and `resendBroadcastId`; sending no longer writes the provider delivery id into the newsletter.

Docs retire `sourcePath`, and site content retires `routeId` and `sectionId`, which repeated the section's `route:section` id.

Decisions and action items retire `spaceId`, `sourceSummaryId`, `sourceMessageCount` and `projectionVersion`. An action item is now written in its trimmed shape on any save, so the rewrite on start migrates stored cards completely.

Conversation summaries retire `conversationId` (the summary's id is its conversation), `entryCount` (counted from the body) and `projectionVersion` (already part of the source hash).

Links retire `domain`; the link list, link page and ATProto record take the hostname from the URL.

Traffic snapshots retire `week`, `start` and `end`: a snapshot's days fix its ISO week and dates.

Mail items retire `source.senderKey` and `source.domain`, which nothing read. A type can now retire a field inside a frontmatter object, and a persist validator no longer sees retired fields.

Email reply drafts retire `updatedAt`; a draft reports its update time from the entity.

A type can list translated fields: stored keys its parser still reads to fill their new place, never written back. Action items use it for `timeRange`, which was kept in stored cards; the next start removes it.

Directory sync writes an imported file back in its stored form when the brain drops one of its fields, so a brain bootstrapped from an older content repository cleans its files too.
