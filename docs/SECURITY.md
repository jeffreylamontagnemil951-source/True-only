# Security and safeguarding baseline

- Put the application behind Cloudflare Access; the Worker independently validates the Access JWT signature, issuer, audience and expiry.
- Every data query is scoped to the authenticated administrator's school ID. Never trust a school ID supplied by the browser.
- The database role is looked up server-side. A verification badge is not an authorization role.
- Keep R2 private. Add short-lived authorized download handlers before enabling uploads or downloads.
- Use prepared SQL statements, bounded search input and pagination.
- Require same-origin requests for state-changing API methods, JSON request bodies, and a strict request-size limit.
- Do not expose student photos, private messages, guardian details, or records in public URLs.
- Keep audit events for administrative changes. Restrict audit access and define retention.
- Use least privilege, MFA at the identity provider, session revocation, and regular access reviews.
- Student-to-student direct messaging is intentionally not implemented. Any future communication feature requires school policy, moderation, reporting, retention and safeguarding review.
- No system is impossible to bypass. Perform independent security testing before real-world use.
- Do not store real student data in development, screenshots, test fixtures, or Git history.
