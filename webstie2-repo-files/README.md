# Taxian site + live commission system

Static portfolio site with a server-backed commission portal, hosted on Vercel.

```
index.html     the site (commission portal + live board + admin panel)
api/           Vercel serverless routes (orders, admin)
lib/core.js    shared server code
.env.example   environment variables you must set in Vercel
```

## Put it on GitHub

```bash
cd taxian-site
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

No secrets are stored in this repo. The admin password lives in a Vercel environment variable only.

## Deploy on Vercel

1. Vercel dashboard -> Add New -> Project -> import the GitHub repo. Framework preset: **Other**. No build command.
2. Storage / Marketplace -> add **Upstash Redis** and connect it to the project.
3. Settings -> Environment Variables -> add `ADMIN_PASSWORD` (see `.env.example`).
4. Redeploy (variables only apply to new deployments).

Every `git push` to `main` redeploys automatically.

## Use

- Everyone: `your-site/#commission` for the live board, submitting a request and looking up an order
- Admin: `your-site/#admin` to confirm, deny, complete, price or delete orders

## Your data (commissions, chats, files)

All commissions live in Upstash Redis, **not** in the code. `lib/seed.js` is only copied into Redis once on first run, so
redeploying or pushing new code never resets anything you edited in the admin panel. Do not delete or replace the Upstash
store in Vercel - that is the only thing that would wipe the data.

As a safety net, the admin panel has **Download backup** (one JSON file with every commission, chat and uploaded file) and
**Restore backup**. Download one now and then.

## Local development

```bash
npm i -g vercel
npm install
vercel link
vercel env pull .env.local
vercel dev
```

## Research Paper tab

- `your-site/#research-paper` opens the Research Paper tab (list of papers); `#research-paper/roblox-trends-edition-1` opens the paper directly.
- Navigation now lives in the left sidebar (a slide-out drawer on mobile). The Research Paper entry and the Commission Portal both open in their own tab.
- To add another paper, add a card in the `#rp-sector` list in `index.html` and a new article block next to `#rp-paper`.

## Desktop (OS) mode

On screens 900px and wider the site opens as a KDE-style desktop: wallpaper, desktop icons, an analog clock, draggable/resizable windows (minimize / maximize / close), a taskbar with a start menu, and a working terminal (type `help`). Sections open as windows; the Research Paper opens in a file-manager window and reader. Use the "Classic site" icon (or start menu) to return to the normal scrolling site, and "Desktop mode" in the sidebar to come back. The choice is remembered in localStorage (`taxianMode`). Phones always get the classic site.

### Tutorial

A 9-step guided tour runs on a visitor's first desktop-mode visit (remembered in localStorage as `taxianTour`). Replay it from the Tutorial desktop icon, the start menu, the `tutorial` terminal command, or by pressing `?`. Steps are defined in the `TOUR` array in `index.html`.
