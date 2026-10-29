# Atelier Stock Studio

A responsive inventory and point-of-sale foundation for a boutique, built with React, TypeScript, Vite, and Supabase/PostgreSQL. Business data is stored in PostgreSQL, protected with row-level security, and critical product, receiving, and checkout operations are performed by transactional database functions.

## What is implemented

- Supabase email/password sign-in, password recovery, and owner workspace setup.
- Business membership roles and tenant-scoped row-level security.
- Product and multi-variant creation with SKU validation and audit events.
- Variant stock balances, weighted-average cost, and inventory movement history.
- Idempotent stock receiving and checkout RPCs with atomic balance/ledger updates.
- Server-priced checkout, payment method recording, stock locks, and oversell prevention.
- Live dashboard, product catalog, inventory, receiving, sales, and starter reports.
- Responsive layouts, accessible form labels, loading/empty/error feedback, and setup guidance.

The current point-of-sale flow intentionally supports one variant line and one full payment per sale. It does not claim support for split payments, discounts, credit sales, returns/refunds, or automatic payment verification.

## Requirements

- Node.js 20.19+ or 22.12+.
- A Supabase project with PostgreSQL and email authentication enabled.
- Supabase CLI for applying migrations (or run the versioned SQL migration in the Supabase SQL editor).

## Local setup

1. Install packages:

   ```sh
   npm install
   ```

2. Create a local environment file:

   ```sh
   cp .env.example .env.local
   ```

   On PowerShell, use `Copy-Item .env.example .env.local`.

3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from the Supabase project API settings. The anon/publishable key is intended for the browser; **never** place a service-role key in a `VITE_` variable.

4. Apply the migration:

   ```sh
   npx supabase login
   npx supabase link --project-ref YOUR_PROJECT_REF
   npx supabase db push
   ```

   The initial schema and its security policies are in [`supabase/migrations/202610280001_initial_schema.sql`](./supabase/migrations/202610280001_initial_schema.sql).

5. In Supabase Authentication settings, enable email/password sign-in and add the local and deployed app URLs to the allowed redirect URLs. Create an owner account through Supabase Auth. On first sign-in, create the business workspace in the application.

6. Start the development server:

   ```sh
   npm run dev
   ```

## Commands

```sh
npm run dev       # Vite development server
npm run build     # TypeScript project check and production build
npm run lint      # Oxlint
npm run preview   # Serve the production build locally
```

## Security and transaction notes

- All browser database access uses the Supabase anon key and an authenticated session. There is no service-role key in the application.
- RLS scopes records to active business memberships. Product-cost and inventory-valuation reads are restricted to owner/admin/manager roles; stock clerks and cashiers receive catalog and quantity data without the valuation RPC.
- `create_product`, `receive_stock`, and `complete_sale` are `SECURITY DEFINER` functions with a fixed search path, explicit role checks, and server-side validation.
- Stock receipt and sale operations lock the relevant inventory balance, update its projection and append a ledger movement in the same PostgreSQL transaction.
- A request idempotency key and request hash prevent retries from applying the same product, receipt, or sale twice, and reject re-use of a key with changed input.
- Payment records represent manually recorded payment methods. A Mobile Money entry is **not** provider-verified.

## Deployment

Build with `npm run build`, deploy the generated `dist/` directory to a static host, and configure the two public environment variables in the host settings. Configure the deployed URL in Supabase Auth redirect settings. Keep migrations under version control and apply them to the intended Supabase project before deploying frontend code that depends on a new schema.

Do not expose database connection strings, service-role keys, or other secrets in frontend build variables. Use Supabase's managed authentication, backups, logs, and project access controls.

## Backup and recovery

Use the configured Supabase project backup/PITR plan as the authoritative database backup. Exported business reports are not a full database backup. Before relying on recovery, document the project's retention window, capture a backup, restore it into a separate project, and verify authentication, tenant membership, balances, movement history, sales, and audit records. Recovery has not been exercised against a live Supabase project as part of this source build.

## Current gaps before production

This is an initial working foundation, not the complete business system described in the master brief. The following workflows remain out of scope in the current implementation:

- Supplier directory and purchase orders with partial goods-receipt linkage.
- Returns, exchanges, refunds, and supplier returns.
- Expense entry/approval, customers, staff invitations, fine-grained permissions, and audit-log UI.
- Product CSV import/export, report exports, receipt printing/PDF, notifications, image uploads, and multi-location stock transfer.
- Taxes, discounts, split payments, credit balances, and payment-provider integrations.
- Full automated unit, RLS integration, concurrency, and end-to-end acceptance tests.

Before production use, complete and test the above workflows, configure monitoring and backups, exercise restore procedures, review the Supabase RLS policies in a staging project, and run role-isolation and concurrent-checkout tests against PostgreSQL.
