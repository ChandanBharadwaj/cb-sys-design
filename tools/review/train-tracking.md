# train-tracking review

- **New page:** Live Train Tracking (Offline), modelled on Where Is My Train. It has 11 sections and a "Start here" intro (3 frames: server status → no signal → offline pack plus cell IDs), 5 scenarios, 4 knobs, 12 interview questions, 3 snippets and 10 sources. Related pages: ride-sharing, proximity-service, irctc-booking, notifications, cdn, stream-analytics.
- **Fact vs our design:** Google has not published the locator. The page attributes only these points to sources:
  - offline cell-tower tracking with timetables on the phone (YourStory 2018, Wikipedia);
  - anonymised location data from users (Wikipedia);
  - the speedometer GPS traces reused to build the cell mode, with no official tower data (founder interview, Indian Notes);
  - cell-mode accuracy of "a few km", near-GPS close to stations (same interview);
  - the acquisition in Dec 2018 with 10M+ downloads; the price was undisclosed, and the $30–40M figure is reported only as unconfirmed (VentureBeat, YourStory, Business Standard);
  - Google Maps live train status in Jun 2019, built with Sigmoid Labs (MediaNama);
  - RTIS in Sep 2022: 2,700 locos in 21 sheds, 6,000 more planned, 30 s mid-section updates, data to NTES through CRIS (ThePrint, Ministry statement);
  - the iOS listing by Google LLC (App Store). The launch month is hedged because reports say both Jun and Nov 2025.

  Everything else is labelled **our design**: the tower→segment table, the HMM/Viterbi locator, the anonymiser rules, versioned packs with deltas, the k-trip floor and the per-train status cache. The architecture title says "(our design)".
- **Estimates:** All calculator inputs are labelled estimates, including about 68K route km. Knob battery, data and learn-time figures are labelled illustrative in the knob intro.
- **Widget (real mechanism):**
  - Crowd trips (random sub-journeys, GPS fixes about 35% of the time) are map-matched to 0.5 km segments and counted into a P(cell | segment) table.
  - The phone runs an HMM forward filter. Prediction is forward motion around the timetable section speed, with extra stop mass near stations. The emission comes from the table; unknown cells and no service mean predict only.
  - The page shows the median and a 90% band, the true train, the serving cell plus the stretch the learned map links to it, the last 4 cells, the ETA to the next station (estimate vs true), and the delay vs the timetable.
  - Modes are GPS / cell / no signal. The map can be built from 2, 20 or 200 trips (cold start), and a "+5 min" button keeps it usable with reduced motion.
- **Widget results (Node harness, 5 runs each):**

  | Mode / map | Median error | p90 error | Median band |
  |---|---|---|---|
  | Cell mode, 20 trips | 0.35 km | 0.8 km | 2.5 km |
  | Cell mode, 2 trips | 0.95 km | 2.9 km | 8 km |
  | GPS | ≈ 10 m | – | – |

  In no-signal mode the band grows by about 1 km per 10 min.
- **Phone:** `draw(narrow)` uses a 360-wide viewBox with 14-unit text and no km labels, and is rebuilt through `ctx.onResize`. The checker reports min 13.2 px and p25 13.2 px. In the first screenshot the serving-cell label overlapped the belief baseline; it now sits below the baseline.
- **Code checks:**
  - **Python** Viterbi: run with Python 3.12, and the output matches the comments ([1] alone; [4, 6, 7, 8] with history).
  - **SQL:** run on a throwaway Postgres 16 with seeded pings. The stray pair, the 400 m fix and the 2-trip cell were excluded, and the unknown-cell report listed that cell.
  - **Java** PackController: compiles cleanly with `javac --release 21 -proc:none -Xlint:deprecation,removal` against the Spring Boot 3.5.16 classpath. Only imports and a package were added for the compile.
- **Not verified:** the founder interview text is used as given in the research brief, because the article did not surface in my searches. The 30 s RTIS interval comes from PIB-based coverage in search snippets.
