# TrueOnly Student Finder

A privacy-first school directory and staff support workspace built for Cloudflare Workers, D1 and Durable Objects. A production hostname must be registered or managed through Cloudflare and connected as a Cloudflare Worker Custom Domain.

## Status

Initial implementation scaffold. Do not use with real student records until an authorized school has completed the privacy, safeguarding and security review and configured identity access.

## Stack

- Cloudflare Worker API and static frontend
- Cloudflare D1 for relational records
- Durable Objects for per-ticket real-time notifications
- Cloudflare Access for identity-gated access
- Cloudflare Registrar for a Cloudflare-managed domain, when a domain is purchased
- GitHub for source control and CI
- Private R2 attachments are not implemented and no R2 binding is required at this stage

## Local checks

```sh
npm test
```

## Cloudflare setup

1. Register or add the domain to the same Cloudflare account that will host the Worker. For a new domain, use Cloudflare Registrar and check availability and the displayed registration/renewal price before purchase. Domain registration is paid; it is not included as a free Worker feature.
2. Choose the production hostname (for example, `app.yourdomain.com`). Do not use that example literally; replace it with the domain you control.
3. Create a D1 database and apply migrations `0001`, `0002`, and `0003` using the migration instructions in [Support conversations](docs/SUPPORT_CONVERSATIONS.md).
4. Set the real D1 database ID in `wrangler.jsonc`. Keep Cloudflare Access team and audience values accurate for your Access application.
5. Add the production hostname as a Worker Custom Domain. See [Cloudflare domain setup](docs/CLOUDFLARE_DOMAIN.md). Only add a hostname that is active in your Cloudflare account.
6. Configure Cloudflare Access to require authorized sign-in for the production hostname. Create the initial administrator record in D1 using the immutable identity subject from your Access identity provider and assign only the minimum required role.
7. Review Worker bindings and run tests. Deploy only after the school has completed the privacy, safeguarding, authorization and security review.

Do not create an R2 bucket for the current implementation: attachments are not implemented. If attachments are added later, use private object storage with authenticated, school-scoped upload/download authorization and no permanent public object URLs.

Never commit API tokens, Access secrets, student information, real student photos, or production database exports.

## Important

This repository is a starting implementation, not a certified student information system. Student data is sensitive, especially information about minors. Obtain school authorization, establish a lawful basis and consent process where required, minimize collected data, set retention rules, and test access controls before production use. A domain purchase or Worker deployment does not make the application approved for handling student records.
