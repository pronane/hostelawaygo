# What Away costs, and what it has to earn

The infra bill for this product is, at every size anyone would call success, smaller than one hostel's commission cheque. That is the whole argument: **this is not a business that needs scale to pay for itself, it needs about a dozen paying hostels.**

Numbers below come from `node scripts/cost-model.mjs` (`--sensitivity` for the pessimistic case, `--json` for the raw model). Change an assumption and re-run; nothing is hand-copied except this prose.

---

## 1. What the load actually is

Per active user per month, the model assumes: 4 sessions, 8 page views each (32 page views), 6 API calls a session, ~400 rows read per page (the feed joins events, joins, hostels and cities), and 6 minutes of an open chat stream. Every page in this app is `force-dynamic`, so a page view is a function invocation — the pessimistic assumption, not the optimistic one.

```
| MAU    | Page views | Requests | Rows read | Rows written | Transfer | Server CPU | Held chat |
| 1,000  |     32,000 |   56,000 |       13M |          25k |     8 GB |      1.3 h |     100 h |
| 2,000  |     64,000 |  112,000 |       26M |          50k |    15 GB |      2.5 h |     200 h |
| 5,000  |    160,000 |  280,000 |       64M |         125k |    38 GB |      6.3 h |     500 h |
| 10,000 |    320,000 |  560,000 |      128M |         250k |    76 GB |     12.7 h |   1,000 h |
```

Ten thousand active users is **0.2 requests a second**. This is a rounding error for any host, and it is why the hosting argument below is about *pricing structure*, not capacity.

## 2. What that costs

Published list prices, November 2026, plus €3/month of overhead (domain, backup mail):

```
| MAU    | Vercel Pro + Turso | Render + Turso | Hetzner + SQLite | Cloudflare + D1 | Vercel € / 1k MAU |
| 1,000  |             €22.46 |          €9.44 |           €8.29 |           €7.60 |            €22.46 |
| 2,000  |             €23.51 |          €9.44 |           €8.29 |           €7.60 |            €11.76 |
| 5,000  |             €26.68 |         €26.00 |           €8.29 |           €7.60 |             €5.34 |
| 10,000 |             €31.96 |         €26.00 |           €8.29 |           €7.60 |             €3.20 |
```

What each line is made of:

- **Vercel — $20 Pro seat, and there is no way round it.** Hobby is explicitly *non-commercial*: the moment money changes hands the project needs Pro. Everything else is small: at 10k MAU, compute is ~€3 and 76 GB of transfer sits well inside the 1 TB included. The one real line is **held chat streams — €8.42 at 10k MAU** — because SSE keeps a function warm for as long as somebody is reading. Mitigation is product, not infra: shorten the stream or fall back to polling after 30 s and that line mostly disappears.
- **Turso — free.** 500M rows read / 10M written a month covers about **40,000 MAU** at these assumptions. The first paid tier is $5.99.
- **Render — $7 Starter** (0.5 vCPU, 512 MB, 100 GB) up to ~2k MAU; **$25 Standard** beyond. Flat, no per-invocation pricing, includes 500 GB transfer. SSE behaves like a normal socket, which is why Render is *cheaper than Vercel at 5–10k MAU* despite the sticker.
- **Hetzner CX23 — €4.29** (2 vCPU, 4 GB, 40 GB, **20 TB traffic**), plus €1 backup. Next runs as one Node process, SQLite is a local file read, the chat streams cost nothing. This is the floor: ~€8/month all-in, forever, at these sizes.
- **Cloudflare Workers + D1 — $5** — cheapest on paper, but Next 16 needs the OpenNext adapter and D1 is not libSQL; the cost of the migration is a weekend, which is more than three years of the Hetzner difference.

### If the traffic guess is 3× wrong

```
| MAU    | Vercel (÷3 traffic) | Vercel (×3 traffic) | Turso at ×3 |
| 1,000  |              €18.75 |              €21.57 | €0 (Free)   |
| 2,000  |              €19.10 |              €24.74 | €0 (Free)   |
| 5,000  |              €20.14 |              €34.24 | €0 (Free)   |
| 10,000 |              €21.89 |              €50.09 | €0 (Free)   |
```

