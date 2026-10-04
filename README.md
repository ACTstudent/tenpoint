# Tenpoint

Simple NPS surveys for small teams. Ask customers one question ("How likely are you to recommend us?"), read every answer, and watch the score move month by month. Teams leaving GetFeedback (retiring December 31, 2026) or Delighted (closed June 30, 2026) can import their history, and every answer keeps its original date.

## What it does

- **Three ways to ask.** A survey link, a row of 0 to 10 buttons for your own emails, and a widget for your site (one script tag).
- **Email clicks count straight away.** Clicking a number in an email records the score. Adding a reason or changing the score later updates the same answer rather than counting it twice.
- **Results.**
  - NPS for 30 days, 90 days, 12 months or all time, compared with the period before.
  - The split between promoters, passives and detractors.
  - A 12-month trend and a chart of how many answers each score got.
  - Every comment, filtered by group, source or "with comments".
- **Import.** Upload a CSV from GetFeedback, Delighted or a spreadsheet.
  - It finds the score, comment, email and date columns, and you get a preview in the browser before anything is sent.
  - Importing the same file twice is blocked, and each import can be undone.
- **Slack alerts.** Each new answer is posted to a channel through an incoming webhook. Score-first answers (email clicks, the widget) wait 90 seconds for a comment, so Slack gets one message instead of two.
- **CSV export** of every answer.
- **Your name and colour** on the survey page and the widget.

## Run it

You need Node.js 22.13 or newer. There are no npm dependencies: the database is Node's built-in `node:sqlite`.

```sh
npm start          # http://localhost:3000
npm test           # unit and end-to-end tests
npm run seed       # optional: a demo account with a year of sample answers
```

`npm run seed` prints the demo login. Set `DEMO_PASSWORD` to choose the password and `DATABASE_PATH` to choose the database file.

### Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `DATABASE_PATH` | `./data/tenpoint.db` | SQLite file. Keep it on a persistent disk. |
| `BASE_URL` | the request's host | Public address used in share links, email buttons and the widget code, e.g. `https://tenpoint.example.com` |
| `TRUST_PROXY` | off | Set to `1` behind a proxy or load balancer so client IPs and `https` are read from `X-Forwarded-*` |
| `SECURE_COOKIES` | on when `BASE_URL` is `https` | Set to `1` or `0` to force it |

## Deploy

Tenpoint is one Node process and one SQLite file, so it needs a host with a **persistent disk**. Vercel and other serverless platforms won't work, because their file systems are wiped between requests.

Hosts that work, using the included `Dockerfile` or `npm start`:

- **Render.** Create a Web Service, then add a Disk mounted at `/data`.
- **Railway.** Add a volume mounted at `/data`.
- **Fly.io.** Create a volume and mount it at `/data`.
- **Any VPS.** Run `node server.js` behind Caddy or nginx.

Whichever you use, set:

- `DATABASE_PATH=/data/tenpoint.db`
- `BASE_URL=https://your-domain`
- `TRUST_PROXY=1`

Back up the database file regularly. Because the database runs in WAL mode, include the `-wal` file, or use `sqlite3 tenpoint.db ".backup copy.db"`.

## Embedding

The Share tab gives you all three snippets. The widget looks like this:

```html
<script src="https://your-domain/widget.js" data-survey="SURVEY_ID" async></script>
```

- `data-delay="5"` sets the number of seconds before the widget appears.
- Once someone answers or closes it, it stays away for 90 days.
- It renders inside a shadow DOM, so your site's CSS doesn't affect it.

## Project layout

```
server.js            starts the HTTP server
src/app.js           routes and request handling
src/store.js         every SQL query
src/db.js            schema
src/auth.js          scrypt passwords and sessions
src/nps.js           scoring, CSV parsing and import mapping (also used in the browser)
src/snippet.js       email and widget snippets (also used in the browser)
src/views/           server-rendered HTML
public/              CSS, browser scripts, widget, fonts, icons, tour screenshots
scripts/seed-demo.mjs
test/
```

## Security notes

- **Passwords** are hashed with scrypt.
- **Sessions** are random tokens, stored only as SHA-256 hashes.
- **Cookies** are HttpOnly and SameSite=Lax.
- **Cross-site requests:** signed-in POST routes check the Origin header.
- **Pages** are sent with a strict Content Security Policy.
- **Survey answers** are rate limited per network and survey.
- **Logins and sign-ups** are rate limited per network.
- **CSV export** defuses spreadsheet formulas.

## Not built yet

- **Billing and plan limits.** The pricing section on the landing page describes future plans. Nothing is charged or enforced, and everything is free during early access.
- **Account tools.** There's no password reset, email verification or team accounts.
- **Email sending.** Tenpoint doesn't send survey emails itself. You paste the buttons into your own email tool.

## Credits

- Fonts: Bricolage Grotesque, Geist and Geist Mono, under the SIL Open Font License. The licence files are in `public/fonts/`.
- Icons: [Phosphor Icons](https://phosphoricons.com) (MIT).
- Screenshots in `public/shots/` are of this app filled with demo data for a made-up coffee shop.
