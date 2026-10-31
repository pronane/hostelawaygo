# HostelAwayGo — review, market check, and concept proposal

*Prepared 31 October 2026 · branch `arena/2e33c0ab-hostelawaygo`*

---

## TL;DR

**The repo is not an app yet.** It's a 2017 Android Studio template project (a "Spring REST demo" screen and a "Hello World" screen) with one half-built Events screen that turns a typed place name into a latitude and longitude. It has a compile-breaking resource/namespace mismatch and it talks to a demo endpoint that no longer matters. There is no event data, no hostel data, no backend, no design. **Do not build on it — keep the name, rebuild the product.**

**The market is not empty, but there is a real seam.** Hostelworld has already built the "hostel social layer" — City Chats, hostel Chats, Linkups, curated Events in 180+ cities, and a paid Social Pass. So the idea "hostel events + meet people" is taken at the top end. But nobody does the three things your sentence actually describes, together:

1. **Breadth** — *everything* on (hostel events **and** the city's own festivals, gigs, markets, free stuff), not just one OTA's bookable inventory or one chain's properties.
2. **Two windows at once** — where I am **right now** *and* where I'm going **next**, both live, without buying a pass or losing the first city when I switch.
3. **The traveller lens** — every listing scored on *can I walk into this alone*, *is it free*, *how far from my bed*, *will I be back before the last bus*.

That's the wedge. Recommended play: **supply-first in one city** — give independent hostels a 60-second way to publish tonight's thing, aggregate the city's own events around it, and put both in one traveller-facing feed. Web-first PWA, no install, QR-code distribution.

---

## 1. What is actually in the repo

| Area | Reality |
|---|---|
| Scope | ~6 Java files, 2 build modules, one of which is excluded from the build |
| `app` module | Android app, namespace `hostelawaygo.com.rest`, package `hostelawaygo.com.rest` **and** `com.hostelawaygo.android` — two unrelated namespaces |
| Home screen | Loads `http://rest-service.guides.spring.io/greeting` — the Spring "REST service" tutorial demo, over cleartext HTTP |
| Events screen | Typed address → `Geocoder.getFromLocationName()` → prints "Lat: …, Lon: …" to a `TextView`. That's the whole feature. |
| Data | None. No events API, no hostels, no database, no auth, no network layer beyond one hardcoded demo URL |
| Design | Default Material template, `app_name` = **"Rest"**, action bar menu, a floating button that does nothing |
| Tests | AndroidTest referencing `android.support.test.*` while the build uses AndroidX; imports `com.hostelawaygo.android.R`, which is never generated |
| CI | Travis, `cd myapplication`, targets `android-25` / build-tools 26 — dead |
| Leftovers | `java/`, `res/`, `manifests/`, `gen/`, `project.properties` — an old Ant/Eclipse project; no `.gitignore`; `local.properties` (a Windows SDK path) is committed |

**Build-breaking issues (for the record):**
- `EventsActivity` and the Espresso test reference `com.hostelawaygo.android.R`, but resources are generated under namespace `hostelawaygo.com.rest`. Won't compile.
- `activity_main.xml` / `content_main.xml` use `android.support.design.widget.*` and `android.support.constraint.ConstraintLayout` while the build is AndroidX + Jetifier. Jetifier rewrites binaries, not layout XML class names.
- Cleartext HTTP to a demo host: blocked by default on API 28+, and the greeting screen degrades to "Error / Could not load greeting."
- `Geocoder.getFromLocationName()` is a blocking main-thread call and has been deprecated since API 33 — ANR risk and no backend on many devices.
- `minSdkVersion 15` against `material:1.10.0`; `AsyncTask`; `onStart()` re-fires the network call every time.

**Verdict:** the code is worthless as a foundation. It is worth keeping as evidence of intent (someone wanted "events near me" in 2017 and got as far as a geocode).

**What's genuinely reusable:** the name. "HostelAwayGo" already says *hostel* + *movement* + *going somewhere*, which is precisely the product.

---

## 2. Market check — who is already here

I looked at the social/booking incumbents, the hostel-chain efforts, the traveller-lifestyle apps, and the city what's-on layer.

| Player | What they do | Overlap with your idea | Where they stop short |
|---|---|---|---|
| **Hostelworld** | Bookings + City Chats, hostel Chats, Linkups (hostel/traveller events), curated Events in 180+ cities, traveller profiles, travel plans | **Closest by far.** Owns "hostel social" globally | Events are their inventory and their opted-in hostels; social access is booking-gated or a paid **Social Pass**; one city at a time (switching city drops the old one); the city's own non-hostel events are not the product |
| **goSTOPS** (India chain) | Live "what's on at your hostel today" feed, join/start events from templates, per-event chat, hostel-wide chatroom | Validates the "live tonight" mechanic almost exactly | Single chain, India only, their own properties |
| **Backpackr** | Travel-buddy matching, nearby tab, free events & offers | Buddy-finding + events | Small, community-thin, not a city guide |
| **Nomadtable** | Traveller-posted activities nearby, trip chats (vendor claims 2M users) | Plans-first meetups | Generic travellers, not hostel-anchored; claims are self-reported |
| **Travello** | The largest traveller social app of the 2010s (acquired by TWAI in June 2025) | Social + activities | Pivoted to tours & activities OTA; social layer is legacy |
| **Meetup / Couchsurfing Hangouts / Bumble BFF / Timeleft** | Interest groups, right-now hangouts, matched dinners | Meeting people | Not travellers, not hostels, not a guide to what's on |
| **Time Out / Fever / Bandsintown / RA / Eventbrite / Google** | City what's-on, ticketed events | Breadth of city events | No hostel context, no solo-arrival lens, no "what's on in my 3 days here" |

**Data supply check (matters for feasibility):**
- **Ticketmaster Discovery API** — free, 5,000 calls/day, 230,000+ events across 8+ countries, deep paging capped at 1,000 results, price ranges largely dropped in 2025. Good for ticketed inventory.
- **Eventbrite** — public event search has been retired; effectively only your own organisation's events. Not a discovery source.
- **PredictHQ** — 100M+ events, sales-led contracts. Too expensive for v1.
- **Hostelworld Partner API** (official, affiliate) — property location search, availability, property info, referral links. This is the clean route to hostel metadata + affiliate booking revenue, rather than scraping.
- **Community events** — no API aggregates the open web. This is the part you have to earn, hostel by hostel and venue by venue. That is also why it's defensible.

**So: "nothing like it exists" is not true.** What is true is that **no one combines all hostels + all city events + here-and-next windows + a solo-arrival lens.** Hostelworld owns the booking relationship and the social graph; the aggregation, the independence from a single OTA's inventory, and the planning window are open.

---

## 3. Three ways to build it

### A. "The Guide" — consumer-first city event guide for travellers
Aggregate everything on in a city, tag it for hostel travellers, add "next stop" planning. Grow by SEO ("what's on in Lisbon this week"), social clips, hostel QR codes.

- **Pros:** clear value, easy to explain, content can start before the product.
- **Cons:** pure aggregation is a commodity; no supply lock-in; cold start on audience in every city.

### B. "The Noticeboard" — hostel-first tool that produces the consumer feed
Give independent hostels a 60-second way to publish tonight's dinner/crawl/walking tour, with a QR poster, an attendee list, and a shareable public page. That supply becomes the traveller feed, and the feed becomes the reason travellers open it.

- **Pros:** solves cold start on the hard side (supply); hostels are a *distribution channel* — every bed is an impression; creates defensible, licensed, first-party data Hostelworld doesn't have for independents; clear B2B revenue later.
- **Cons:** selling to low-tech, low-margin operators is slow; needs feet on the street in city one.

### C. "The Squad" — group trip coordination around events
Built for the 3–8 person group: vote on what to do, split up, meet back, one shared plan.

- **Pros:** underserved, groups are high-value, less moderation risk than DMs.
- **Cons:** groups plan in WhatsApp already; hard to win as a standalone; needs the event supply anyway.

### Recommendation: **B as the wedge, A as the surface.**
Supply-first, consumer-facing. Hostels create the data; travellers consume it; the guide is the reason to open the app twice a day. C becomes a feature ("Invite your group"), not a product.

**The product in one line:** *What's on where you are, and what'll be on where you're going — built for people sleeping in hostels.*

**The two windows** (the core of the UI):
- **HERE** — my city, my dates, right now. Tonight / tomorrow / rest of stay. Distance from my bed.
- **NEXT** — my next city, aligned to the exact days I'll be there, with a "your window" badge on events that fall inside my trip.

**Every card carries the traveller lens:** source badge (hostel / city / community / ticketed), price, walk time from my hostel, "good solo — 12 of 18 arrived alone", "back by midnight", "free", "sober-friendly", "women-only".

---

## 4. What v1 should be

| In v1 (one city, 6–8 weeks) | Explicitly out of v1 |
|---|---|
| Mobile web PWA, no install | Native iOS/Android apps |
| One city, rolling 4 weeks, ~200–300 curated events | Ten cities |
| Hostel portal: magic-link login, post tonight's event from a template, QR poster, attendee list | Full PMS integration, payments to hostels |
| Unified feed with source badges + filters | DMs / full chat (moderation cost) — use WhatsApp deep links |
| Trip object: city + dates → date-aligned feed | Full itinerary builder, maps routing |
| NEXT-city preview | Booking engine — link out to Hostelworld affiliate |
| "Who's going" (counts + first names) + Join | Ticketing / payments |
| Save, share, add-to-calendar | Reviews, reputation, gamification |

**Core loops**
1. *Traveller:* open → see tonight near me → join → meet people → tell the next person.
2. *Hostel:* post tonight in 60s → appears in every guest's feed and the city feed → event fills → staff see who's coming.
3. *Group:* "we're 5, what's on?" → shortlist → vote → one plan.

**North-star metric:** events joined per bed-night. Supporting: % of weekly actives who join ≥1 event; % of hostel-posted events that get ≥1 attendee; feed open rate on arrival day.

**90-day targets:** 15 hostels live, 300 events/4 weeks, 1,000 MAU, 25% weekly join rate, 40% of posted events get an attendee.

---

## 5. Data strategy

| Tier | Source | Method | Notes |
|---|---|---|---|
| 1. Ticketed | Ticketmaster Discovery API | Official free API | Good coverage in UK/IE/EU for concerts, sport, theatre |
| 2. Hostel | Independent hostels | **Self-serve portal** — the moat | Licensed, first-party, always fresh, not available from Hostelworld |
| 3. City/community | Venue sites, promoter pages, council open data, RA/Bandsintown where permitted | Structured extraction + human QA | Legal care: link out, don't republish full copy, respect robots/ToS |
| 4. Traveller | In-app posts | User-generated, moderated | Keeps the feed alive between hostel posts |

Every item carries `source`, `last_verified_at`, and a confidence level. **Freshness is the product** — a stale "what's on tonight" is worse than nothing.

---

## 6. Technology recommendation

**Rebuild as a web-first PWA. Do not continue the Android app.**

- Travellers arrive by QR code at a hostel reception with no signal and no patience. A web app opens in one tap; an APK does not.
- One codebase, every phone, instant updates — critical when you're iterating weekly in city one.
- SEO on "what's on in \<city\> this week" is free acquisition, and native apps can't do it.
- Later: wrap with Capacitor/Expo if push, offline or geofencing justify it. The API stays.

Suggested shape:

```
apps/web        Next.js (App Router) PWA — traveller feed, event pages, trip window
apps/console    Hostel portal — post event, QR poster, attendees, basic analytics
packages/db     Postgres + Prisma (Supabase or Neon), PostGIS for "near me"
packages/ingest Ticketmaster adapter, venue adapters, dedupe/entity resolution
```

Auth: magic link + Apple/Google. Maps: Mapbox or Leaflet. Hosting: Vercel + Supabase. Keep the old Android tree archived under `legacy/` or leave `master` alone and treat this branch as the new start.

---

## 7. Cold start — the part that decides it

Supply before demand, one city, density over reach.

1. **Pick one walkable city with a dense independent hostel scene and year-round solo flow.** Lisbon, Porto, Kraków, Budapest, Prague or Berlin. My pick: **Lisbon** — ~40+ independent hostels in a walkable core, strong nightly event culture, English-friendly, year-round.
2. **Recruit 10–15 hostels by hand.** Free forever for founding hostels; the pitch is narrow and true: *"Get more guests into your paid tours and your bar, and stop answering 'what's on tonight?' at reception."*
3. **Hand-curate the city layer for 4 weeks yourself** (plus Ticketmaster automation). Prove the feed is good before automating it.
4. **Distribute via QR posters and reception tablets**, not ads. Every bed is an impression; every hostel is a channel.
5. **Only then** add the second city — and only when city one hits the density bar.

**A cheap pre-step worth considering:** launch as a free weekly "what's on in \<city\>" page/newsletter built from public sources, no app at all. If it doesn't get shared by travellers, the app won't either. Costs a weekend, de-risks the whole thing.

---

## 8. Business model options

| Stream | When | Notes |
|---|---|---|
| Hostelworld affiliate commission | v1 | Official Partner API; natural "book a bed" CTA |
| Commission on paid events (pub crawls, tours, day trips) | v1–2 | 10–20%; hostels already sell these |
| Hostel Pro subscription | v2 | Featured placement, analytics, ticket sales, multi-night scheduling |
| Sponsored slots | v2 | eSIM, insurance, luggage, transport — must be clearly labelled |
| City/venue promoted listings | v3 | Promoters paying for reach to travellers |

Hostel ARPU is low, so the B2C side (affiliate + event commission) has to carry early revenue. Don't build the SaaS first.

---

## 9. Risks, honestly

| Risk | Severity | Mitigation |
|---|---|---|
| **Hostelworld adds city events + multi-city windows** | High | They're booking-first and inventory-bound; win on independents, breadth, and being the neutral layer. Move fast, own the hostels. |
| **Cold start / per-city network effects** | High | One city, supply-first, hand-recruited, QR distribution. Don't launch 5 cities. |
| **Stale event data destroys trust** | High | Self-serve posting + `last_verified` + "tonight only" emphasis + expiry |
| **Low-tech hostel operators** | Medium | 60-second composer, WhatsApp onboarding, do the first post *for* them |
| **Safety / trust in meetups** | Medium | No DMs in v1, verification, reporting, women-only and sober filters, clear "meet in public" guidance |
| **Legal — event data & privacy** | Medium | Licensed APIs first, link out, GDPR-clean, no scraping at scale without review |
| **Seasonality** | Medium | Year-round cities first; local-event layer keeps value in low season |
| **Unit economics** | Medium | Cheap stack, content-led acquisition, affiliate from day one |

---

## 10. Name

"HostelAwayGo" is fine and already points the right way, but it reads like a 2017 domain. Options that fit the "what's on" positioning better: **Bunkfeed**, **Noticeboard**, **Tonight, Here**, **Away**. My preference: keep **HostelAwayGo** as the company, ship the product as **"Away"** — short, works as a verb ("what's on Away tonight?"), and matches the two windows.

---

## 11. Decisions taken (31 Oct 2026)

| Question | Decision |
|---|---|
| Positioning | **Consumer-first city guide** — aggregate everything on, with a traveller lens and a hostel anchor |
| Platform | **Web-first PWA**, rebuilt from scratch; the Android tree is archived |
| First city | **Lisbon** |
| Next build | **Working vertical slice** — real database, seeded city, live join flow |

### What exists now

`apps/web` — Next.js 16 + SQLite, with:

- **HERE** feed for Lisbon: 12 seeded events across 4 days, grouped by day, server-rendered filters (`free`, `good solo`, `music`, `food`, `outdoors`, `nightlife`, `back by midnight`).
- **NEXT** window for Porto: 9 events, filtered against the trip's real arrival and departure times; 2 are correctly greyed out as outside the window.
- **Event detail** with the traveller lens, live attendee list from the `joins` table, join/leave toggle, directions and share.
- **Hostel posting** (`/post`): publish tonight's event in under a minute; it appears in the feed immediately.
- **PWA**: manifest, maskable icons, installable, conservative service worker.

Deliberately still missing: auth (single demo traveller), live ingest, chat, payments, booking. Each is a real decision, not an oversight — see `apps/web/README.md`.

---

## 12. Open questions for the next round

1. **Do we go supply-first now?** The slice proves the traveller surface. The harder question is whether to build the hostel portal and recruit 10–15 founding Lisbon hostels before adding more cities.
2. **How does event supply get in?** Ticketmaster API for ticketed inventory; the rest is manual curation and hostel self-serve. What do we automate first?
3. **Auth and identity** — magic link, or defer until after the first hostel is live with a shared login?
4. **Revenue test** — is Hostelworld affiliate the first thing to wire up, or commission on paid hostel events?

---

### Sources

- Hostelworld app features, Social Pass, City/Hostel Chats, Linkups, 14-day pre-check-in — [Hostelworld Social Pass](https://www.hostelworld.com/socialpass), [Google Play listing](https://play.google.com/store/apps/details?id=com.hostelworld.app), [App Store listing](https://apps.apple.com/py/app/hostelworld-hostel-travel-app/id348890820?l=en-GB), [Hostelworld blog](https://www.hostelworld.com/blog/what-is-hostelworld-the-ultimate-platform-for-affordable-stays/)
- Events in 180+ cities, noticeboard limited to top cities — [Hostelgeeks review](https://hostelgeeks.com/hostelworld-app-review/), [Hostelworld app features](https://www.hostelworld.com/blog/app-features/)
- Hostel Noticeboard launch (2016) — [Travel Daily News](https://www.traveldailynews.com/technology/hostelworld-launches-new-in-app-experience-hostel-noticeboard/)
- goSTOPS live in-hostel event feed — [App Store](https://apps.apple.com/us/app/gostops/id1538056051)
- Backpackr — [backpackr.org](https://backpackr.org/)
- Nomadtable claims — [nomadtable.app](https://nomadtable.app/blog/best-apps-to-meet-people-while-traveling)
- Travello acquisition — [Crunchbase](https://www.crunchbase.com/organization/travello-app), [PitchBook](https://pitchbook.com/profiles/company/159375-07)
- Event data APIs — [Keirolabs comparison](https://keirolabs.cloud/blog/best-api-for-event-data), [Ticketmaster Discovery guide](https://tickets.dev/guides/ticketmaster-discovery-api)
- Hostelworld Partner API — [partner-api.hostelworld.com](https://partner-api.hostelworld.com/)
