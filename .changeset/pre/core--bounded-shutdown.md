---
"@rizom/brain": patch
---

A brain now finishes its shutdown when requests are still open. Before, the web process waited for every request in flight, such as an MCP or A2A stream, a long chat turn or a request body that never finished. The supervisor then killed it after 15 seconds, which skipped plugin shutdown, the database lease release and the database closes. Now the web listener stops taking requests and answers any that still arrive on an open connection with 503. It gives the requests in flight 5 seconds to finish, then closes them and logs how many there were. The MCP listener does the same.

The worker gives running jobs 8 seconds to finish and then interrupts the rest through their abort signal. A job interrupted this way goes back to the queue without using up a retry, unless its handler still succeeded. A job enqueued without retries fails as it would after a crash. If a job ignores the interruption, the worker keeps its session, so no other worker picks the job up while this process may still be running it. The job is reclaimed once the session lapses.