Even at triple the traffic on the most expensive stack, 10k MAU is €50/month. **The infrastructure is never the problem.** It is worth saying plainly because it inverts the usual advice: there is no reason to move off Vercel for cost, and no reason to optimise anything until there is revenue to optimise around.

### Recommendation

| Stage | Host | Why |
|---|---|---|
| Until ~€500/month revenue | **Vercel Pro + Turso free** | Already deployed, zero ops, €22–32/month. Switching saves €20 and costs a day. |
| When chat or cron starts to feel like a tax | **Render Standard + Turso** | Flat pricing, sockets are free, the ingest/digest/outreach jobs finally have a home. `render.yaml` is already in the repo. |
| When you want the bill to stop moving | **Hetzner CX23 + SQLite + Litestream** | €8/month, 20 TB transfer, everything in one box. Only worth it once somebody is comfortable owning backups and deploys. |

The honest reading: **infrastructure is €8–32/month at every size in the question**, so "can it pay for itself" is entirely a question of whether hostels will pay €19.

## 3. What hostels already pay for

The comparison that matters is not "what does a competitor's app cost", it is "what does this hostel spend on the problem I am solving".

| Product | What a hostel pays | What it gets | Source |
|---|---|---|---|
| **Hostelworld commission** | 15% of booking value, effective **17.7%** in H1 2026 with Elevate | Beds, demand, visibility | Hostelworld interim results, Aug 2026 |
| **Hostelworld Elevate** | Opt-in higher commission (typically 18%) | Better placement in search | as above |
| **Cloudbeds** (PMS) | ~$180–320/month (≈$15–20/room) | PMS, channel manager, booking engine | vendor reports, 2026 |
| **Little Hotelier** | ~$109/month | PMS for small properties | vendor listings, 2026 |
| **BananaDesk** | $29/month ($24 annual) | PMS + channel manager for small hostels | vendor listings, 2026 |
| **Sirvoy** | $15–54/month | PMS + booking engine, 4%/booking on the engine | vendor listings, 2026 |
| **FrontDesko** | Free / $42/month | Bed-level PMS | vendor listings, 2026 |
| **Meetup / Ticketmaster** | Free to list | City-wide events, nothing about *this* building | product pages |
| **Away Free** | €0 | Listing, posting nights, guest chat, the QR kit | this repo |
| **Away Pro** | **€19/month** | Reception screen, weekly receipt with scan→join→bed funnel, arrivals digest, guest-only nights, featured placement, bookable dorm at no commission | this proposal |

The anchor for the sales conversation: a 60-bed hostel at 75% occupancy that sells half its beds through Hostelworld pays **€2,000–2,400 a month** in commission. Away Pro is €19. It does not have to beat Hostelworld — it has to be worth one dorm bed a night.

## 4. How it earns

**Supply side, the only place money comes from at first.** A subscription, not a commission: commission requires owning the booking and the payment, which is a different company (and a different set of liabilities) from the one that tells a guest what's on tonight.

| Plan | Price | Who |
|---|---|---|
| **Free** | €0 | Every hostel, forever: listing, posting, the QR kit, the chat. This tier exists to keep supply dense — a city with three free hostels is worth more than a city with one paying one. |
| **Pro** | **€19/month or €190/year** | Hostels that are already posting. It sells what only shows up after they post: the reception screen, the weekly receipt (scans → joins → beds), the arrivals digest, guest-only nights, and featured placement in Here. |
| **Ticketing** | 5% of a paid event | Optional, off by default. A €12 pub crawl with 9 people nets the hostel €102.60 and Away €5.40 — and payments already exist in the repo (sandbox mode) to make it real. |
| Later | City sponsorship | A tourism board or a hostel group paying for a city's guide, once a city is visibly alive. Do not design this before there is a city worth sponsoring. |

Deliberately **not** charged:

- **Travellers.** Hostelworld's Social Pass proves people will pay for access to other travellers, but a traveller who arrives through a hostel's QR will not pay to see what is on downstairs. Charging them would break the distribution loop that makes the supply side worth anything.
- **Commission on beds.** Away takes no cut. That is a feature of the pitch, and it keeps the product out of the payments-and-refunds business.
- **Per-scan or per-guest.** It punishes the hostel for the behaviour you want, and the numbers are small enough that it would not pay for anything.

