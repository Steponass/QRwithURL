## Tervetuloa

## URL Shortener + QR code generator

This is a personal project for me to get familiar with Node.js / Cloudflare workers / SQLite

Designed for 3 tiers:
- No sign-in (max 5/day)
- Sign-in (personalized subdomain + QR generator, max 10 each, basic tracking features)
- Paid (increase limit to 500 + more tracking features) 

### STACK

## Backend

- Cloudflare workers for URL redirects
- Cloudflare D1 for SQLite
- Cloudflare R1 for large objects (i.e. QR code jpgs)

## Frontend

- React.js (for me to keep practicing) with React Router
- Apache eCharts library (already used it for a dynamic pie chart elsewhere, so want to try other types of charts by them)
- React-turnsite lib for easy Cloudflare Turnstile integration
- QRcode lib for QR code generation
- Clerk for auth


### MEDIA BREAKPOINTS SO FAR

- 640px .dashboard_header_and_subdomainpicker
