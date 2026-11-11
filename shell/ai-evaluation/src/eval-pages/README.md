# Eval pages

The pages eval cases save as links, as the link reader (`r.jina.ai`) returns
them: `<host>/<path>.md`, the root path as `index.md`. The eval network answers
the reader from here, so an eval never reaches the live site; a page not kept
here answers as missing. Each page is a short paraphrase of the live page,
enough for the extraction cases to judge, not a copy of it.
