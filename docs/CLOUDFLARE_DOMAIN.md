# Cloudflare-managed domain setup

TrueOnly's production hostname must be a domain managed by the project's Cloudflare account. The intended production path is Cloudflare Registrar (for a new registration) plus a Cloudflare Worker Custom Domain.

## Domain ownership and purchase

- A domain registration is a paid service. Check the exact registration and renewal price, supported extension, and availability in the Cloudflare dashboard before making any decision.
- Domain registration requires an adult account holder to provide accurate registrant contact details and handle payment. If the project is being used by a student, ask a parent or guardian and the authorized school administrator to manage the registration.
- Domains registered through Cloudflare Registrar use Cloudflare nameservers. Keep the domain in the same Cloudflare account that will own the Worker and DNS zone.
- Do not assume a suggested name is available. No domain has been selected or purchased as part of this repository change.

Official Cloudflare guide: https://developers.cloudflare.com/registrar/get-started/register-domain/

## Choose the application hostname

After the domain is available in the Cloudflare account, the account holder and school administrator should choose a hostname, such as `app.yourdomain.com`. Replace the example with the actual domain. Keep the hostname stable because it is used for Cloudflare Access policies and the production link.

## Attach the Worker

Cloudflare Workers Custom Domains are suitable because the Worker is the application origin. Cloudflare provisions the DNS record and certificate for a valid Custom Domain.

Dashboard flow:

1. Open **Workers & Pages** in the Cloudflare dashboard.
2. Select the TrueOnly Worker.
3. Open **Settings → Domains & Routes → Add → Custom Domain**.
4. Enter the chosen hostname and confirm.
5. Verify the hostname and certificate status in the dashboard.
6. Configure Cloudflare Access to protect that exact hostname and allow only authorized school identities.

Do not create a conflicting CNAME record first. Cloudflare's Custom Domain flow manages the required DNS record.

Official guide: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

## Wrangler configuration

Once the real hostname is known, add this entry to the top-level `routes` array in `wrangler.jsonc`:

```json
"routes": [
  {
    "pattern": "app.yourdomain.com",
    "custom_domain": true
  }
]
```

Replace `app.yourdomain.com` with the actual Cloudflare-managed hostname. Do not commit a guessed hostname or deploy with the example unchanged. The same hostname must be used in the Cloudflare Access application configuration.

Custom Domains require an active Cloudflare zone and a hostname controlled by the account. Cloudflare automatically manages the DNS record and TLS certificate when the Custom Domain is created.

## Production safeguards

- Keep Cloudflare Access enabled; a custom domain is not an authentication system.
- Restrict Access to authorized school staff and verify the Worker checks the signed Access identity on every protected API request.
- Keep D1 school scoping and role checks enabled.
- Do not import real student data before the school has completed legal, privacy, safeguarding and security reviews.
- Do not deploy until the D1 ID, Access team domain, Access audience, migrations, and Worker bindings are correctly configured.
- Do not create a public R2 bucket. The current application does not implement attachments.

## Current status

This guide documents the intended setup only. It does not register a domain, change Cloudflare DNS, create a Custom Domain, configure Access, provision D1, or deploy the Worker.
