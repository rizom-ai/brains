---
"@rizom/brain": patch
---

Choosing a stock photo now sets the cover image when the photo is already stored. Before, the select-photo job failed on the photo's taken id and never set the cover. This happened when the job was run again after it had saved the photo, or when another post had already chosen the same photo. Now the job reuses the stored photo instead of downloading it again, and pings Unsplash's download tracker once for each use. A rerun of a job that already pinged the tracker does not ping it again.
