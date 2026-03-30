# AI SparkLine

Team usage dashboard backed by the Cursor Team Admin API.

## What this dashboard answers

- Favorite model per user for a selected window
- Usage per user for a selected window
- Productivity per user for a selected window
- Agent efficiency per user for a selected window
- Tab efficiency per user for a selected window
- Adoption per user for a selected window

## Metric definitions

- Favorite model: most-frequent `mostUsedModel` across daily usage rows in the selected window
- Usage: total AI requests (`agentRequests + composerRequests + chatRequests + cmdkUsages`)
- Productivity: `(acceptedLinesAdded + acceptedLinesDeleted) / (agentRequests + composerRequests + chatRequests)`
- Agent efficiency: `totalAccepts / agentRequests`
- Tab efficiency: `totalTabsAccepted / totalTabsShown`
- Adoption: active days in month / days in month

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Open `http://localhost:3000`.

## API route

- `GET /api/team-metrics?window=past-7d`
- Supported windows include `past-7d`, `past-30d`, `current-month`, and prior calendar months returned by the API

## Notes

- Cursor `/teams/daily-usage-data` supports max 30-day range per request. This app chunks longer windows automatically.
- Usage events are paginated, date-chunked, and merged automatically.
