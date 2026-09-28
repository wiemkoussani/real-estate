# AXIS

AXIS is a Next.js product for real-estate developments: a public QR tour, a client workspace, and an admin console, all on one AXIS domain.

The company site is AXIS. Each development is a project under `/c/…` (for example `/c/villas-ajyad`). There is no per-client domain.

## What it includes

- **Public tour** (`/c/[slug]`) — orbit model, units, plans, gallery, 360. Visual style of the scanned tour is fixed; do not restyle it.
- **Admin** (`/admin`) — projects, clients, units import, media upload, leads, QR.
- **Client** (`/client`) — the invited person sees the developments they belong to.
- **Auth** — Supabase Auth. Invites and password mail go through Brevo as AXIS.

A project can have several clients. A client can sit on several projects.

## Public folder vs uploaded media

Tour photos, the GLB, gallery, plans, and 360s are **not** meant to live in `public/` for production. Admin uploads them to **Supabase Storage** (`media` public bucket, `private` for contracts). The tour reads those URLs from the database.

This app does **not** talk to Wasabi. Files you put on Wasabi are a backup or another pipeline unless you change the code.

You can move or delete the heavy `public/complexes/…` tree. That will not break a project that already has files in Storage.

**Keep this file in the repo:**

`public/branding/axis-logo.png`

Admin, client, and the browser tab icon load `/branding/axis-logo.png` from Next.js `public/`. That is the AXIS mark, not the Ajyad tour logo. The tour logo is whatever you upload on the project **Logo** card.

If `public/` is moved outside this directory, Next will stop serving `/branding/axis-logo.png` unless you leave a `public/branding/` folder **inside** the project.

There is a leftover fallback that can read `public/complexes/[slug]/data/units.json` if the database is missing. After units are imported in admin, that file is optional.

## URL and QR

On create, AXIS builds the slug from the project name (`Villas Ajyad` → `villas-ajyad`). If it exists, it becomes `-2`, `-3`, …. Renaming the project does not change the slug (printed QR codes stay valid).

Visitor address: `https://YOUR-AXIS-DOMAIN/c/the-slug`  
QR: project tab **Code**.

Home `/` currently redirects to `/c/villas-ajyad`.

## Run locally

Node 22. Copy `.env.example` to `.env.local` and fill values. Never commit `.env.local`.

```bash
npm install
npm run dev
```

Open http://localhost:3000

### Environment

| Variable | Role |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser / user requests |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only (storage, invites, admin) |
| `NEXT_PUBLIC_SITE_URL` | Links in invite emails |
| `ADMIN_BOOTSTRAP_EMAIL` | First admin account (must exist in Auth) |
| `ALLOW_FIRST_ADMIN` | Keep `false` in production |
| `BREVO_API_KEY` | Transactional mail |
| `BREVO_FROM_EMAIL` | AXIS sender |
| `BREVO_FROM_NAME` | Default `AXIS` |

Run SQL in `supabase/migrations/` in order in the Supabase SQL Editor (`001` … `005`), including members and private storage.

Storage buckets: **`media`** (public tour files), **`private`** (contracts, not on the tour).

## Admin media folders

Upload the folder named on each card. Nested 360s: pick `villa-types` (or `type-1`), not an inner floor folder alone.

Typical 360 set: 3 types × 4 folders (`RDC`, `etage_1`, `etage_2`, `tout_villa`) × 60 frames = **720** images.

Units: import `units.json` (file picker: click once, then Open).

## Stack

Next.js 15 App Router, React 19, Three.js orbit viewer, Supabase (Auth, Postgres, Storage), Brevo.

Do not commit secrets. Do not force-push production. AXIS branding (circle + X) is for admin and client shells, not for restyling the public tour chrome.
