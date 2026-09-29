# CSS Framework Lab

The original static hub, Bootstrap and Tailwind Northstar designs, and learning guide now include persistent study notes and an interactive backend decision report.

## Run

Requires Node.js 24 or newer. Run `npm start` and open `http://127.0.0.1:3000/`. The server creates `data/notes.sqlite` on first run. Set `PORT` and `DATA_DIR` as needed. Do not open the HTML files directly: the notes API requires the server. The framework demo pages require internet access for their CDN assets.

## Test

Run `npm test`. The test uses a temporary database and exercises CRUD, browser isolation, invalid input, and cross-site request rejection.

## Routes

- `/notes/`: browser-scoped study notes.
- `/report/`: interactive technology, database, security, and UX decision report with documentation links.
- `GET /api/notes`, `GET /api/notes/:id`, `POST /api/notes`, `PUT /api/notes/:id`, `DELETE /api/notes/:id`.

Write requests must send JSON and an Origin matching the server. A random HttpOnly cookie identifies the browser; clearing cookies loses access. Do not save sensitive data. The server binds to localhost by default. To expose it, set `HOST` deliberately and deploy behind HTTPS with `NODE_ENV=production`, persistent storage, backups, and proxy rate limiting. The Tailwind browser CDN and its relaxed script policy are for the classroom demo; build Tailwind for a production deployment.

## Publish

This is no longer a static-only site. Use a Node.js host with persistent storage. Static file hosting alone cannot run the notes API. No production deployment was performed.
