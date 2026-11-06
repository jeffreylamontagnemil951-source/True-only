# TrueOnly support conversations

Staff-only support ticket conversations use D1 for persistent message history and a SQLite-backed Durable Object per school/ticket for WebSocket message-created notifications. Message content is retrieved only through the authenticated Worker API.

Support staff can access only tickets they requested or that are assigned to them. School administrators are scoped to their school. Department and assignment changes require school administrator access. Message reports are stored for school administrator review.

Student and guardian requester categories are metadata labels, not separate login flows. Student-to-student messaging and file attachments are not implemented. Do not use real student data before school authorization, privacy, safeguarding and security reviews.

## Setup

1. Set the D1 database ID and Cloudflare Access values in wrangler.jsonc.
2. Apply migrations with `npx wrangler d1 migrations apply trueonly-db --remote`.
3. Configure DB, ASSETS and SUPPORT_ROOMS as declared in Wrangler.
4. Configure Cloudflare Access and authorized administrator records.
5. Complete the security review before deployment. This change does not deploy or provision resources.

## Message history and live delivery

- The conversation endpoint returns the newest 50 messages by default. Older messages are loaded in bounded pages using a ticket-bound cursor ordered by `created_at` and `id`; a cursor from another ticket is rejected.
- WebSockets carry message-created notifications containing only the message ID. Message text is always fetched through the authenticated, school-scoped Worker API.
- The Durable Object checks that the message exists in the same school and ticket. Before each broadcast it rechecks each connected administrator's active status, school, current requester/assignee/lead access, and `support.read` permission override. Stale sockets are closed.
- D1 triggers provide defense-in-depth against cross-school requester, assignee, department, sender, and report references.

No student or guardian self-service identity flow exists: requester categories are staff-entered metadata only. Do not put student names, contact details, health information, passwords, or other unnecessary sensitive details in support tickets. Attachments and student-to-student messages remain disabled; no R2 bucket is required.
