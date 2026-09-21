# NestedWeb Marketing Website

This directory contains the standalone, high-performance marketing landing site for **NestedWeb** (`https://nestedweb.com`).

---

## Architecture Overview

This marketing site is intentionally decoupled from the SaaS application (`https://app.nestedweb.com`):

- **Zero secrets**: Contains no database credentials, Supabase keys, or API tokens.
- **Ultra-fast TTFB**: Standalone static HTML5 and CSS with zero external build dependencies.
- **Independent deployment**: Can be hosted on any static edge provider (Cloudflare Pages, Vercel, Netlify, AWS S3+CloudFront, or Nginx).
- **Direct SaaS integration**: All Call-to-Action (CTA) buttons link directly to the SaaS authentication and registration endpoints on `https://app.nestedweb.com`.

---

## Deployment Options

### Option 1: Cloudflare Pages (Recommended for best global edge performance)

1. Log into your Cloudflare dashboard and navigate to **Workers & Pages** → **Create application** → **Pages**.
2. Connect your GitHub repository (`vineetkpe/NestedWeb`).
3. In build settings:
   - **Build command**: Leave blank (no build step required).
   - **Build output directory**: `landing`
   - **Root directory**: `/`
4. Click **Save and Deploy**.
5. Under **Custom domains**, add `nestedweb.com` and `www.nestedweb.com`.

### Option 2: Vercel

1. In the Vercel Dashboard, click **Add New** → **Project**.
2. Import the `NestedWeb` repository.
3. In the project settings:
   - **Root Directory**: Select `landing`.
   - **Framework Preset**: Other (Static).
4. Click **Deploy**.
5. Add your domain `nestedweb.com` under **Settings** → **Domains**.

### Option 3: Traditional Web Server (Nginx / Apache / Caddy)

Simply point the root of your web server virtual host to the `landing/` directory:

```nginx
server {
    listen 443 ssl http2;
    server_name nestedweb.com www.nestedweb.com;
    root /var/www/NestedWeb/landing;
    index index.html;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

---

## URL Configuration

- Marketing Landing Page: `https://nestedweb.com`
- SaaS Application Root: `https://app.nestedweb.com/`
- SaaS Sign In: `https://app.nestedweb.com/login`
- SaaS Sign Up: `https://app.nestedweb.com/signup`
