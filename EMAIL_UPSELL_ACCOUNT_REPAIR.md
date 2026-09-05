# Email-upsell account repair — 5 September 2026

The email-upsell flow no longer sends an empty account ID. It resolves ownership
before invoking the existing charge method, using exact parent order/customer
records and verified Vrio tracking16/17 funnel/node membership. Missing or conflicting
context returns through the existing checkout failure redirect without submitting
a charge. Database lookup errors also prevent charging; no default account is used.

Only the email-upsell preparation path is gated. Offer selection, amounts, card
selection, standard checkout, recurring billing and payment retry logic are unchanged.
The lookup is read-only and bounded. It does not import parent payments or repair
already-created failed jobs.

Deploy the companion **funnel-tracker-jobs** repair first, then this application.
No new environment variables or runtime dependencies are required. The existing
Mongo connection must expose the shared `payments` and `funnels` collections.
Verify a controlled email-upsell journey after deployment. No deployment or
production mutation was performed by this implementation.

Verification passed: **28 unit tests, 3 isolated real-Mongo tests, and the production
build**. Run `npm test -- --runInBand` and `npm run build`. The opt-in real-Mongo test is:

```sh
EMAIL_UPSELL_TEST_MONGO_URI=mongodb://127.0.0.1:27017/ npm run test:e2e -- --runInBand email-upsell-account.e2e-spec.ts
```

Use only a dedicated disposable test mongod. The test requires a loopback URL and
creates a uniquely named test database; it never reads `.env` or contacts Vrio.
Without the explicit URI this integration test is skipped. The implemented test
run used an isolated temporary MongoDB that was stopped after completion.
