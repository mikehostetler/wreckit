# Session Notes


## [TEXT] 2026-01-28T19:27:00.133Z

NomNom “Signal Cards” (Birdeye) — PR Tranche for Amp Code
Goal

Upgrade only the center-feed cards (Price Action feed) so they feel like Dexscreener-grade signal, without turning NomNom into a full charting app.

Each center-feed card should show:

Token image (top-left, replaces NomNom logo on the card)

Token symbol/name + chain tag (SOL)

Price + % change by timeframe (5m / 1h / 6h / 24h)

Token 24h volume + token liquidity + txns + holders (minimum set)

Market-specific volume (NomNom volume) and optional market trades count

Expiry countdown / expiry timestamp

Chart:

If NomNom market exists: show token price chart with strike/threshold overlay (and optionally “NomNom implied prob” later)

If no NomNom market yet: show token chart + CTA “Create Market” (but NO auto-create)

Non-negotiables

No auto-create markets

Trending is discovery only; market creation is user-driven

Batch everything (no N+1 Birdeye calls per card)

Redis caching with sane TTLs

Do not break existing feed; feature-flag is fine if needed

Data Sources
Birdeye (primary for “signal”)

Use Birdeye for:

token price

price change (multi timeframe)

24h volume

liquidity

txns

holders

OHLCV candles (for chart)

Helius (optional fallback only)

Keep Helius only as fallback for token image/name/symbol when Birdeye doesn’t return it (or returns null/empty).

NomNom (market-specific)

Use your existing DB for:

market volume (SUM of trades)

market 24h volume

market trades count (optional)

expiry

snapshot + target/strike/threshold

PR 1 — Backend: Birdeye client + caching primitives
Deliverables

Add Birdeye API client module with:

request wrapper

retry/backoff (light)

timeout

structured logging

rate limit protection (concurrency + queue)

Redis cache helpers

Files

src/priceAction/birdeye.ts (new)

src/services/cache.ts or wherever Redis helpers live (extend if needed)

env:

BIRDEYE_API_KEY

BIRDEYE_BASE_URL default https://public-api.birdeye.so

Client requirements

Must support batch requests where Birdeye supports it; otherwise:

group calls by endpoint and run in parallel with p-limit concurrency

Cache keys:

birdeye:token:stats:<mint> TTL 15s

birdeye:token:candles:<mint>:<tf>:<window> TTL 30–60s

birdeye:token:meta:<mint> TTL 24h (if you use Birdeye for meta)

Use “stale-while-revalidate” pattern:

Serve cached immediately if present

Refresh in background if near-expiry (optional but ideal)

Acceptance

You can call Birdeye for a mint and get:

price + priceChange

volume/liquidity/holders/txns

OHLCV candles

Redis caches are being hit (log cache hit rate in debug)

PR 2 — Backend: Token “Stats Bundle” API (batch)
Goal

Frontend needs one endpoint to fetch everything needed for rendering the enriched cards.

Endpoint
POST /v1/tokens/stats-bundle

Body

{
  "mints": ["So11111111111111111111111111111111111111112", "..."],
  "timeframes": ["5m", "1h", "6h", "24h"],
  "chart": { "timeframe": "6h" }
}


Response

{
  "tokens": {
    "<mint>": {
      "mint": "<mint>",
      "symbol": "BONK",
      "name": "Bonk",
      "image": "https://...",
      "price": 0.0000123,
      "marketCap": 12345678,
      "liquidityUsd": 123456,
      "volume24hUsd": 987654,
      "txns24h": 4321,
      "holders": 123456,
      "changes": {
        "5m": -1.2,
        "1h": 4.8,
        "6h": 22.1,
        "24h": 120.4
      },
      "chart": {
        "timeframe": "6h",
        "candles": [
          { "t": 1730000000, "o": 0.01, "h": 0.012, "l": 0.009, "c": 0.011, "v": 1234 }
        ]
      },
      "source": "birdeye"
    }
  }
}

Implementation details

Accept up to 50 mints per request (you only need 25 trending + what’s in feed)

Return tokens keyed by mint for easy lookup

If a token fails, include it with error field; do not fail the whole response

Performance rules

