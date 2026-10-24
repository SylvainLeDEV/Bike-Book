# GPS and activity integrations

Research done on **2026-10-24**. This area moves fast: Garmin changed its developer program
three days before this was written. Re-check before building anything.

Context: Garmin records every ride, and Komoot is only used for planning (D-04). Nothing may be
exposed to the Internet (D-09), which rules out anything that needs a public webhook.

## Summary

| Provider | Used? | Public API? | Access for an individual | Delivery | Verdict |
|----------|--------------|-------------|--------------------------|----------|---------|
| **Garmin Connect** | Yes, records everything | **Yes, since 2026-10-21: "Personal" tier** | Free personal key created in Garmin Connect, no approval (**Secondary**) | Pull only, read-only | ✅ Phase 2 target |
| Komoot | Planning only | **No** (**Verified 2026-10-24**) | — | — | ❌ Not needed |
| Strava | No | Yes | A paid Strava subscription is required to create an app; new apps only see their owner's data | Pull, plus webhooks that need a public URL | ⏸ Only if I ever start using Strava |
| Apple Health | No | No web API: HealthKit data stays on the iPhone | Native iOS app required | On the device | ❌ Not planned |
| intervals.icu | No | Yes (personal API key) | Free account, key in its settings (**Secondary**) | Pull | Plan B hub for Garmin data |
| Bosch eBike Flow | Yes (e-bike) | No (partner platform only) | — | — | Manual readings in the MVP |
| Wahoo, Polar, Suunto, Coros | No | Not checked | — | — | Not checked (not used) |

## Garmin

### Official API: the "Personal" tier (new)

**Timeline (Secondary, several outlets):** Garmin stopped accepting new applications to its
Connect Developer Program in March 2026, citing a "redesign and modernisation" of the program.
It reopened it on **2026-10-21** with three tiers: Personal, Starter and Enterprise.

**What Garmin's own page says (Verified 2026-10-24, developer.garmin.com):**

- A "Personal" track exists, offering "secure access to your own Garmin Connect data for
  individuals".
- How it works: "Log in to the Garmin Connect website to retrieve your personal API key and
  generate access tokens".
- Data: activity, health and women's health.
- Delivery: "Pull only".

**Garmin's official client (Verified 2026-10-24):** the `garmin` GitHub organisation publishes
`connect-personal-api-python` (Apache-2.0, "Copyright 2026 Garmin Ltd."). Endpoints it uses:

| Endpoint | Purpose |
|----------|---------|
| `GET /activitylist-service/activities/search/activities?start={start}&limit={limit}` | Activity list, offset pagination, optional date and type filters |
| `GET /activity-service/activity/{activity_id}` | Activity details |
| `GET /download-service/files/activity/{activity_id}` | Download (a ZIP) |

The repository gives neither the base URL nor any rate or date-range limits; it points to
Garmin's Swagger reference for the full list.

**Reported by the press and developers (Secondary):**

- Free, with no application and no approval.
- Key lifetime chosen at creation: 30, 90 or 180 days, or 1 year. The key is shown only once.
- The key is exchanged for an access token valid 24 h. There are no refresh tokens: a new
  token is minted from the key.
- Read-only. Includes JSON summaries and FIT files for activities.
- Garmin strips some fields it considers proprietary from FIT files served by the API
  (VO2 max, recovery time…). This does not matter for Bike-Book.
- Not included: the Training and Courses APIs (sending workouts or routes to the device) and
  push notifications. Bike-Book needs neither.
- Key page reported at `https://connect.garmin.com/app/settings/personalApiToken`
  (**Unverified**, from a third-party guide).
- Terms as summarised by third parties (**Unverified**): personal use only, the key must not be
  shared, no service built on other people's keys.

**Still uncertain (test in spike 2.0):**

1. **How far back history goes.** Sources disagree: Tredict says the Personal API only returns
   current activities, while a third-party guide says history goes back to the first activity
   and that any FIT file can be downloaded regardless of age. This decides whether the
   counters can be rebuilt from the bikes' past rides.
