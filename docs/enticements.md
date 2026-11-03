# What would make a hostel hand out the code, and a traveller open it twice

The growth playbook (`docs/growth-playbook.md`) covers *how* to open a city. This
is the list of things to **add to the product** so the two sides have a reason:
a hostel needs a reason to print the QR and keep it on the desk; a traveller
needs a reason to open the link tonight, and again tomorrow.

Every idea below is scored on four things:

- **Who** — who it entices: hostels, solo travellers, groups.
- **Effort** — S = a day, M = a week, L = a month, in this codebase.
- **Money** — free, or part of Pro (€19/mo). Nothing here is commission.
- **Signal** — the number that says whether it worked, and the number at which
  it should be deleted.

Headings read *(who · effort · money)*.

The bar for keeping anything: *does it make the hostel hand out the code, or
make the traveller come back tonight?* If it does neither, it is a feature, not
an enticement.

---

## 1. For hostels — "why would I print this?"

Ranked by how fast it gets a poster on a wall, not by how clever it is.

### 1.1 Fill the quiet night *(hostels · M · free)* — **shipped**
A hostel's worst number is beds empty tonight. `/post` already publishes an
event in about a minute; the missing half is publishing **a bed**: "2 beds free
tonight, €18, walk-in" appears in the HERE feed with a "tonight" flag, and the
desk can do it from the same screen, one tap, from a template ("beds left,
price, until when").

Why it works: it is the only pitch a hostel manager can act on *today* and
measure *tomorrow* — the weekly receipt shows beds sold from Away, not scans.
It also fixes the thinnest part of the traveller feed (a Tuesday in November is
empty), which is what makes the second visit happen.

Shipped: a second form on `/post` — beds left, price, good-until, one line.
It shows in the city feed (including the *opening* city page, where a bed is the
strongest thing the city can say) and on the hostel page as "Tonight only". A
booking that checks in today is charged that price for the **first night only**;
every night after it is the room's own price. One open deal per hostel per day,
replaced rather than stacked, gone at midnight.

Signal: beds posted per week per hostel; bookings from a tonight-post. Kill it
if fewer than 1 in 5 partner hostels use it in a month more than once.

### 1.2 Bring a neighbour *(hostels · S · free, plus Pro credit)* — **shipped**
Every hostel in a city knows the other hostels — the desk sends guests to them
when they are full. Give each partner a referral link
(`/partner?from=<slug>`): when the hostel they referred gets approved, the
referrer gets **two months of Pro credited automatically** (the billing code
already tracks `billing_events`, so this is one row and a `plan_credit_months`
field, not a payments project).

Shipped: `/partner?ref=<slug>` on a hostel's portal shows "X sent you", the
application carries the referrer, and approval credits the referrer **two months
of Pro** (`hostels.credit_months` + a `credited` row in `billing_events`). The
credit is spent when Pro starts: the renewal date moves, the price does not. A
signed-in applicant is still refused, and a fake `?ref=` earns nothing. It is
credit, never cash, and it is not a cut of the neighbour's beds.

Why it works: it turns the launch bar (3 partners per city) from our grind into
their favour, and hostels trust a peer more than a landing page.

Signal: applications with `from=` → approvals. Kill it if the referral rate is
under 10% of applications after three cities.

### 1.3 The kit in their language *(hostels · S · free)* — **shipped**
The reception poster and the dorm sticker are the product's front door and they
are English-only. Portuguese, Spanish, French, German, Italian and Polish
versions of the same A4, generated from the same route (`/hostel/[slug]/kit`),
with a language toggle. A Lisbon hostel with a Polish receptionist should not
have to translate it themselves.

Shipped: `?lang=pt|es|fr|de|it|pl` on `/hostel/[slug]/kit`, defaulting to the
browser's own `Accept-Language`, with the switcher on the page. The poster, the
dorm sticker and the three check-in lines change; the coaching around them stays
in English because its reader is the person looking at this screen. The QR is
the same in every language, so a building with four front desks prints all seven.

Signal: kit downloads per hostel. This one is not optional in a city that speaks
four languages.

### 1.4 The receipt that argues for renewal *(hostels · S · Pro)*
The weekly receipt exists. Make it *do something*: "Tuesday's curry post brought
11 joins and 2 beds; last week's pub crawl brought 3." Plus one button —
"post it again" — that clones last week's best-performing listing.

Signal: receipt open rate; Pro renewal rate. A receipt nobody opens is a cost.

### 1.5 Group and school enquiries *(hostels · M · free)*
Groups of 8–30 are the highest-value, worst-served demand a hostel gets, and it
arrives by email at 23:00 and gets lost. A "group enquiry" form on `/stay/<slug>`
— dates, beds, name, WhatsApp — that lands in `/hostel-admin` as a lead with a
reply drafted, and (later) in a shared inbox. Hostelworld charges commission on
those beds; here it is a form.

Signal: enquiries per hostel per month, and how many get a reply within a day.

### 1.6 A page they can put in their Instagram bio *(hostels · S · free)*
`/stay/<slug>` is already a decent page. Make it explicitly shareable: a proper
`og:image` with the hostel name and tonight's listing, and a "copy link" in the
portal. Free marketing they do for us, and the first thing that makes Away feel
like infrastructure rather than a test.

### 1.7 A badge that means something *(hostels · S · free)*
"Posts are from the desk, not an agency" — a small verified marker for hostels
whose staff have posted within 14 days and answered a chat. Cheap, and it makes
the hostel care about the *freshness* of their page, which is the thing that
keeps the traveller feed alive.

---

## 2. For solo travellers — "why open it tonight?"

### 2.1 "Who else is arriving" *(solo travellers · S · free)* — **shipped**
Shipped as two lines in the traveller lens, from confirmed bookings that
already exist — no new table:

- "4 of the 19 are staying in Lisbon that night" (a bed covering the night)
- "6 more arrive within the week" (a bed starting in the next seven days)

Nothing renders when the answer is zero: an empty statistic is worse than no
statistic. `getArrivalCohort()` in `lib/queries.ts` owns it.

### 2.2 Add to calendar + a 30-minute nudge *(solo travellers · S · free)*
"Going" is a weak commitment. A calendar entry (`.ics`, no account needed) and a
push-free reminder ("the curry starts in 30 minutes, 6 minutes' walk") doubles
actual attendance, which is the only thing that makes a listing believable to
the next traveller. The PWA is already installable; web push is the later half.

### 2.3 First-night buddy *(solo travellers · M · free)*
Two people arriving the same day with nothing on: one line in the arrivals
digest — "Sam arrives today too and is going to the 19:30 curry". Opt-in, one
tap, no profiles, no swiping. This is the feature hostels cannot build and
Hostelworld will not, because it does not sell a bed.

Signal: opt-in rate, and whether buddy arrivals actually show up. Kill it fast
if it feels like a dating app (report button must be on the message, not buried).

### 2.4 The safety filters that matter at 23:00 *(solo travellers · S · free)*
Last metro, walk time from *this* hostel, women-only dorm, "staffed 24h". The
data exists in the seed (`lens`) but is not filterable. A small filter row on
`/c/[slug]` ("I'm back by: 01:00 / metro / walkable") is the difference between
a guide and a plan.

### 2.5 Offline booking *(solo travellers · S · free)*
The booking page should survive a dead SIM in a basement dorm: the PWA caches
the booking, the QR and the address. It is a service-worker config, not a
product, and "it worked when my phone didn't" is a story people tell.

---

## 3. For groups — "we are four, not one"

This is the least served side of hostel travel and the one hostels care most
about (groups fill beds midweek and eat at the hostel bar).

### 3.1 Group nights *(groups and hostels · M · free)* — **shipped**
One person creates a group for a night ("Thursday curry, we're 5"), gets a link,
and friends join **with a name and a tap** — no account until they want one. The
event page shows "2 groups going (9 people)"; the hostel's reception screen
shows "a group of 5 is coming at 19:30", which is exactly what a bar wants to
know before deciding how much curry to cook.

Why it works: it converts the traveller's own WhatsApp group into distribution,
it gives the hostel a reason to care about the screen (the Pro feature), and it
is the only feature here that grows the number of people at an event without
spending a euro.

Built as described: `event_groups` + `event_group_members` (schema 10, migrated
in place), `/g/[token]` (`noindex`), `createGroupAction` / `joinGroupAction`,
a "Coming together" block on the event page, and — the part the hostel sees —
"2 in a group" on the reception screen.

A guest can join with a first name and nothing else; a signed-in traveller is
linked to their account instead of being added twice. Tapping the link twice
does not inflate the count.

Still open, deliberately: split payment (3.2), the group vote (3.3), and group
rates (3.4). Those are the next layer *on* this, not part of it.

Signal: groups per 100 events; average group size; whether group events get
more joins than solo ones.

### 3.2 Who has paid *(groups · M · Pro)*
In a group of five, someone puts it on their card and spends the trip chasing
€12. Split the booking: each member pays their own bed from the group link, the
desk sees one arrival list. No new payment provider — the sandbox flow already
issues a reference per booking.

### 3.3 The group vote *(groups · S · free)*
"Three things on tonight, everyone in the group taps one." Ten lines of state on
top of 3.1, and it is the thing groups actually do in a hostel kitchen.

### 3.4 Group rate request *(groups and hostels · S · free)*
Between 3.1 and 1.5: "we're 9, can we get the dorm for €20?" — a structured
message to the desk instead of a phone call at midnight.

---

## 4. Free wins that need no schema change

- The city page's empty state should never be empty: if nothing is listed, show
  what is on at the partner hostels and the two nearest markets, honestly
  labelled.
- "Tonight" on the home feed should survive a dead data connection: cache the
  last render in the PWA and show when it was fetched.
- Every event share should carry the day, the price and "6 going" — the three
  things that make a stranger tap.
- The `/you` page should show the trip *and* the hostel's WhatsApp, because that
  is what a traveller actually needs at the door.

---

## 5. What not to add

- **Commission on beds.** It would make the hostel's cost go from €19 to a
  percentage of revenue and turn a partner into a merchant. It is also the exact
  thing the pitch is against.
- **A native app.** The QR code is the install; the PWA already works offline.
- **Scraping Instagram or hostel WhatsApp groups.** Fastest way to lose a
  partner, and the data is unverifiable anyway.
- **A social network.** Profiles, follows, feeds of strangers: the product is
  "what's on tonight", not a place to live.
- **Loyalty points.** A traveller is in the city for 2.3 nights; points are for
  people who come back, and they do not.
- **Paid acquisition.** CAC against a €24 dorm bed does not work at any
  conversion rate worth modelling.

---

## 6. If only four things get built

| Order | Thing | Why first | Effort | Signal it worked |
|---|---|---|---|---|
| ~~1~~ | ~~"Who else is arriving" on the event page (2.1)~~ | **Shipped** — it makes the promise visible, with data already in the database | S | Join rate per event view |
| ~~2~~ | ~~Kit in five languages (1.3)~~ | **Shipped** (seven) — removes the last excuse for a poster not going up | S | Kit downloads per partner |
| ~~3~~ | ~~Group nights (3.1)~~ | **Shipped** — the only thing here that grows attendance without spending money, and it gives the paid screen a job | M | Groups per 100 events |
| ~~4~~ | ~~Fill the quiet night (1.1)~~ | **Shipped** — the one pitch a hostel can act on today and measure tomorrow | M | Beds posted per week |
| 5 | A Social Score from behaviour (see `docs/competition.md` §4) | The filter every solo traveller wants, and the one no review site can fake | S | Explore → hostel page click-through |
| 6 | Open chats a week before arrival | The window where intent is highest — Hostelworld's lesson, applied to data already on file | S | Join rate per arrival |

Both "bring a neighbour" (1.2) and "fill the quiet night" (1.1) are now in
`/hostel-admin` and `/post`. The next round — social score, one-line plans, the
traveller pass — is argued from the competitors' own numbers in
[`docs/competition.md`](competition.md).

---

*Existing surfaces this builds on: `/post`, `/hostel/[slug]/kit`,
`/hostel/[slug]/board`, `/hostel-admin` (the weekly receipt and `billing_events`),
`/c/[slug]`, `/stay/[slug]`, `/event/[id]` (chat, join count), `arrivals`,
`/partner` (application and the opening-city pipeline), `/admin/cities/[slug]`.*
