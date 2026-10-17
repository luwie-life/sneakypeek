# Billing (Flutterwave)

Sneaky Peek sells monthly creator subscriptions through Flutterwave Payment
Plans (API v3). This document explains how billing works, how to set it up,
and what has and has not been verified.

> Verification status: the subscription lifecycle (first payment, renewal,
> failed renewal and grace period, cancellation, duplicate webhooks, amount and
> currency checks) is covered by automated tests against a mock provider and a
> fake Flutterwave HTTP API. **Automatic monthly renewal has not been verified
> against the Flutterwave sandbox or a live account.** Do that before launch
> (see "Pre-launch verification" below).

## How it works

- Each paid plan in the database has a `providerPriceId`, which is the id of a
  Flutterwave monthly payment plan with the same amount and currency
  ([Payment plans](https://developer.flutterwave.com/docs/payment-plans-1)).
- Checkout (`POST /api/billing/checkout`) creates a Flutterwave Standard
  payment with our own `tx_ref` (`sp_<user>_<plan>_<nonce>`) and the
  `payment_plan` id, which subscribes the card to the plan. Checkout refuses a
  paid plan that has no payment plan configured, because it would otherwise be
  a one-off charge that never renews.
- Recurring payment plans are card-only on Flutterwave
  ([Recurring payments](https://developer.flutterwave.com/v3.0.0/docs/recurring-payments)),
  so checkout is limited to card payments.
- After payment the customer returns to `/dashboard/billing?transaction_id=...`
  and the app calls `POST /api/billing/verify`. The webhook does the same work
  independently. Whichever arrives first applies the payment; the second is a
  no-op.
- Every transaction is re-verified server-side with
  [Verify transaction](https://developer.flutterwave.com/reference/verify-transaction)
  before anything changes. Status, amount and currency must all match the plan.
  A gateway transaction id is applied at most once.
- Flutterwave charges renewals itself and sends `charge.completed`. Renewal
  charges carry a Flutterwave-generated `tx_ref`, so they are matched to the
  subscriber by email plus the plan amount and currency. The plan id field in
  the verify response is not clearly documented, so the code reads
  `plan` or `payment_plan` when present and does not rely on it.
- A failed renewal moves the subscription to `past_due`. Paid access continues
  for `BILLING_GRACE_DAYS` (default 3); after that the account falls back to the
  Free plan limits. Flutterwave cancels a subscription after repeated failed
  attempts and sends `subscription.cancelled`
  ([Payment plans](https://developer.flutterwave.com/docs/payment-plans-1)).
- Cancelling in the app calls
  [Cancel subscription](https://developer.flutterwave.com/reference/cancel-a-subscription-1)
  and sets `cancelAtPeriodEnd`. The customer keeps access until the end of the
  period they paid for, then drops to Free.
- A reconciliation job (`BILLING_RECONCILE_INTERVAL_MINUTES`) re-checks active
  and past-due subscriptions using
  [Get subscriptions](https://developer.flutterwave.com/reference/get-all-subscriptions)
  and [List transactions](https://developer.flutterwave.com/reference/get-all-transactions),
  so a missed webhook does not leave an account on the wrong plan.
- Entitlements are always derived server-side from the subscription state
  (`server/services/billing/entitlements.js`), never from the client.

## Setup

1. In the Flutterwave dashboard, get your secret key (test key first) and set
   `FLW_SECRET_KEY`.
2. Under Settings > Webhooks:
   - URL: `https://<your-domain>/api/billing/webhook`
   - Secret hash: a long random string. Set the same value as `FLW_SECRET_HASH`.
     Requests without a matching `verif-hash` header are rejected
     ([Webhooks](https://developer.flutterwave.com/docs/webhooks)).
   - Enable webhook retries. The endpoint returns a non-200 status on
     temporary failures so Flutterwave retries them.
3. Make sure your Flutterwave account can collect the plan currency (the seeded
   plans are in USD; USD collection may need to be enabled on your account).
4. Create the payment plans:

   ```bash
   cd server
   npm run billing:sync-plans -- --dry-run   # shows what would be created
   npm run billing:sync-plans                # creates them and saves the ids
   ```

   This calls [Create payment plan](https://developer.flutterwave.com/reference/create-payment-plan-1)
   for each active paid plan without a `providerPriceId`.
5. Until a plan has a payment plan id, its pricing card shows "Not available
   yet" and checkout for it is refused.

## Changing prices

A Flutterwave payment plan has a fixed amount and currency. Changing a plan's
price or currency in Admin > Plans without entering a new payment plan id clears
the old id. Run `npm run billing:sync-plans` again to create a new payment plan.
Existing subscribers stay on the old payment plan until they re-subscribe.

## Local development

`BILLING_PROVIDER=mock` simulates checkout, renewal and cancellation without
network calls or credentials. It grants paid plans without payment, so the API
refuses to start with it when `NODE_ENV=production`.

## Pre-launch verification (not yet done)

Run these against a Flutterwave test account before taking real payments:

1. Subscribe to a paid plan with a test card; confirm the plan activates via
   both the redirect and the webhook, and only one payment is recorded.
2. Confirm a renewal `charge.completed` is attributed to the right account and
   extends the period. Flutterwave test mode may not let you fast-forward a
   monthly renewal; if it cannot, use a short-interval test plan if your account
   allows it, or monitor the first real renewal closely.
3. Force a failed renewal; confirm `past_due`, the grace period, and the drop
   to Free after it.
4. Cancel in the app; confirm Flutterwave shows the subscription cancelled and
   access lasts until the period end.
5. Cancel from the Flutterwave dashboard; confirm the `subscription.cancelled`
   webhook is handled.
