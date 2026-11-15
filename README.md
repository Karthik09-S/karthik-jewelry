# Karthik Jewelry — E-commerce starter

A deployable starter for a jewellery store using:
- **Cloudflare Pages** — static customer storefront
- **Render** — Node/Express API
- **Supabase** — Postgres, Auth, Storage

## Included
- Responsive luxury storefront with category navigation, search, sorting and product cards
- Product detail modal, cart, quantity controls, coupon entry point and checkout form
- Supabase email/password sign-up and sign-in
- Customer order history
- Admin product create/update/delete endpoints and admin dashboard UI
- Order creation with server-side product price/stock validation
- Supabase SQL schema, indexes, RLS policies and storage bucket setup
- Environment variable templates and deployment instructions

## Brand direction
Champagne beige, espresso brown and antique gold. Initial collections:
Temple Jewellery, Antique Silver, Kundan & Bridal, Korean Fashion, Baby Jewellery.

## 1. Create Supabase project
1. Create a Supabase project.
2. Open SQL Editor and run `supabase/schema.sql`.
3. In Authentication > Providers, enable Email.
4. In Storage, the SQL creates a public `product-images` bucket.
5. Copy Project URL and anon key from Project Settings > API.
6. Set your first admin user's `profiles.role` to `admin` after signing up:
   ```sql
   update public.profiles set role = 'admin' where email = 'YOUR_EMAIL';
   ```

## 2. Deploy backend to Render
1. Push this folder to a GitHub repository.
2. Create a Render **Web Service** using the `backend` directory as Root Directory.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (secret; backend only, never put in frontend)
   - `FRONTEND_ORIGIN` (your Cloudflare Pages URL)
   - `PORT` (Render normally supplies this)
6. Copy the Render service URL.

Note: Render's free service may sleep when idle and cold starts can delay the first request. Check current Render plan limits before launch.

## 3. Deploy frontend to Cloudflare Pages
1. Create a Cloudflare Pages project connected to the GitHub repository.
2. Set Root Directory to `frontend`.
3. This is a static site: no build command; output directory is `.`.
4. Add these build-time/runtime config values by editing `frontend/config.js`:
   - `API_BASE_URL`: your Render service URL
   - `SUPABASE_URL`: your Supabase project URL
   - `SUPABASE_ANON_KEY`: your Supabase anon/public key
5. Deploy. Add your custom domain in Cloudflare Pages when ready.

## 4. Important launch integrations
This starter includes the core commerce structure but does not activate a payment gateway or courier account automatically.
Before accepting real orders:
- Integrate Razorpay (or another provider) with server-side order creation, signature verification and webhook handling.
- Add Shiprocket credentials and webhook verification for shipment booking/tracking.
- Configure GST, invoices, shipping rates, return/refund policies and privacy/terms pages.
- Add a verified WhatsApp Business number and opt-in messaging.
- Test order stock locking/concurrency, refunds, email notifications and all RLS policies.

## Security
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, payment secrets or Shiprocket credentials in the browser.
- Keep admin operations on the backend and verify the Supabase access token and `profiles.role`.
- Review and test RLS before launch. The included policies are a starting point, not a substitute for a security review.
- Do not collect or store card details yourself.

## Local development
Backend:
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```
Frontend: open `frontend/index.html` through a local static server (for example `npx serve frontend`), then set `frontend/config.js`.

## Customise
- Change brand copy, products and category labels in `frontend/app.js`.
- Replace demo product imagery with your own product photography.
- Add your contact details, delivery timelines, shipping rules and legal policies before launch.
