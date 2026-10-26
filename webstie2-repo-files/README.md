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
4. Redeploy (variables only apply to new deployments).

Every `git push` to `main` redeploys automatically.

## Use

- Everyone: `your-site/#commission` for the live board, submitting a request and looking up an order
- Admin: `your-site/#admin` to confirm, deny, complete, price or delete orders

## Local development

```bash
npm i -g vercel
npm install
vercel link
vercel env pull .env.local
vercel dev
```