2. **Rate limits.** Not published for the Personal tier.
3. **Gear** (the bike assigned in Garmin Connect). No official endpoint is known. A reader
   reports a gear ID in FIT message 526 (**Unverified**).
4. **AI use of the data** (phase 3). Not covered by anything found. Read Garmin's supplemental
   terms when creating the key.
5. **Price stability.** Business tiers start charging by 2027-04-01 (Enterprise entry fee of
   US$1,000, Starter free up to 1,000 users, per DC Rainmaker). Nothing has been announced for
   Personal. Garmin's program agreement allows fees on 30 days' notice (tryterra, about the
   business program).
6. **Continuity.** The program was closed for about seven months in 2026. The integration must
   degrade gracefully, and FIT file upload covers that.

Business tiers (not for this project): Starter is push-only (it needs a public HTTPS endpoint,
which D-09 rules out) and requires a public website and a published privacy policy; Enterprise
is paid (**Secondary**).

### Unofficial libraries

- **garth** was deprecated after Garmin changed its login flow in March 2026; its final release
  is dated 2026-03-28 (**Secondary**).
- **python-garminconnect** dropped garth in 0.3.0 and now runs its own mobile SSO flow.
  Version 0.3.20 was released on 2026-10-23 (**Verified 2026-10-24**, PyPI). It needs the
  Garmin password (and MFA), keeps long-lived tokens, and has gear endpoints.
- Risks: it sits in a grey zone of Garmin's terms. Users report HTTP 429 errors and accounts
  blocked for more than 48 h after failed logins (**Secondary**: GitHub issues, Garmin forum).
  Garmin can break it at any time without notice.
- No equivalent Node.js library was checked.

**Verdict:** not recommended now that an official personal path exists. Only conceivable for
the gear information, if it turns out to be missing from the official API and the risk is
accepted.

### Manual export (always available)

- "Export original" (FIT) on each activity in Garmin Connect, a full account export, or a USB
  copy from the device. The5krunner reports that manual exports kept working during the 2026
  pause (**Secondary**).
- This is phase 2.1 (FIT upload): it does not depend on any API.

### Hub alternative: intervals.icu

- A free personal API key (Settings → Developer Settings), used with basic auth and the literal
  username `API_KEY`. It syncs from Garmin Connect and serves FIT files (**Secondary**: intervals.icu
  forum and documentation).
- Its Strava sync is reported as limited to paying users, which does not matter here.
- **Verdict:** plan B if the Garmin Personal API disappoints, at the cost of one more account
  and one more dependency.

### Bike park on Garmin

- **Edge MTB** (June 2025): its "Downhill" ride profile records a run each time a descent ends,
  so shuttle or chairlift rides do not distort the stats, and it records GPS at 5 Hz on descents
  (**Secondary**: Garmin press release relayed by Bicycle Retailer and retailers). FIT laps
  could then give the run count and the descent time directly.
- **Reference device: Edge 540 or 840 (D-16).** The Downhill, Enduro and E-Enduro profiles were added
  to the Edge 1050 by firmware 28.20; the changelog items shared with the 540/840 do not include
  them, and no 2026 note adding them was found (**Secondary**: the5krunner, gpsradler). The x40
  units also reportedly lack 5 Hz GPS. Workaround: press the lap button at the top of each run,
  so FIT laps give runs and descent time.
- Without per-run laps: detect descents from altitude and speed in the FIT stream. Probably
  workable (**Estimate**), to validate on real files.

### How a ride gets the right bike

Rules in order of priority:

1. The gear ID, if the API or the FIT file provides it. Gear is set on every activity (D-17),
   so this is the key question of the spike. If the official API lacks it, python-garminconnect
   has gear endpoints, with the risks listed above.
