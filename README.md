# Dink Lounge Pickle Court

Full Cloudflare Workers website for Dink Lounge Pickle Court, including:

- Public court availability and bookings
- Two-court double-booking protection
- Fifteen-minute payment holds
- GCash QR payment instructions
- Private booking-management dashboard at `/admin`
- Cloudflare D1 database storage

## Cloudflare deployment

1. Create a D1 database named `dink-lounge-bookings` in Cloudflare.
2. Replace the placeholder `database_id` in `wrangler.jsonc` with the database ID shown by Cloudflare.
3. Apply the database migrations with `npm run db:migrate:remote`.
4. Deploy with `npm run deploy`, or connect this repository through Cloudflare Workers Builds using:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`

## Private dashboard

Protect both `/admin*` and `/api/admin*` with Cloudflare Access. Use an Allow policy containing only the two approved management email addresses. One-time PIN email login is sufficient.

Also add a secret named `ADMIN_EMAILS` containing the same approved addresses, separated by a comma. The application checks this private allowlist server-side and does not publish the addresses in this repository.

Add the public build variables `NEXT_PUBLIC_PHONE_PRIMARY` and `NEXT_PUBLIC_PHONE_SECONDARY` in Cloudflare using the court's two contact numbers. This keeps the numbers out of the public source repository while still displaying them on the website.
