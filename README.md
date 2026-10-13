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
```

## Vehicle photo workflow

Vehicle photos can be uploaded from Admin. Images are resized to a maximum 1920px dimension and converted to WebP for the development site. The current development implementation stores optimized image data in PostgreSQL. Production storage can later be moved to object storage without changing the inventory model.

## Important

Do not commit database passwords, session secrets, private keys, or other credentials.