2. The activity type, e.g. downhill → DH bike, gravel → gravel bike.
3. The device, e.g. the Edge MTB lives on the enduro bike.
4. The current bike for that activity type.

When confidence is low, the activity waits in the inbox for confirmation. The bike can always
be changed afterwards, and counters follow.

## Komoot

- **Verified 2026-10-24:** Komoot's support article "komoot API" (updated 2026-09-23) states:
  "Komoot does not provide a publicly accessible API." Komoot only integrates with selected
  device and wearable makers (Garmin, Bosch, Suunto…).
- Owned by Bending Spoons since March 2025, followed by layoffs and a redesign (**Secondary**).
- Unofficial: the web app's internal API could be reverse-engineered, but that breaks the terms
  and can break at any time. No.
- **Verdict:** not needed. Rides are recorded on the Garmin (D-04), and Komoot tours already
  reach the Garmin through Komoot's official Garmin integration. If a planned tour is ever
  useful in Bike-Book, a manual GPX export is enough.

## Strava

- **Verified 2026-10-24 (developers.strava.com):**
  - Public REST API with OAuth 2.
  - "A Strava subscription is a prerequisite for creating an app."
  - New apps start in "Single Player Mode" (athlete capacity of 1: only the owner's data),
    which would be enough for Bike-Book.
  - Rate limits: 200 requests per 15 minutes and 2,000 per day overall; 100 per 15 minutes
    and 1,000 per day for reads. Limits reset at each quarter hour and at midnight UTC.
  - During development the callback domain can be `localhost` or any domain.
- **Secondary:** the November 2024 API agreement allows showing a user's data to that user
  only, and bans using API data to train AI or ML models. An update dated 2026-06-01 no longer
  supports intermediary platforms and asks developers using the data in AI to seek written
  guidance.
- Webhooks (new activity events) need a callback URL that Strava can reach from the Internet,
  which D-09 rules out; polling would replace them (**Assumption**, based on how webhooks work).
- Strava activities carry a `gear_id` (Strava "gear" = bikes): known from the API reference,
  not re-checked today.
- **Verdict:** not used. It would only make sense for riders who use Strava (Garmin →
  Strava auto-upload), and it would cost a subscription.

## Apple Health

- **Verified 2026-10-24 (Apple documentation):** the device stores all HealthKit data locally,
  and every app needs explicit per-type permission from the user.
- There is no server or web API: only a native iOS app can read the data (**Secondary**:
  developer guides).
- Possible bridges: a native companion app (Swift, with an Apple Developer Program membership
  for durable installs), or a third-party export app that posts to an HTTP endpoint
  (**Unverified**).
- **Verdict:** not planned. Garmin already has the rides, and the iPhone is a secondary device
  (D-02).

## Bosch eBike Flow (e-bike, D-19)

- No public API was found. Bosch offers a "Connected Biking" platform with cloud APIs for
  partners (manufacturers, app developers, fleets), subject to rider consent (**Secondary**:
  Bosch press material).
- Community tools (a Homey app, an MCP server) read odometer, motor hours and charge cycles from
  the Bosch cloud with the rider's account. They are unofficial and can break at any time; some
  fields need EU Data Act access (**Secondary**).
- **Verdict:** readings typed by hand in the MVP (`readings` table). Re-check later whether the
  EU Data Act opens an official access for owners.

## Not checked

Wahoo, Polar (AccessLink), Suunto and Coros were not researched because they are not used.

## Sources (accessed 2026-10-24)

Garmin:

- [Garmin Connect Developer Program — overview](https://developer.garmin.com/gc-developer-program/overview/) (official)
- [garmin/connect-personal-api-python](https://github.com/garmin/connect-personal-api-python) (official client)
- [DC Rainmaker — Garmin revamps and opens up Connect Developer API program (2026-10-21)](https://www.dcrainmaker.com/2026/10/garmin-connect-api-revamps-connect-developer.html)
- [the5krunner — Garmin Personal API key 2026 (2026-10-22)](https://the5krunner.com/2026/10/22/garmin-personal-api/)
- [the5krunner — Garmin freezes developer API (2026-09-14)](https://the5krunner.com/2026/09/14/garmin-developer-api-access-paused/)
- [Terra — Garmin's Connect Developer Program is paused](https://tryterra.co/blog/garmin-connect-developer-program-pause)
- [Tredict — Garmin Personal API (2026-10-21)](https://www.tredict.com/blog/garmin_personal_api_chatgpt_and_claude/)
- [Third-party guide — Garmin Personal API](https://shapecalendar.com/guides/garmin-personal-api)
- [ride-optimizer issue #607 — porting from garth to the Personal API](https://github.com/e2kd7n/ride-optimizer/issues/607)
- [PyPI — garminconnect](https://pypi.org/project/garminconnect/)
- [python-garminconnect issue #332 — March 2026 login change](https://github.com/cyberjunky/python-garminconnect/issues/332)
- [Garmin forum — persistent 429, account blocked 48 h+](https://forums.garmin.com/developer/fit-sdk/f/discussion/435087/persistent-429-on-api-login-account-blocked-for-48-hours/2029273)
- [ghurt — Why Garmin has no personal API (promotional, 2026-07-15)](https://ghurt.org/garmin-api-for-personal-use)
- [garmin/fit-javascript-sdk](https://github.com/garmin/fit-javascript-sdk) (`@garmin/fitsdk` on npm)
- [Bicycle Retailer — Garmin Edge MTB (2025-06-17)](https://www.bicycleretailer.com/new-products/2025/06/17/garmin-offers-its-first-mountain-bike-specific-head-unit-edge-mtb)

- [the5krunner — new features for Edge 540/840/1040/1050 (2025-05-07)](https://the5krunner.com/2025/05/07/new-features-added-for-edge-540-840-1040-1050-and-a-promise/)
- [gpsradler — Edge firmware 32.20 for the x50 generation](https://gpsradler.de/news/garmin-edge-firmware-32-20-update/)

Bosch:

- [Bosch press — eBike Systems expands digital offerings](https://www.bosch-presse.de/pressportal/de/en/bosch-ebike-systems-expands-digital-offerings-for-ebike-manufacturers-266871.html)
- [Homey community — Bosch eBike app (unofficial)](https://community.homey.app/t/app-pro-bosch-ebike-monitor-your-bosch-smart-system-ebike-in-homey/154269)

Komoot:

- [Komoot support — komoot API](https://support.komoot.com/hc/en-us/articles/10331570510618-komoot-API)
- [DC Rainmaker — Komoot acquired (2025-03)](https://www.dcrainmaker.com/2025/03/komoot-acquired-history-says-this-wont-end-well.html)
- [heise — After sale and redundancies: Komoot gets a fresh design](https://www.heise.de/en/news/After-sale-and-redundancies-Komoot-gets-a-fresh-design-10644247.html)

Strava:

- [Strava — Getting started](https://developers.strava.com/docs/getting-started/)
- [Strava — Rate limits](https://developers.strava.com/docs/rate-limits/)
- [the5krunner — Strava issues clarification (2024-11-20)](https://the5krunner.com/2024/11/20/strava-issues-clarification/)
- [TechRepublic — Strava tightens API access (2026)](https://techrepublic.com/article/news-strava-api-scraping-crackdown)

Apple Health:

- [Apple — Protecting user privacy (HealthKit)](https://developer.apple.com/documentation/healthkit/protecting-user-privacy)
- [Open Wearables — Apple HealthKit API: what data you can access](https://openwearables.io/blog/apple-healthkit-api-what-data-you-can-access-and-how)

intervals.icu:

- [intervals.icu — Open API](https://www.intervals.icu/features/open-api/)
- [intervals.icu forum — API access](https://forum.intervals.icu/t/api-access-to-intervals-icu/609)
