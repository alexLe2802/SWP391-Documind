# SePay Subscription Payments

DocuMind uses the official `sepay-pg-node` SDK for hosted checkout. Card
details and VietQR payment screens are handled by SePay; they are never sent
to or stored by DocuMind.

## Supported methods

- `CARD`: international Visa, Mastercard, and JCB cards through SePay.
- `BANK_TRANSFER`: domestic bank transfer through SePay VietQR.

All orders are created in VND. Plan prices are controlled by backend
environment variables, never by frontend request values.

## Environment

```env
SEPAY_ENABLED=true
SEPAY_ENV=sandbox
SEPAY_MERCHANT_ID=<merchant-id-from-my.sepay.vn>
SEPAY_SECRET_KEY=<merchant-secret-key>
SEPAY_WEBHOOK_API_KEY=<your-random-webhook-api-key>
SEPAY_FRONTEND_URL=http://localhost:3000
SEPAY_STUDENT_PRICE_VND=149000
SEPAY_PRO_PRICE_VND=349000
```

Use `SEPAY_ENV=production` only after the sandbox flow passes and the
production merchant is active.

## SePay IPN configuration

Configure the following IPN URL in the SePay merchant dashboard:

```text
https://<backend-host>/api/payments/sepay/ipn
```

Use the ngrok HTTPS domain while testing the backend locally:

```text
https://<ngrok-domain>/api/payments/sepay/ipn
```

Use the deployed backend domain in production. Do not use the Vercel frontend
domain for IPN because the webhook route is served by the backend.

Select **API Key** authentication in the SePay webhook configuration and enter
the same random value stored in `SEPAY_WEBHOOK_API_KEY`. SePay requests must
include:

```http
Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>
```

The webhook endpoint accepts both SePay Payment Gateway IPNs and standard
bank-transaction webhooks. It returns the exact SePay acknowledgement
`{"success":true}`. Standard bank webhooks activate only incoming transfers
whose payment code or transfer content contains a pending DocuMind invoice;
the amount and payment method must also match.

The endpoint applies constant-time API key comparison and processes transaction
IDs idempotently. Keep `SEPAY_WEBHOOK_API_KEY` separate from
`SEPAY_SECRET_KEY`, which signs hosted checkout requests.

Frontend success redirects do not activate subscriptions. Only a valid SePay
IPN can mark an order as paid and apply paid quotas.

## Lifecycle

1. The authenticated user chooses Student or Pro and a payment method.
2. The backend validates the active plan and existing pending orders.
3. A pending payment order is stored with a 30-minute expiry and an audit log.
4. The backend signs checkout fields with the merchant secret.
5. The frontend posts the signed fields directly to hosted SePay checkout.
6. SePay sends an `ORDER_PAID` IPN.
7. The backend marks the order paid, activates the plan for one month, resets
   plan quotas, and writes payment/subscription audit logs.
8. `TRANSACTION_VOID` marks the order refunded and restores Free when the
   refunded order funded the current subscription.
9. Cancel/error redirects mark pending orders as cancelled/failed but never
   activate a plan.
10. Pending orders older than 30 minutes are marked expired when queried.

Switching to Free is immediate and does not call SePay.

## Database deployment

Run migrations before enabling checkout:

```bash
npm run prisma:migrate:deploy
```

The migration creates `payment_orders`, `subscriptions`, payment lifecycle
enums, quota fields, and supporting indexes.

## Sandbox verification

- Test Student and Pro using both payment methods.
- Verify cancelled and failed redirects.
- Verify a valid IPN activates the expected plan and quotas.
- Replay the same IPN and confirm no duplicate subscription update.
- Send a wrong amount, currency, payment method, or secret and confirm it is
  rejected.
- Send `TRANSACTION_VOID` and confirm refund/audit behavior.
