# Merchant Console ↔ Aggregator Integration

**Date:** 2026-11-10
**Backend:** `element-pay-aggregator` @ `dev` (includes the p2a–p2k console-backend wave: MFA, invoices, contacts, webhooks, request logs, notifications, referrals, reports, auto-withdrawal)
**Frontend:** this repo — the V3 design prototype wired to the real API.

## How it works

| Layer | File | Role |
| --- | --- | --- |
| API client | `lib/api.js` | Fetch wrapper: JWT storage (localStorage), one-flight token refresh on 401/403, envelope unwrapping, typed endpoint helpers. Base URL from `NEXT_PUBLIC_API_BASE` (see `.env.local`), default `http://localhost:8000/api/v1`. |
| Data bridge | `lib/bridge.js` | `loadConsoleData()` probes `/auth/me` (auth failure throws `AuthExpiredError`), then fetches every console feed in parallel and maps backend DTOs into the shapes the ported design renders. Non-auth failures degrade to empty lists. |
| Logic patches | `lib/logic.js` | The generated design class, patched: real auth flow, session boot, and per-dataset `s.realX` overrides. When `apiConnected` is false (logged out / demo), every screen falls back to the original design mocks — the demo still works. |
| Markup patches | `components/markup.jsx` | Auth inputs bound (`value`/`onChange`), verification-code + error block injected before each auth CTA, and the hardcoded identity literals (workspace name, user line, avatar initials, endpoint count) replaced with bindings. **Note:** regenerating markup from a design export will drop these patches — re-apply them. |

## Run it locally

```bash
# Backend (element-pay-aggregator, dev branch)
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# Frontend (this repo)
npm run dev        # http://localhost:3000
```

Local email note: SMTP is not configured locally, so the signup verification
email never arrives. Fetch the code straight from the DB:

```bash
./scripts/get-verification-code.sh you@example.com
```

Existing verified local account: `jthuku490@gmail.com` / `Str0ng!Passw0rd1`
(and `jthuku490+console@gmail.com` / `Str0ng!ConsolePass1`, plus `jthuku490+biz2@gmail.com` / `Str0ng!BizTwo2026` — business *Kisumu Cold Chain Ltd* — both created through the UI).

---

## Current state (2026-11-10)

**No screen shows fabricated data while signed in.** All 21 nav screens were swept for the design's
sample content (Acme Commerce, Achieng Odhiambo, KES 4,812,300 / 14,160,583, XB-24xxx orders, fake
login history, "4 guest payers hidden") — none of it reaches a signed-in merchant. The prototype
"Feedback / Demo state" floating controls are hidden against a real backend, demo-only copy
("Switch the demo to sandbox…") is rewritten, the notification bell reads the real feed, the team
roster shows the real signed-in user, and the KYB wizard starts blank seeded from the real business.

Two pre-existing design-export bugs were fixed along the way:
- `authStep1` was defined **twice** in the view model; the later definition won, so the signup form
  rendered underneath the login form in login mode. Split into `authSignupForm` + `authStep1`.
- The OTP/error block had been injected three times (twice inside the social-login grid), and the
  GitHub/Google buttons were bound to the real submit handler.

### KYB / KYC wizard — reviewed and fixed

The wizard was built for one shape of customer (a registered company) and the account-type
selector was cosmetic: picking **Sole proprietor** or **Individual** changed the highlight and
nothing else. The review found one hard blocker and several correctness problems:

- **An individual could never finish verification.** Stage 2's completeness rule was
  `people.length > 0 && every(p => p.name && p.idNo)` — an individual has no directors or
  shareholders to add, so that section was unsatisfiable and "Submit for review" stayed disabled
  forever. Ownership is now dropped entirely for an individual.
- **The form asked everyone for company details** — legal name, trading name, registration number,
  date of incorporation, registered *and* business address — and the completeness rule hard-required
  a registration number that an individual does not have.
