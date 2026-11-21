# C.J.’s Gas Station — Online Ordering & Full Convenience Menu

Dark royal-blue and gold Express project for C.J.’s at 30th & Scott, Des Moines.

## What’s included
- Hot food, snacks, and a larger drinks menu with sample prices; eligible items can be ordered for pickup.
- Beer/alcohol, cigarettes, cigars, tobacco and vapes **shown in catalog as in-store-only**; no prices, add-to-cart, or online checkout for these age-restricted items.
- Pickup payment choice: **pay in store**, or **Stripe-hosted card checkout** (only after store Stripe credentials and verified webhook are configured).
- MongoDB order storage, basic admin API and server-side cart price verification.

## Run
`npm install` then `npm start` and open `http://localhost:3000`.

## Setup before accepting real orders
1. Edit `data/menu.json` with **actual C.J.’s inventory and prices**. All nonrestricted product descriptions/prices are demonstration placeholders. The adult-beverage and tobacco entries are **category placeholders, not a confirmed inventory**.
2. Configure MongoDB Atlas with `MONGODB_URI` and `MONGODB_DB`. Without MongoDB, local `data/orders.json` is not durable on Render. Configure `ADMIN_TOKEN` as a secret; `GET /api/admin/orders` requires header `x-admin-token`.
3. For **online credit/debit payments**, obtain a Stripe merchant account, configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `PUBLIC_BASE_URL=https://your-site.onrender.com`, and register webhook `https://your-site.onrender.com/api/stripe-webhook` listening for `checkout.session.completed`. Stripe Checkout supports card entry securely off site. Test with Stripe test credentials and confirm the order becomes `paid` in MongoDB after webhook delivery. Orders remain `awaiting_payment` if not paid.
4. Confirm the actual store pickup workflow, staff order monitoring, store phone/address/hours, tax handling, licensing, and approval from the payment provider. **Tax is not collected in Stripe Checkout in this starter build**; configure applicable taxes before real paid sales.
5. Staff do not automatically receive email/SMS/printer notifications. The owner must monitor order records or implement notifications before public launch.
6. The provided store photos have not been bundled; add approved photo files to `public/images` and reference them in the layout.
7. For age-restricted items, verify applicable Iowa/local rules, ID verification and merchant-provider policies before enabling any remote sale. This version leaves alcohol and nicotine products strictly in-store-only.

## Deploy to Render
Push to GitHub, choose a Render Web Service; build `npm install`, start `npm start`; set environment variables securely. Never commit real API keys or database passwords. Test both order pathways and staff receipt before sharing the link.
