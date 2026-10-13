# Philly Cars

Development repository for the Philly Cars dealership platform.

## Structure

- `philly-cars-dev/` — public customer website
- `philly-cars-admin/` — dealership admin application
- `philly-cars-api/` — Fastify API and PostgreSQL schema

## Current development stack

- Public site: static HTML/CSS/JavaScript
- Admin: static HTML/CSS/JavaScript
- API: Node.js + Fastify
- Database: PostgreSQL
- Vehicle photo processing: Sharp / WebP
- VIN decoding: NHTSA vPIC API
- Development hosting: Render

## Development URLs

- Public: https://philly-cars-dev.onrender.com
- Admin: https://philly-cars-admin-dev.onrender.com
- API: https://philly-cars-api-dev.onrender.com

## API environment variables

Configure these on the hosting platform. Never commit real credentials.

```
DATABASE_URL=
CLIENT_ORIGIN=
ADMIN_ORIGIN=
SESSION_COOKIE_NAME=philly_admin_session
SESSION_TTL_DAYS=14
GOOGLE_DRIVE_API_KEY=
```

## Vehicle photo workflow

Vehicle photos can be uploaded from Admin. Images are resized to a maximum 1920px dimension and converted to WebP for the development site. The current development implementation stores optimized image data in PostgreSQL. Production storage can later be moved to object storage without changing the inventory model.

## Important

Do not commit database passwords, session secrets, private keys, or other credentials.

## CARFAX import

Admin can upload a CARFAX PDF to create an inventory vehicle automatically. The API extracts the VIN and readable report data, enriches vehicle specifications through NHTSA vPIC, stores the original report and extracted text, and creates the vehicle with status `acquired`. Acquired vehicles stay hidden from the public inventory until moved to a publishable status.

## Google Drive vehicle photos

For a saved vehicle, Admin can store a public Google Drive folder URL and import its images. The folder must be shared as **Anyone with the link**. The API lists the public folder using `GOOGLE_DRIVE_API_KEY`, downloads image files, converts them to WebP (max 1920px, quality 82), appends them to the vehicle gallery, and records the Drive file IDs so re-imports skip duplicates. Nested public folders are supported up to the server safety limits.