- **The document checklist was company-only** (Certificate of incorporation, CR12, Directors' IDs)
  regardless of type.
- **The step counter always said "of 5"**, and the stage sidebar numbered by canonical stage id, so
  dropping a stage would have rendered 1, 3, 4, 5.

Now type-aware across the whole flow:

| | Registered business | Sole proprietor | Individual |
| --- | --- | --- | --- |
| Stages | 5 | 5 | **4** (no Ownership) |
| Name field | Legal name | Registered business name | **Full name** |
| Trading name / Reg. no. / Business address | shown | shown | **hidden** |
| Country | of incorporation | of registration | **of residence** |
| Date | of incorporation | registered | **of birth** |
| Industry | Industry | Industry | **What you do** |
| Ownership stage | Directors, UBOs, signatories | The owner and any signatory | **not shown** |
| Documents | Certificate of incorporation, CR12, Tax PIN, proof of address, Directors' IDs, bank reference, licences | Business name certificate, Tax PIN, proof of address, Owner's ID, bank statement, licences | **ID/passport, proof of address, source of funds** |
| Progress | "n of 4 sections" | "n of 4 sections" | **"n of 3 sections"** |

The fixed eight-country **Expected corridors** chip list was removed: the catalog covers 35 markets,
so the picker under-sold coverage and forced a guess. The free-text purpose field carries it, and
stage 1's completeness rule now requires that text instead of a corridor selection.

Changing the account type swaps the document checklist, unless uploads have already started (so a
mis-click does not discard work). Verified in the browser for all three types: field sets, stage
lists, sequential numbering, document lists, and that an individual can now complete section 1 with
just a name, country and a line saying what the account is for.

**KYC and KYB are now distinct.** They are two different processes and the wizard had blurred them:

- **Identity check (KYC)** is an automated SmileID liveness/ID check on a secure link. It is wired to the real `POST /kyc/initiate` + `GET /kyc/status` — these are **JWT-authed**, unlike the KYB endpoints, so the console can call them directly. "Start on this device" opens the link; SMS/email hand it off. Locally it reports the backend's real error (SmileID `partner_id` is a placeholder) rather than faking a pass.
- **Business verification (KYB)** is document upload reviewed by hand. Stage 3 and the review step now say so explicitly.

**Director documents are per person.** The checklist had a single generic "Directors' IDs" row, so a company declaring three directors could satisfy it with one upload. Each declared person now gets their own named pair — `Joe Thuku — ID document`, `Joe Thuku — proof of address` — generated from the Ownership stage. Adding, renaming or removing a director rebuilds the list, and `kybMergeDocs` preserves anything already uploaded (verified: an upload stayed "In review" through a rebuild triggered by renaming a different director). With no directors declared yet, a single row points back to Ownership.

**Submission is still blocked** — see the KYB row in the table below. The wizard collects everything
and saves locally; it cannot POST because the endpoints are API-key-only.

### Public checkout page (new)

Payment links had nowhere to point. `public_path` (`/{business}/l/{link_slug}`) is meant to hang off a
customer-facing host, but the aggregator serves only JSON (no `HTMLResponse` anywhere) and the console
was a single page at `/`. The design's `pay.elementpay.net` did not exist. So a shared link opened the
raw API payload.

`app/[business]/l/[link]/page.tsx` + `components/PayPage.jsx` add that page, mirroring `public_path`
so a link shares as `<console host>/acme-test/l/pay-aaa2a2`. It resolves the link through the
unauthenticated public API and renders amount, merchant and an M-Pesa form. Every failure is shown as
the backend reports it — inactive link, expired link, no usable method, or the merchant-side
"no payout wallet configured" — rather than a generic error.

Share URLs in the links table, the detail pane and the share modal now point here instead of at the API.

### What is still not wired

| Area | Why |
| --- | --- |
| ~~MFA enrolment UI~~ | **Now wired.** Settings → Security starts a real `POST /auth/mfa/totp/enrol`, shows the secret, and activates with code + account password. Verified end-to-end: enrol → activate → sign out → sign in → TOTP challenge → console. |
| ~~Referral screen~~ | **Now wired.** The share link and code come from `GET /users/me/referral` (e.g. `/signup?ref=DBDLHR5J`), and the partner table reads the real referrals list. Sending referral *emails* is not a backend feature — the console copies your link and says so instead of claiming an invite was sent. |
| Reports summary / reconciliation | `/users/me/reports/summary` + `/reconciliation` exist and are still unread. The transactions CSV export *is* wired; the other report types say they are unavailable rather than claiming a file is ready. |
| ~~Notification preferences~~ | **Now wired.** Settings → Notifications renders the backend's seven categories and PATCHes each toggle; verified to persist across reload. |
| KYB submission | **Blocked on the backend, not the console.** `POST /partner/customers`, `…/documents` and `…/submit` are all `APIKeyHeader`-only — they cannot be called with the merchant's JWT session. Wiring this needs either a JWT-authenticated merchant KYB endpoint, or the console holding the merchant's API key (which is shown only once at creation, so that is the wrong answer). The wizard therefore collects and saves locally. |
| Wallets, deposits, conversions, payouts, cross-border wizard, bulk payouts | Ride the partner-account (Nuvion/PSP) rail, which needs KYB approval and live PSP credentials. Balances report 0 instead of inventing numbers. |
| Catalog, Subscriptions, Linked accounts | No backend entities exist; the console labels them "Coming soon". |

## Feature status — wired to the real backend

Each feature below talks to the live aggregator. "Expected behaviour" is what you should see when testing.

### 1. Sign up (email + password)
`POST /auth/register` → role `merchant`.
**Expected:** creating an account flips the card to "Check your email"; entering the 6-digit code verifies, auto-logs-in, and advances to the "About your business" step. Finishing that step creates the business (collect profile) from the business-name field and opens the dashboard. Duplicate email → routed to log in with a message. Disposable/undeliverable email domains are rejected by the backend.

### 2. Email verification
`POST /auth/verify-email`, `POST /auth/resend-verification`.
**Expected:** wrong code → inline error; "Resend code" issues a new one; verified accounts skip straight to login.

### 3. Log in / session / log out
`POST /auth/login`, `GET /auth/me`, `POST /auth/token/refresh`.
**Expected:** valid credentials open the dashboard with real data. Tokens persist in localStorage — a page reload resumes the session without logging in again (expired access tokens refresh silently). Sign out clears tokens and returns to the auth screen. Unverified account → verification step with a fresh code.

### 4. Two-step verification (MFA) at login
`POST /auth/login` returns `{ mfa_required, mfa_token, methods }` for MFA-enabled accounts; completes at `POST /auth/mfa/verify`.
**Expected:** accounts with TOTP enabled get a "Two-step verification" code prompt; a valid authenticator (or recovery) code finishes login. **Enrolment is wired too** — Settings → Security → Replace starts `POST /auth/mfa/totp/enrol`, shows the secret to add to your authenticator, and activates with the 6-digit code plus your account password (the backend requires both). Verified end-to-end on `jthuku490+biz2@gmail.com`, which now has MFA on.

### 5. Business (collect profile) auto-creation
`POST /businesses` on signup completion; `GET /businesses/me` on load.
**Expected:** the business name typed at signup becomes the real profile (slug derived from the name). Links, invoices and contacts all hang off it.

### 6. Signed-in identity (rail, workspace, key modal)
The design hardcoded "Acme Commerce Ltd" / "dev@acme.co · Developer" as literals in the markup. These are bindings now.
**Expected:** the rail workspace shows your real business name and initials, and the footer shows your real email and role (e.g. `jthuku490+biz2@gmail.com · Merchant`). The API-key modal shows the real key label and the real creating user.

### 7. Overview
KPIs derive from the live (empty-until-you-transact) data; the activity feed reads real orders.
**Expected:** a fresh account shows KES 0 gross/net/fees and "No settled volume yet" instead of demo numbers. The "Your next payout" card shows its empty state ("No automatic withdrawal scheduled") rather than a sample balance, because the sweep rail is not wired.

**Balance honesty:** per-currency balances ride the partner-account rail, which is not wired (needs KYB + live PSP credentials). Rather than show the design's sample balances — which read as spendable money — every balance reports **0** whenever the console is connected to a real backend. Wallets therefore shows `KES 0` across all accounts on a fresh merchant. In the logged-out demo the original sample figures still render.

### 8. Transactions
`GET /users/me/orders` mapped into the unified table (type, direction, counterparty, amounts, status, date).
**Expected:** fresh account → "No transactions yet". Orders created through the API show up as Checkout (on-ramp) / Local payout (off-ramp) rows; status chips map settled→Paid, pending/processing→Pending, failed→Failed, refunded→Refunded. Saved views and filters work on the real rows.

### 9. Payment links
`GET/POST /businesses/me/payment-requests`.
**Expected:** the list, KPier and status chips reflect real links. "Create payment link" (both the quick form and the full editor) hits the API — the new link appears in the table and the share modal shows the real public pay URL (`/api/v1/public/merchants/<business>/l/<slug>`, verified HTTP 200). Deactivate/Activate calls `PATCH …/{id}` for real.

### 10. Invoices
`GET/POST /businesses/me/invoices`, `POST …/{id}/send`.
**Expected:** real list with Draft/Sent/Viewed/Paid/Overdue/Void chips. Creating an invoice (editor or quick form) posts line items (`description`, `quantity`, `unit_price`), tax rate, due date; "send" also fires the backend send. The hosted pay page exists at `GET /public/invoices/{id}` and the PDF at `…/{id}/pdf`.

### 11. Recipients (beneficiaries)
`GET/POST /businesses/me/contacts` (+ `POST …/{id}/destinations`).
**Expected:** fresh account → "No beneficiaries yet". Saving a recipient creates a contact (role `you_pay`) plus its payout destination (mobile money / bank / stablecoin, masked at rest). The rail, masked account and currency come from the destination record. The name check is **not** wired end-to-end: against a real backend the UI reports "Name not checked" and warns to send a test payment first, rather than claiming a match it never verified (`POST …/destinations/{id}/name-check` exists but needs the destination to exist first).

### 12. Clients
Contacts with role `pays_you` feed the Clients screen; "Add client" creates one for real.
**Expected:** fresh account → empty list; added clients persist across reloads.

### 13. Developers — API keys
`GET /users/me/api-keys`, `POST /api-keys`.
**Expected:** real key list (name, environment, last-used, webhook state). The list endpoint returns no masked key, so the row shows the key id and notes the secret is shown only at creation. "Create API key" mints a real key and the one-time secret shown in the modal is the actual secret (copy it there — only a hash is stored).

### 14. Developers — Webhook endpoints
`GET/POST/DELETE /developer/webhook-endpoints`, per-endpoint deliveries, replay, replay-all, rotate-secret.
**Expected:** "Add endpoint" prompts for a URL (via `window.prompt` — the design never built a form) and registers it. The signing secret is shown once in a toast, which is a known weak spot: it auto-dismisses after 4 s and the backend never shows it again. Deliveries list per endpoint with HTTP status and attempts; failed deliveries expose a working "Replay" that hits the real replay route. SSRF-validated server-side.

### 15. Developers — Events
`GET /developer/events`.
**Expected:** fresh account → "No events yet"; webhook-outbox events appear here as payments move. "Sandbox tools" simulate buttons still inject local demo events on top.

### 16. Developers — Request logs
`GET /developer/request-logs`.
**Expected:** fresh account → "No API requests yet"; calls made with your API keys appear with method, path, status, latency and idempotency key (bodies are not stored server-side by design).

### 17. Referral programme (backend)
`GET /users/me/referral`, `/rewards`, `POST /referral/claim` are live (each account gets a code + share link).
**Expected UI caveat:** the Refer-and-earn page's partner table now starts empty when connected; the full earnings dashboard still renders design visuals. Your real code/link is available via API.

### 18. Notifications (backend)
`GET /users/me/notifications`, unread count, mark-read are live and loaded by the bridge.
**UI caveat:** the design has no bell-feed panel — only notification *preferences* in Settings (local-only toggles). Data is fetched and ready for a feed UI.

### 19. Reports (backend)
`GET /users/me/reports/summary`, `/reconciliation`, `/export.csv` are live.
**UI caveat:** the Reports screen still renders from the (now empty-when-connected) local transaction set rather than the server summary; the CSV export button uses the design's client-side export.

---

## Features that remain design mock-ups (backend missing or out of scope)

| Feature | Why | What exists today |
| --- | --- | --- |
| **Wallets / balances & payouts** | Real per-currency accounts, deposits, conversions and payouts ride the partner-customer (Nuvion/PSP) rails, which need KYB approval + live PSP credentials — not available on a local box. | Full `/partner/customers/{id}/accounts…` surface exists on the backend. The console shows **zero** balances when signed in (see Balance honesty above) — the screens render, the numbers are not invented. |
| **Payments abroad (cross-border wizard)** | Quotes/accepts hit live PSP corridors (Yellow Card etc.). | `POST /partner/orders/quote` + accept exist; wizard stays simulated. |
| **Bulk payouts (CSV)** | Backend batch rails are stablecoin-only today; fiat destinations are on the roadmap (assessment §3). | `disbursement_batches` machinery. |
| **Automatic withdrawals (sweep rules)** | Backend complete (`/partner/.../auto-withdrawal`, evaluator job) but rules attach to partner accounts, which need the Wallets rail first. | Full CRUD + scheduler, tests. |
| **KYB / business verification wizard** | Real flow is `POST /partner/customers` + documents + submit; the console's 5-stage wizard still saves locally. | Vault statuses incl. appeal/more-info (p2c). |
| **Catalog, Subscriptions** | No product/subscription entities in the aggregator (assessment §2: Not supported / Roadmap). | — |
| **Linked accounts (platforms/sub-merchants)** | Compliance-gated; tagged Roadmap in the design. | — |
| **Team members & roles** | No membership enforcement backend yet (assessment §1 — "first thing to build" after tenancy). Settings → Team stays mock. | `business_users` table exists, unenforced. |
| **WhatsApp flows, OTC desk, Paybill/Embed widgets** | Provider integrations not configured locally. | Various partial rails. |
| **Settings → Security (MFA enrol UI), branding, approval policy** | UI not wired; MFA backend fully live (see §4). | `/auth/mfa/*` complete. |

## Adversarial review — findings fixed

A security/correctness review of the integration layer (run against the live backend) found these; all are fixed and re-verified:

**Security**
- **Dead session rendered as an empty account.** `loadConsoleData()` wrapped every call in a catch-all, so an expired token produced a fully-chromed console showing "No payments yet" everywhere — indistinguishable from a genuinely empty merchant, with the stale token left in storage. It now probes `/auth/me` first and throws `AuthExpiredError`, which bounces to the login screen and clears tokens.
- **Token refresh was dead code.** The retry fired only on 401, but this backend answers **403** for an expired token (`app/utils/user_access.py`). Both are handled now, so refresh actually runs.
- **Error messages were swallowed.** The envelope says `"Request error"` and hides the reason in `data.msg`; that is now preferred.
- **Sign-out leaked the previous user.** It reset the `real*` data but not the identity (`bizName`, `realBizName`, `realUserEmail`) or locally-created records (`linksNew`, `invNew`, `benNew`, …), so the next user in the same tab saw the previous merchant's business name and records. Sign-out now clears all of it.
- **422 bodies echoed the submitted password** into `ApiError.body`. Error inputs are stripped before the error is thrown.

**Correctness**
- **`order_type` is a numeric enum (0 = OnRamp, 1 = OffRamp)** and `0` is falsy — `o.order_type || o.type` turned every on-ramp into an off-ramp, so customer collections rendered as outgoing payouts. Fixed in both order mappers.
- **Beneficiaries were blank.** The contacts *list* returns only `destination_count`; `destinations` exists solely on the single-contact GET. Contacts with destinations are now hydrated, and the field is `identifier_masked` (not `masked_identifier`).
- **Webhook health read the wrong shape** (`w.stats` → actually `w.health`), so every endpoint showed 0 deliveries / 0.0% errors / green. It now reports the real consecutive-failure count.
- **API-key list has no masked key** — the fabricated `ep_sk••••••` was identical for every row; it now shows the key id and says the secret is only shown at creation.
- **Order rate** is `exchange_rate`, not `rate`.
- **The share URL 404'd** — the public route is `/public/merchants/{slug}/l/{link_slug}`; `/merchants` was missing. The links detail pane also showed `pay.elementpay.net/<numeric id>` instead of the real path.
- **The OTP input and error banner were injected three times**, two of them inside the social-login button grid.

**Honesty**
- **"Link deactivated" did nothing.** The toast and pill flipped locally while the link kept accepting payments server-side; it now calls `PATCH /businesses/me/payment-requests/{id}`.
- **"Invoice sent" did nothing** on an existing draft; it now calls the real send endpoint and reports failure (e.g. missing client email) honestly.
- **The beneficiary name check was a 1.2 s timer that always returned "exact match"** — the UI vouched for an account name it never validated. Against a real backend it now reports "Name not checked" and warns to send a test payment first.
- **The console asserted a verified, live account** regardless of KYC. It now reads `kyc_verified` from the backend; an unverified merchant sees the sandbox banner ("Collections and payouts stay in sandbox until we approve your business") instead of a false "Live" badge.
- **"Log in with GitHub/Google" submitted the typed email and password** to `/auth/login` (the design bound them to the same handler as the real CTA). They now say social sign-in is unavailable.
- **Balances showed the design's sample millions** on a zero-transaction account — see Balance honesty above.

### Developers page (2026-11-15)

Patches on top of the generated files — **a design re-export drops these**:

| File | Patch |
| --- | --- |
| `lib/logic.js` | Dev sub-nav trimmed to API keys / Webhooks / the two "Soon" stubs (Events, Logs, Sandbox tools and API reference removed, plus the three "Docs" command-palette entries that were the only remaining route into the removed API-reference screen). Added the **Build with AI** values/handlers and a real-data branch for the usage card. |
| `components/markup.jsx` | Usage card heading/subheading turned into `v.keyUsageTitle`/`v.keyUsageSubtitle` bindings; its meter bar made conditional on `u.fillStyle`; **Build with AI** section added after the usage section. Patched by `scratchpad/patch-markup.mjs`-style asserted replacements — each fragment is matched exactly once or the patch aborts. |
| `lib/api.js` | `createApiKey(name, expiresInHours)` sends `expires_in_hours`. |
| `lib/bridge.js` | `mapApiKey` carries `expiresAt`/`expiresLabel`; new `expiryLabel()` helper. |

**Agent keys.** `POST /api-keys` accepts `expires_in_hours` (1–48, clamped
server-side by `APIKeyRepo.MAX_KEY_TTL_HOURS`) and `APIKeyRepo.authenticate`
filters expired keys out, so expiry is enforced at the single auth chokepoint
rather than by a sweep job.

> **Sandbox does not have this yet.** `https://sandbox.elementpay.net` runs the
> older build, which ignores `expires_in_hours` and returns no `expires_at`.
> Pydantic drops unknown fields silently, so a key created there **never
> expires**. The console treats a missing `expires_at` as "no expiry": the badge
> reads *No expiry*, the note turns red and the toast says the key must be
> revoked by hand — it never claims a 24 h expiry it cannot prove. Once the
> backend change is deployed the same button starts reporting a real expiry
> with no frontend change.

**Usage card.** There is no per-key rpm quota in the backend, so the design's
"612 / 1,000 rpm" meters are demo-only. Signed in, the card retitles to *Recent
API activity* and shows counts, success/failure split and p95 latency derived
from `GET /developer/request-logs`, with no progress bars.

### Sandbox is open; mocks stripped (2026-11-15)

**KYB gates live only.** `xSandboxEnv()` in `lib/logic.js` is the single predicate:
anything that moves only test money (payment links, invoices, contacts, catalog,
bulk, payouts, team invites, the payment wizard, deposits, conversions,
withdrawals) keys off the environment, not KYB. The `checkout`, `wallets`, `otc`
and `paybill` views were gated on `liveApproved` and are now open in sandbox too.
This matches the backend: `compliance_service` returns early outside live
(`"Limits are enforced only when API_ENVIRONMENT is live or production"`), and
`api_routes` only requires `kyc_verified` for live keys. The control that still
enforces KYB is `setEnv` — you cannot switch to live without `liveApproved`.
Deliberately unchanged: the "Live · needs verification" labels, the KYB
checklist, the verification banner, and the `paused` block on live withdrawals.

**Mock data removed.** 17 top-level datasets emptied (GP, CN/CNPAY/CNOUT, BPL/
BCUST/BST8, XBENS/XREM/XGUEST/XPAY, CAT/CATPAY, KYB_PEOPLE, KYB_DOCS,
BASE_ACCOUNTS, ORDERS) plus in-function `BULK`, the `activeLinks` samples, the
hardcoded overview sparkline, `statements`, `stats`, `feeBreakdown`,
`invoiceStats`, the demo API-key rows and the `keyUsage` meters. `KYB0` is now
the blank shape, and every fabricated identity ("Acme Commerce Ltd", "Acme
Foods", "Lagos Harbour Agents") is gone — fallbacks read "Your business".
Overview KPIs are counted from the real order feed; anything with no endpoint
behind it (volume, medians, week-on-week deltas, collected totals) shows "—".

Kept on purpose: `ENDPOINTS` (real API-reference copy), `KYB_DOC_SETS` (document
requirements per entity type), FX/corridor/market/geo config, colour palettes.

Three latent crashes surfaced once the data was empty and are now fixed:
`ACCOUNTS[ai]` dereferenced with no accounts (guarded by a placeholder plus
`accAt()`), `LOGO()` emitting `url(undefined)`, and `xApplyHome` indexing local
beneficiaries as `XBENS0[i - 12]` — valid only while twelve foreign rows
preceded them, so the seeding that created them was removed.

> Verified with `scratchpad/sweep-views.mjs`, which drives all 27 views through
> `renderVals()` on a fresh signed-in sandbox account: 27/27 build, 0 throw, and
> no NaN/Infinity/undefined reaches a rendered value. Re-run it after any further
> mock removal — it catches empty-dataset crashes the type checker cannot.

### API key CRUD (2026-11-15)

Every key operation is now wired from the Developers table — each row has
**Edit / Suspend-Resume / Revoke**, plus an inline edit panel for name and
webhook.

| Action | Endpoint | Notes |
| --- | --- | --- |
| Create | `POST /api-keys` | optional `expires_in_hours`, clamped to 48h |
| List | `GET /users/me/api-keys` | returns `expires_at`, `is_expired`, `suspended` |
| Rename | `PATCH /api-keys/{id}` | `{ name }` |
| Suspend / resume | `PATCH /api-keys/{id}` | `{ suspended }` — reversible |
| Webhook | `PATCH /api-keys/{id}/webhook` | `null` clears; blank secret keeps the current one |
| Revoke | `DELETE /api-keys/{id}` | permanent |

**Suspend is not revoke.** `suspended` is a separate column from `revoked`, and
every update path is scoped to `revoked = false`. A key revoked because it
leaked can never be renamed or un-suspended back into service. Both states fail
closed in `APIKeyRepo.authenticate`, the single chokepoint all `X-API-Key` auth
goes through.

Actions are icon buttons (pencil / pause-play / trash) with `title` and
`aria-label`, so the column stays narrow without becoming a guessing game. The
pause icon flips to play once a key is suspended.

Every state change confirms first, in a dialog that states the consequence
("requests start failing with 401 immediately"). Revoking additionally requires
typing `delete <key name>` — matched after trimming and case-sensitively, so
`DELETE MBOKA SANDBOX` does not pass. Suspend and resume are reversible and
need no typing.
`epKeyAction()` in `lib/logic.js` is the one place mutations run: it reports the
real error on failure and reloads from the server afterwards, so the table never
shows a success the backend did not confirm.

### Reports (2026-11-16)

`GET /users/me/reports/export.csv` is the **only** export the backend can
produce — orders, as CSV. Every other card (Settlements, Fees, FX, Balances,
Statements, Product sales), every other format (XLSX, PDF) and scheduled email
delivery have no endpoint, so they read *"coming soon"*, render dimmed and
cannot be clicked into a failure. The Reconciliation, Performance and Fee
schedule sub-tabs are marked **· Soon** and no longer open — they rendered
fabricated matches, percentages and corridor pricing.

Two bugs fixed while wiring it:

- **The CSV download wrote the four characters `null` to disk.** It went through
  `api.get()`, whose `request()` runs every body through `JSON.parse` and
  returns `null` when that fails. Downloads now use `requestFile()`, which keeps
  the bytes and reads the export headers.
- **The default export window is the last 30 days**, so a merchant whose
  activity is older got an empty file with no explanation. The console now asks
  for the widest window the backend allows (366 days — `MAX_RANGE_DAYS`) and
  names the window in the toast. On the sandbox account this is the difference
  between 0 rows and **98**.

> **Backend gap:** the export sets `Content-Disposition`, `X-Export-Rows` and
> `X-Export-Truncated`, but `CORSMiddleware` in `app/main.py` has no
> `expose_headers`, so **no browser client on another origin can read them**.
> The console degrades honestly — it counts the rows in the CSV itself and
> date-stamps the filename — but the fix belongs in the API:
> `expose_headers=["Content-Disposition", "X-Export-Rows", "X-Export-Truncated"]`.

### Still unwired (no UI claims success)
`notifications`, `referral` and `mfaStatus` are fetched and held in state but no screen reads them yet — the bell, referral page and Settings → Security still render design mock-ups. `voidInvoice`, `revokeApiKey`, `deleteWebhookEndpoint`, `contactHistory`, `reportsSummary` and the MFA enrolment helpers exist in `lib/api.js` with no call site.

## Known local-dev quirks

- **PSP health checks fail at startup** (placeholder credentials in `.env`) — warnings only, harmless locally.
- **SMTP is dead locally** → use `scripts/get-verification-code.sh`.
- **`.env` was auto-extended** on 2026-11-10 with the dev branch's new vars; placeholder values were typed-coerced (`SMTP_PORT=0` etc.). Local-dev gates set: `TURNSTILE_REQUIRED=false`, `EMAIL_VERIFICATION_FAIL_CLOSED=false`, `FE_CLIENT_SECRET_REQUIRED=false`, `JWT_ORIGIN_CHECK_REQUIRED=false`, CORS → `http://localhost:3000`.
- **Local DB was rebuilt** on dev's migration chain (backup: scratchpad `elementpay_local_backup_20261110_1149.sql`). The signup-IP migration was re-parented onto `p2k_ref_20261108`.
- The aggregator was seeded with an admin user (`ADMIN_EMAILS`) at first boot.

## Security notes (frontend)

- Tokens live in `localStorage` (`ep_access_token` / `ep_refresh_token`); sign-out clears them. No secrets are baked into the bundle — only `NEXT_PUBLIC_API_BASE`.
- All writes go through the authenticated client; 401s trigger one refresh attempt then surface as errors.
- API-key secrets and webhook signing secrets are displayed once, from the server response, and never persisted client-side.
