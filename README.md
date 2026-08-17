# Doppler API Probe

Diagnostic tool for investigating intermittent `ECONNRESET` errors when calling the Doppler API from Vercel serverless functions through Cloudflare.

## What it does

Deploys as a Vercel app and makes requests to the Doppler secrets download API endpoint using two different HTTP clients:

- **https** -- uses the Node.js `https` module directly for socket-level diagnostics (DNS, TCP connect, TLS handshake timing, socket reuse detection, remote IP)
- **fetch** -- uses the standard `fetch` API to mirror typical application code, with `undici` diagnostics channels to passively capture socket info

Each probe captures:

- Full request timing breakdown (DNS, connect, TLS, TTFB, total)
- Socket info (remote IP/port, local port, reuse status)
- Cloudflare metadata (Ray ID, colo, `cf-mitigated` header)
- Vercel host fingerprint (region, hostname, `x-vercel-id`)
- Optional egress IP lookup (the function's actual outbound IP)

Results are displayed in a live dashboard with:
- Sortable/filterable results table with expandable row detail and column tooltips
- Summary cards (success/failure rate, failure streaks, avg timing with p95)
- Rollup cards for CF colo, remote IP, Vercel region, response status, container host, and egress IP
- Error-specific rollup cards (errors by colo, remote IP, client type) -- only shown when errors exist
- CF-Mitigated alert when Cloudflare DDoS/WAF mitigation is detected
- Charts: TTFB distribution histogram (stacked by client), error rate over time, error type breakdown

All data stays in your browser. Optional localStorage persistence (up to 5000 results). Export to JSON or CSV for sharing with support.

## Why this exists

The tool needs to run **inside your Vercel project's infrastructure** to be useful. Requests originate from your Vercel deployment's egress IPs -- the same IP pool your production code uses. Running this from a different Vercel project or locally won't reproduce issues tied to your specific egress path.

## Deploy

1. Fork or clone this repo
2. Create a new Vercel project from it
   - Framework preset: **Next.js**
   - Build and output settings: defaults (no changes needed)
3. Set the **Node.js version** to **24.x** in Settings > General
4. Add the environment variable:

   | Name | Value |
   |------|-------|
   | `DOPPLER_TOKEN` | Your Doppler service token (read-only is fine) |
   | `PROBE_PASSWORD` | Password to access the dashboard (optional -- if unset, no auth) |

5. Deploy

## Usage

### Burst mode
Fire a batch of requests at once. Configure count (max 50) and concurrency (max 10). Good for stress-testing the path.

### Polling mode
Fire requests at a regular interval (min 5 seconds) while the tab is open. Good for passively catching intermittent failure windows -- leave it running overnight.

### Config options

- **Timeout** -- request timeout in milliseconds (default 30000)
- **Keepalive** -- controls the `Connection` header on https client requests
- **Egress IP** -- when enabled, each probe calls `checkip.amazonaws.com` to capture the function's outbound IP (adds ~50ms per probe, off by default)
- **Client** -- choose https, fetch, or both
- **Persist** -- save results to localStorage so they survive page refreshes

### When failures occur

1. Note the timestamps and duration of the failure window
2. Check: does it self-heal after a consistent period? (suggests time-windowed DDoS mitigation)
3. Check the CF-Mitigated column -- if populated, Cloudflare is actively mitigating traffic from your egress IPs
4. Enable Egress IP to see if failures correlate with a specific outbound IP
5. Expand failed rows to see the full Vercel host fingerprint (region, hostname, request ID)
6. Export the data (JSON has full detail, CSV is good for spreadsheets)
7. Share the export with Doppler support along with the failure timestamps

### What to look for

- **Error code**: `ECONNRESET` vs `ETIMEDOUT` vs other -- tells us what's actively happening
- **Phase**: where in the connection lifecycle the failure occurs (DNS, connect, TLS, request, response)
- **CF-Mitigated**: if present, Cloudflare is applying DDoS/WAF/rate-limiting mitigation
- **CF-Colo**: if the Cloudflare colo changes during failure windows
- **Remote IP**: if failures correlate with a specific Cloudflare edge IP
- **Egress IP**: if failures correlate with a specific Vercel outbound IP
- **Hostname**: if failures cluster on a specific container instance (shown as internal 169.254.x.x address)
- **Streak pattern**: continuous failures that self-heal suggest time-windowed mitigation

### Testing from a different Vercel region

If you suspect the issue is specific to the IAD (US East) egress IP pool, you can change the function region in `vercel.json`:

```json
{
  "regions": ["sfo1"]
}
```

If errors stop in a different region, that isolates the problem to the original region's egress IPs.

## Password protection

When `PROBE_PASSWORD` is set, all routes are protected behind a login page. The session is stored in an httpOnly cookie that expires after 7 days. A logout button is available in the page header.

When `PROBE_PASSWORD` is not set, the app is open with no authentication (convenient for local development).

## Local development

```bash
npm install
cp .env.example .env.local  # add your DOPPLER_TOKEN and optionally PROBE_PASSWORD
npm run dev
```

## Tests

```bash
npm test
```
