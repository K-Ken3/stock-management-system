# Client Setup Guide - Atelier Stock Studio

This guide will walk you through setting up the Stock Management System with your Supabase project and getting it ready to run.

## Prerequisites

- [ ] Node.js 20.19+ or 22.12+ installed
- [ ] A Supabase project (create one at [supabase.com](https://supabase.com))
- [ ] Access to the Supabase project settings

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Environment Variables

1. Copy the example environment file:
   ```bash
   # On Linux/macOS
   cp .env.example .env.local
   
   # On Windows PowerShell
   Copy-Item .env.example .env.local
   ```

2. Get your Supabase credentials from your project:
   - Go to [app.supabase.com](https://app.supabase.com) → Your Project → Settings → API
   - Copy `Project URL` and `anon public` key

3. Edit `.env.local` and replace the placeholders:
   ```env
   VITE_SUPABASE_URL=https://your-project-ref.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here
   ```

> **Important:** Never put your `service_role` key in these variables. Only use the `anon`/`publishable` key for the frontend.

## Step 3: Apply Database Migrations

You have two options. Option A (CLI) is recommended for easier management.

### Option A: Using Supabase CLI (Recommended)

```bash
# Login to Supabase
npx supabase login

# Link to your project (get project ref from URL or settings)
npx supabase link --project-ref YOUR_PROJECT_REF

# Push the migration
npx supabase db push
```

### Option B: Using Supabase SQL Editor

1. Go to your Supabase project → SQL Editor
2. Copy the contents of `supabase/migrations/202610280001_initial_schema.sql`
3. Paste and run it in the SQL Editor

## Step 4: Configure Authentication

1. Go to your Supabase project → Authentication → Providers
2. Enable **Email** provider (should be enabled by default)
3. Go to Authentication → URL Configuration
4. Add your redirect URLs:
   - For local development: `http://localhost:5173`
   - For production: `https://your-domain.com`

## Step 5: Run the Application

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

## Step 6: First-Time Setup

1. Navigate to the app and create an account via Sign Up (or use an existing email)
2. Check your email for confirmation if email confirmation is enabled
3. Sign in
4. You'll be prompted to create your business workspace
   - Enter your business name
   - Select currency (RWF, USD, or EUR)
   - Select timezone
   - Set your first location name
5. Click "Create workspace" - you're ready to go!

## Testing the Core Flow

To verify everything is working:

1. **Add a product**: Go to Products → Add product, create a product with at least one variant
2. **Receive stock**: Go to Inventory or Receiving → Receive stock, add quantity to your variant
3. **Make a sale**: Go to Point of sale → Select an in-stock variant → Complete checkout with cash payment

## Quick Troubleshooting

| Issue | Solution |
|---|---|
| "Supabase is not configured" screen | Check your `.env.local` has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Restart the dev server. |
| Authentication errors | Verify Email provider is enabled in Supabase Auth and redirect URLs are configured. |
| RLS/Permission errors | Make sure migrations were applied successfully. Check you're logged in as the business owner. |
| "No active stock location" error | The `create_business` function creates a default location. If missing, check migrations ran correctly. |
| Stock issues on sale | Ensure you've received stock first - products won't be sellable without inventory. |

## Available Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production (TypeScript check + Vite build)
npm run lint     # Run linter
npm run preview  # Preview production build locally
npm run test     # Run tests
```

## Deployment Notes

When deploying to production:
1. Run `npm run build` to generate the `dist/` folder
2. Deploy `dist/` to your static hosting provider (Vercel, Netlify, Cloudflare Pages, etc.)
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables in your hosting provider
4. Add your production URL to Supabase Auth redirect URLs
5. Apply migrations to your production Supabase project before deploying if schema changed

## Support

For issues related to the database schema, check `supabase/migrations/202610280001_initial_schema.sql`. For application logic, refer to `src/App.tsx` and the README.