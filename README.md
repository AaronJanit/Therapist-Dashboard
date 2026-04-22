# Therapist Dashboard (CareSpace)

A lightweight, browser-based therapist workflow app for managing clients, sessions, notes, and invoice emails.

This project is implemented as a **static HTML/CSS/JavaScript dashboard** with a local SQLite database powered by [`sql.js`](https://sql.js.org/) and persisted in `localStorage`.

## Features

- **Authentication flow**
  - Login and sign-up screens.
  - Role-aware UI controls (including Admin navigation visibility).
- **Dashboard overview**
  - Active client and session summary cards.
  - Upcoming/next session indicators.
  - Search panel for quick filtering.
- **Client management**
  - Add and edit client records.
  - Client list + detail view patterns.
- **Schedule management**
  - Week-based schedule interface.
  - Session booking modal and configurable view toggles.
- **Clinical notes**
  - Client-specific notes timeline/editor workflow.
  - Notes export as ZIP.
  - Speech-recognition initialization hooks for note-taking.
- **Invoice email builder**
  - Build copy-ready invoice email content from client/session data.
  - Clipboard copy support.
- **Persisted local data model**
  - `users`, `clients`, `notes`, and `schedule` tables seeded from `users.sql`.

## Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript
- **Icons:** Font Awesome (CDN)
- **Fonts:** Google Fonts (Inter)
- **Client-side SQL runtime:** `sql.js` (SQLite compiled to WebAssembly)
- **Storage:** Browser `localStorage` (serialized database bytes)

## Project Structure

```text
.
├── login.html            # Login page
├── signup.html           # Registration page
├── dashboard.html        # Main dashboard/overview
├── clients.html          # Client management
├── schedule.html         # Weekly scheduling UI
├── notes.html            # Clinical notes workflow
├── invoices.html         # Invoice email builder
├── admin.html            # Placeholder admin page
├── script.js             # Core app logic and page initializers
├── style.css             # Shared styles
├── users.sql             # Schema + seed data
└── Whole Person Manchester Holistic centres.png
```

## Getting Started

Because this is a static site that uses `fetch('users.sql')`, run it through a local HTTP server (not `file://`).

### Option 1: Python

```bash
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/login.html`

### Option 2: VS Code Live Server

- Open the repository in VS Code.
- Start **Live Server** from `login.html`.

## Default Seed Account

The SQL seed creates a default user:

- **Username:** `therapist`
- **Password:** `password123`

> Note: This is demo data for local development only.

## Data & Persistence Notes

- On first run, the app loads and executes `users.sql`.
- The resulting SQLite database is exported and stored in `localStorage` under `carespace_db`.
- On subsequent loads, it restores from cache and attempts basic schema migration for newly required user columns.

To reset local data during development:

1. Open DevTools → Application/Storage.
2. Remove `localStorage` keys including `carespace_db` and `loggedInUser`.
3. Reload the app.

## Current Limitations

- No backend/API; all persistence is local to the browser.
- Authentication is local-only and not secure for production.
- `admin.html` is currently a placeholder.
- Invoices are generated as email-ready text, not PDF documents.

## Suggested Next Steps

- Add a backend (Node/Express, Django, etc.) and move auth/data server-side.
- Replace plain-text passwords with secure password hashing.
- Add automated tests and linting (e.g., Playwright + ESLint).
- Implement a full Admin area and role-based route protection.

## License

No license file is currently included. Add a `LICENSE` file if you want to define reuse terms.