## 5. Does it pay for itself? At every size in the question, yes

The model assumes ~2,000 MAU per live city, 10 hostels per city, and **35% of listed hostels on Pro** (the free tier keeps the rest listed — this is the conservative case, not the target):

```
| MAU    | Cities | Hostels | Paying | Subscriptions | Ticketing | Total  | Break-even (Vercel / Hetzner) |
| 1,000  |      1 |      10 |      4 |        €76.00 |    €32.40 | €108.40 | 2 / 1 hostels |
| 2,000  |      1 |      10 |      4 |        €76.00 |    €32.40 | €108.40 | 2 / 1 hostels |
| 5,000  |      3 |      30 |     11 |       €209.00 |    €97.20 | €306.20 | 2 / 1 hostels |
| 10,000 |      5 |      50 |     18 |       €342.00 |   €162.00 | €504.00 | 2 / 1 hostels |
```

Read the last column: **two paying hostels cover the entire Vercel bill at ten thousand active users; one covers the Hetzner bill.** At 10,000 MAU the projected revenue is ~€500/month against ~€32 of infrastructure — a 94% gross margin, which is what a product with no marginal cost per user should look like.

The real risk is not the infra bill. It is that hostels will not pay a subscription for something that was free. Three things make that more likely:

1. **The receipt is the pitch.** "Your quiz had 18 going, 28 people scanned the poster, 8 joined, 1 bed booked" is a number a hostel owner can act on. None of the free tier shows it.
2. **Charge after value, not before.** Pro only unlocks for hostels that have posted in the last 30 days — they have seen the funnel work before they see a price.
3. **Annual by default.** €190/year is one dorm bed a night for a season, and it removes twelve renewal conversations.

## 6. What is built, and what is not

Shipped:

- [x] `plan`, `plan_interval`, `plan_renews_on`, `plan_since`, `plan_cancelled` on `hostels`, and a `billing_events` log. Schema 9; **migrated, not rebuilt** — `MIGRATIONS` in `lib/schema.ts` walks an existing database forward, so a hostel that applied last month survives a deploy.
- [x] Gates: the reception screen (`/hostel/[slug]/board`) and the weekly receipt are Pro (`lib/plans.ts` → `isPro()`). Listing, posting, the QR kit and the chat stay free, deliberately.
- [x] Subscription checkout: Stripe Checkout when `STRIPE_SECRET_KEY` is set, a sandbox page that says it is one when it isn't. Pro is switched on **only** by the signed webhook (or the sandbox confirm), never by a browser landing on a success page.
- [x] Cancelling in one click from the portal, with no email to anybody: `plan_cancelled = 1`, Pro runs to `plan_renews_on`, then `isPro()` stops being true. No nightly job required; the daily digest cron sweeps lapsed rows so the log stays honest.
- [x] Billing history in `/hostel-admin` (checkout, activated, cancelled, expired, credited) and `/pricing` as a public, indexed page.
- [x] Referral credit: a hostel that brings another one earns two months of Pro, applied to the renewal date at activation (`hostels.credit_months`, a `credited` billing event). Credit, not cash, and never a cut of the neighbour's beds.

Still to do:

- [ ] The receipt email's footer should carry the plan and a one-click cancel link — the same courtesy the outreach tool gives its prospects.
- [ ] Invoices/VAT. The sandbox records what would be billed; a real Stripe account should also email the receipt.
- [ ] Annual plan is offered in the UI; Stripe gets whichever interval was pressed, but there is no dunning retry beyond Stripe's own.

The honest position on the public pages is now the menu rather than the apology: free is the product, Pro is €19, and both are described before anybody signs up.

## 7. The uncomfortable version

If hostels never pay, the fallback that keeps the lights on is the one that costs nothing to run: Hetzner at €8/month plus the domain. That is the floor, and it is low enough that the project can survive indifference for a long time — which is a better position than most consumer social products, and it means the pricing can be tested slowly instead of announced.
