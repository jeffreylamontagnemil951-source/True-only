# Cloudflare domain and hosting setup

TrueOnly's intended public hostname must be managed through Cloudflare. Do not point the project to a third-party hosting provider.

## Domain choice

There are two Cloudflare-hosted address paths:

- **Temporary testing:** Cloudflare provides a `workers.dev` subdomain for a Worker. It is useful for development, but it is not a custom domain registered in your name and Cloudflare describes it as intended for personal or hobby projects.
- **Long-term custom domain:** register a domain using Cloudflare Registrar. The domain must be available and supported, and registration requires a verified Cloudflare account email, accurate registrant contact details, and a valid payment method. Domain registration and renewal are paid services; the price and supported term are shown in the Cloudflare dashboard before purchase.

A custom domain bought through Cloudflare Registrar automatically uses Cloudflare nameservers. Cloudflare Registrar does not currently support internationalized domain names. Domain registration is a paid, account-level action; have a parent or guardian handle the purchase and account billing where required. Do not put personal contact details in this repository.

## Registering through Cloudflare

1. Open the Cloudflare dashboard and sign in to the account that will own the domain.
2. Open **Domain Registration → Register Domains**.
3. Search for the exact domain name and review the available extensions, registration term, and displayed price.
4. Confirm the domain is available, then have the account owner complete registration and email verification.
5. Keep the domain in the same Cloudflare account that manages the TrueOnly Worker.

Official guide: https://developers.cloudflare.com/registrar/get-started/register-domain/

## Connect the domain to TrueOnly

After a Worker exists and the domain is active in the Cloudflare account:

1. Open **Workers & Pages** in the Cloudflare dashboard.
2. Select the TrueOnly Worker.
3. Open **Settings → Domains & Routes → Add → Custom Domain**.
4. Enter the chosen hostname, for example `app.your-domain.example`, and add it.
5. Cloudflare creates the DNS record and provisions the required certificate. Wait until the hostname and certificate are active before testing it.
6. If the app should only be available at the custom hostname, review the Worker's `workers.dev` endpoint and disable it after verifying the custom domain and Cloudflare Access protection. Otherwise the temporary hostname could become an alternate entry point.

Official guide: https://developers.cloudflare.com/workers/configuration/routing/custom-domains/

## Access and student-data safeguards

- Protect the application hostname with Cloudflare Access and verify the Worker validates the Access JWT.
- Configure the Access policy before exposing any real school information.
- Use the correct Access team domain and application audience tag in Worker variables.
- Test authorization using non-real test accounts and synthetic records only.
- Do not use real student data until the school has authorized the service and completed its safeguarding, privacy, and security review.
- Student-to-student messaging and file attachments remain out of scope. Do not create a public R2 bucket or public attachment URLs.

## Repository configuration

The Wrangler file intentionally does not contain a made-up domain name. Add a Custom Domain through the Cloudflare dashboard only after the actual domain is registered and the Worker is ready. Do not commit credentials, account IDs that should remain private, or personal registrant information.

No domain has been registered, no Worker has been deployed, and no Cloudflare resources have been provisioned by this documentation change.
