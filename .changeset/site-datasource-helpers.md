---
"@brains/identity-service": patch
"@brains/site-info": patch
"@brains/site-personal": patch
"@brains/site-professional": patch
"@brains/utils": patch
---

Extract shared site-datasource logic: fetchAnchorProfileData (fetch+parse profile) added to identity-service and re-exported via @brains/plugins; fetchRecentEntities and requireCta added to @brains/site-info. The personal/professional homepage and about datasources now compose these instead of repeating profile fetch/parse, entity list/sort/slice/map, and the CTA guard.