Request-level concurrency cap (ex: 😍

Per-endpoint concurrency cap (ex: 4)

Cache-first always

Acceptance

Single bundle call supports rendering a full feed page without per-card token fetches

PR 3 — Backend: Trending runners endpoint (top 25) using Birdeye
Goal

## [TEXT] 2026-01-28T19:27:00.487Z

You decided: don’t auto-create, just present trending.

Endpoint
GET /v1/tokens/trending?limit=25

Response is normalized into your TokenCardModel shape:

{
  "runners": [
    {
      "mint": "...",
      "symbol": "...",
      "name": "...",
      "image": "...",
      "price": 0.01,
      "changes": { "5m": 1.1, "1h": 8.2, "6h": 30.5, "24h": 200.0 },
      "volume24hUsd": 123456,
      "liquidityUsd": 65432,
      "txns24h": 999,
      "holders": 12345
    }
  ]
}

Caching

Cache the whole trending response birdeye:trending:25 TTL 15–30s

Acceptance

Trending list loads fast and is stable (no giant swings from caching jitter)

PR 4 — Backend: Market-volume aggregation helpers (fast, scalable)
Problem

Computing volume on the fly from raw trades will get expensive as volume grows.

Deliverable (choose the simplest “good” approach)
Option A (recommended): lightweight aggregates table

Create table market_volume_agg:

market_id

volume_total_usdc

volume_24h_usdc

trades_total

trades_24h

updated_at

Update it via:

cron job every 1–5 minutes

or append-trigger style worker (later)

Option B: materialized view (if you prefer)

MV refreshed periodically

Acceptance

Feed endpoints can query market volume without scanning trades tables

PR 5 — Backend: Upgrade Price Action feed payload to include token mint + market overlays
Goal

Your FE card needs to know:

token mint

market state (exists, launched)

expiry

strike/threshold

snapshot value/time

market volume (from agg)

Endpoint touched

GET /v1/price-action/feed (path: src/priceAction/routes.ts:200)

Add fields per item
{
  "marketId": "...",
  "mint": "...",
  "assetClass": "MEME",
  "templateId": "DOWN_PCT",
  "expiryTs": "...",
  "countdownSec": 12345,
  "snapshot": { "value": 0.01, "ts": "..." },
  "target": { "thresholdPct": 20.0, "strike": null },
  "marketVolume": { "total": 1234.56, "h24": 123.45, "tradesH24": 99 },
  "hasLaunched": true
}

Acceptance

Frontend can render all “NomNom-specific” overlays without extra API calls

PR 6 — Frontend: Enrich GlassPriceActionCard UI (ONLY center cards)
You said:

“don’t change anything but the cards in the center feed.”

So we only touch:

src/components/glass/GlassPriceActionCard.tsx

Must not touch:

nav

right rail

overall layout

other card components unless required

New card layout (keep glass aesthetic)
Header row

Left:

Token image (circle, 28–32px) replaces NomNom logo in-card

$SYMBOL + small subtitle (MEME, STOCK, etc.)

Right:

expiry countdown pill: ⏱ 19h 40m or Expired

optional: “Open chart” icon button

“Signal strip” row (Dex-like)

A compact row of pills (subtle glass chips), max 6, responsive wrap:

PRICE $0.0123

5M -3.7%

1H +12.5%

6H +55.1%

24H +120.4%

VOL $2.3M (token volume)

LIQ $180K (if room)

TXNS 4,981 (if room)

HOLDERS 569 (if room)

Rule: always show Price + 1H + 24H + VOL. The rest collapse based on width.

Chart area

If hasLaunched:

render token chart candles/line for timeframe default 6h

overlay:

a “target line” (strike or threshold marker)

label “Target: -20%” or “Target: $12.5M”
If not launched:

render token chart only

show CTA button: Create market (goes to your existing create flow, prefilled)

Footer

Show:

NomNom Vol (24h): $X (from agg)

optionally Market trades (24h): N
Keep social actions row as-is (like/rt/comment/share)

Data wiring

In feed-view.tsx, do NOT fetch per-card.
Instead:

gather mints from the feed response

call POST /v1/tokens/stats-bundle once

pass tokenStats[mint] into each GlassPriceActionCard

Acceptance

Center feed cards show all requested token metrics

Charts render fast and don’t stutter scroll

No “mid sparkline”: real candles or sufficiently-sampled line

PR 7 — Frontend: Filter & Sort additions (minimal changes)

You already have Filter & Sort UI; just add options.

Add filters (only within existing modal)

Timeframe selector for chart: 1H / 6H / 24H

Sort options:

Most token volume (24h)

Most NomNom market volume (24h)

Biggest 24h mover

Ending soon

New

Backend support:

## [TEXT] 2026-01-28T19:27:00.497Z

If sort requires backend ordering, pass sort= into /v1/price-action/feed

Keep defaults unchanged

Acceptance

Filter options update feed ordering without breaking current UX

Chart quality guidelines (so it looks premium, not mid)

Default chart timeframe: 6H

Candle interval (suggested):

1H view → 1–2m candles

6H view → 5m candles

24H view → 15m candles
If Birdeye response is too heavy:

return only needed candles (cap at ~120 points)

downsample on backend if necessary (never on frontend per-render)

Feature flag (optional but recommended)

Add env flag:

FEATURE_SIGNAL_CARDS=true
So you can toggle in prod safely.

Final acceptance checklist

 Price action feed loads with one token bundle request (no N+1)

 Cards show: token image, timeframe % changes, token vol/liquidity/txns/holders, NomNom market volume, expiry, chart

 No auto-create; trending is display only

 Redis cache hit rate is high; Birdeye calls are bounded

 UI remains glassy and consistent with current design system
