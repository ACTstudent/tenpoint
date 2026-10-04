# Tenpoint

Free, simple NPS surveys for small teams. Ask customers one question ("How likely are you to recommend us?"), read every answer, and watch the score move month by month.

Teams leaving GetFeedback (retiring December 31, 2026) or Delighted (closed June 30, 2026) can import their history, and every answer keeps its original date.

Tenpoint is free: there are no plans, no card, and no limit on surveys or answers.

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
  - Big files are sent in parts.
  - Importing the same file twice is blocked, and each import can be undone.
- **Slack alerts** for each new answer, through an incoming webhook.
- **CSV export** of every answer.
- **Your name and colour** on the survey page and the widget.

## Run it on your computer

You need Node.js 22.

```sh
npm install
npm start          # http://localhost:3000, data in ./data/tenpoint.db
npm test           # unit and end-to-end tests
npm run seed       # optional: a demo account with a year of sample answers
```

`npm run seed` prints the demo login. Set `DEMO_PASSWORD` to choose the password.

## Deploy to Vercel

Vercel functions don't keep files between requests, so on Vercel, Tenpoint stores its data in [Turso](https://turso.tech). Turso is hosted SQLite, so the app runs the same SQL everywhere.

1. **Import the repository.** In Vercel, choose Add New, then Project, then pick this repository. Leave the framework preset as **Other**; `vercel.json` already sets the build, the output folder and the routing.
2. **Add a database.** In the project, open **Storage**, choose **Turso Cloud** from the Marketplace, create a database and connect it to the project.
   - This adds `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` to the project's environment variables.
   - If you already have a Turso database, add those two variables yourself.
3. **Deploy.** Tenpoint creates its tables on the first request.
   - If you open the site before a database is connected, it shows a page explaining what's missing instead of an error.

Optional settings:

- **`BASE_URL`**, for example `https://tenpoint.example.com`. Share links, email buttons and the widget code use it. Without it, they use whichever domain the page was opened on.
- **Region.** Put the Turso database in the region closest to your Vercel functions. Vercel's default is Washington, D.C. (`iad1`).

### How the Vercel version is set up

- **`api/index.js`** is the function. Every request that isn't a file in `public/` is routed to it.
- **`npm run build`** copies the two modules the browser shares with the server into `public/lib/`, so Vercel's CDN serves them.
- **Imports** are sent from the browser in parts of up to 2,000 rows, under Vercel's 4.5 MB request limit. A 30,000-row file goes up in about 15 parts.
- **Rate limits** for sign-ups, logins and answers are stored in the database, so they hold across function instances.
- **Slack alerts** are sent before the function replies, because a serverless function can be frozen after replying.
  - Answers that arrive score-first (email clicks and the widget) post one message for the score and a second if a reason is added.
  - On a long-running server, Tenpoint waits 90 seconds for the reason and sends a single message instead.

## Other hosts

Tenpoint also runs as one long-lived Node process with a SQLite file. Any host with a persistent disk works:

- **Render.** Create a Web Service with a Disk mounted at `/data`.
- **Railway.** Add a volume mounted at `/data`.
- **Fly.io.** Create a volume and mount it at `/data`.
- **Any VPS.** Use the included `Dockerfile`, or run `npm start` behind Caddy or nginx.

Whichever you use, set:

- `DATABASE_URL=file:/data/tenpoint.db`
- `BASE_URL=https://your-domain`
- `TRUST_PROXY=1`

You can point a server at Turso too: set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` instead of `DATABASE_URL`.

### Settings

| Variable | Default | What it does |
| --- | --- | --- |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | none | A Turso database. Vercel's Turso integration sets both. |
| `DATABASE_URL` | `file:data/tenpoint.db` | Any libSQL URL: a `file:` path, or a remote `libsql://` or `https://` database. Takes priority over the Turso variables. |
| `DATABASE_AUTH_TOKEN` | none | Token for a remote `DATABASE_URL` |
| `BASE_URL` | the request's host | Public address used in share links, email buttons and the widget code |
| `PORT` | `3000` | Port for `npm start` |
| `TRUST_PROXY` | off | Set to `1` behind a proxy so client IPs and `https` are read from `X-Forwarded-*`. Always on for Vercel. |
| `SECURE_COOKIES` | on when `BASE_URL` is `https` | Set to `1` or `0` to force it. Always on for Vercel. |

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
api/index.js         Vercel function entry
server.js            long-running server entry (local, Docker, VPS)
vercel.json          Vercel build, routing and headers
src/app.js           routes and request handling
src/store.js         every SQL query
src/db.js            schema and the libSQL connection (local file or Turso)
src/auth.js          scrypt passwords and sessions
src/nps.js           scoring, CSV parsing and import mapping (also used in the browser)
src/snippet.js       email and widget snippets (also used in the browser)
src/views/           server-rendered HTML
public/              CSS, browser scripts, widget, fonts, icons, tour screenshots
scripts/             build step and demo seed
test/
```

The tests use an in-memory database by default. To run the same tests against a libSQL server over HTTP, as on Vercel, set `TEST_DATABASE_URL`, for example `TEST_DATABASE_URL=http://127.0.0.1:8080 npm test`.

## Security notes

- **Passwords** are hashed with scrypt.
- **Sessions** are random tokens, stored only as SHA-256 hashes.
- **Cookies** are HttpOnly and SameSite=Lax.
- **Cross-site requests:** signed-in POST routes check the Origin header.
- **Pages** are sent with a strict Content Security Policy.
- **Rate limits** apply per network to sign-ups and logins, and per network and survey to answers.
- **CSV export** defuses spreadsheet formulas.
- **Deleting** a survey or an account removes its answers, imports and sessions with explicit deletes. Remote databases don't enforce foreign key cascades, so nothing relies on them.

## Not built yet

- Password reset and email verification.
- Team accounts.
- Sending survey emails from Tenpoint. You paste the buttons into your own email tool.

## Credits

- Fonts: Bricolage Grotesque, Geist and Geist Mono, under the SIL Open Font License. The licence files are in `public/fonts/`.
- Icons: [Phosphor Icons](https://phosphoricons.com) (MIT).
- Database client: [@libsql/client](https://github.com/tursodatabase/libsql-client-ts) (MIT).
- Screenshots in `public/shots/` are of this app filled with demo data for a made-up coffee shop.
