import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import pg from 'pg';
import fs from 'node:fs';

const { Pool } = pg;
const app = Fastify({ logger: true });
const HAS_DATABASE = Boolean(process.env.DATABASE_URL);
const pool = HAS_DATABASE ? new Pool({ connectionString: process.env.DATABASE_URL }) : null;
const PORT = Number(process.env.PORT || 8080);
const COOKIE = process.env.SESSION_COOKIE_NAME || 'philly_admin_session';
const TTL_DAYS = Number(process.env.SESSION_TTL_DAYS || 14);
const origins = [process.env.CLIENT_ORIGIN, process.env.ADMIN_ORIGIN].filter(Boolean);
const devOriginAllowed = origin => /^https:\/\/philly-cars(?:-admin)?-dev\.onrender\.com$/i.test(origin || '');

await app.register(cookie);
await app.register(cors, {
  origin(origin, cb) {
    if (!origin || origins.includes(origin) || devOriginAllowed(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
  methods: ['GET','POST','PATCH','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type']
});

const hashToken = value => crypto.createHash('sha256').update(value).digest('hex');
const slugify = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function ensureSchema() {
  if (!pool) return;
  const sql = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  app.log.info('Database schema ready');
}

async function bootstrapAdmin() {
  if (!pool) return;
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (!email || !password || password.startsWith('change-this')) return;
  const exists = await pool.query('SELECT id FROM admin_users WHERE lower(email)=lower($1)', [email]);
  if (exists.rowCount) return;
  const hash = await bcrypt.hash(password, 12);
  await pool.query('INSERT INTO admin_users(email,password_hash,role) VALUES($1,$2,$3)', [email, hash, 'owner']);
  app.log.info({ email }, 'Bootstrap owner created');
}

async function requireAdmin(req, reply) {
  if (!pool) return reply.code(503).send({ error: 'database_not_connected' });
  const raw = req.cookies[COOKIE];
  if (!raw) return reply.code(401).send({ error: 'unauthorized' });
  const result = await pool.query(`
    SELECT u.id, u.email, u.role
    FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active=true
  `, [hashToken(raw)]);
  if (!result.rowCount) return reply.code(401).send({ error: 'unauthorized' });
  req.admin = result.rows[0];
}

app.get('/', async () => ({ ok: true, service: 'philly-cars-api', health: '/health' }));
app.get('/health', async () => ({ ok: true, service: 'philly-cars-api', database: HAS_DATABASE ? 'connected' : 'not_connected' }));

app.addHook('preHandler', async (req, reply) => {
  if (req.url === '/health') return;
  if (!pool) return reply.code(503).send({ error: 'database_not_connected' });
});

app.get('/api/v1/vehicles', async req => {
  const { make, body, year, maxPrice, q } = req.query || {};
  const where = [`status IN ('ready_to_publish','available','deposit')`];
  const values = [];
  const add = (sql, value) => { values.push(value); where.push(sql.replace('?', `$${values.length}`)); };
  if (make) add('make = ?', make);
  if (body) add('body_style = ?', body);
  if (year) add('year = ?', Number(year));
  if (maxPrice) add('price <= ?', Number(maxPrice));
  if (q) add(`(make || ' ' || model || ' ' || coalesce(trim,'')) ILIKE ?`, `%${q}%`);
  const result = await pool.query(`SELECT * FROM vehicles WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, values);
  return { vehicles: result.rows };
});

app.get('/api/v1/vehicles/:slug', async (req, reply) => {
  const result = await pool.query(`SELECT * FROM vehicles WHERE slug=$1 AND status IN ('ready_to_publish','available','deposit','sold')`, [req.params.slug]);
  if (!result.rowCount) return reply.code(404).send({ error: 'not_found' });
  return result.rows[0];
});

app.post('/api/v1/leads', async (req, reply) => {
  const b = req.body || {};
  if (!b.type || !b.name) return reply.code(400).send({ error: 'type_and_name_required' });
  const result = await pool.query(`
    INSERT INTO leads(type,vehicle_id,name,phone,email,vin,message,payload)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,created_at
  `, [b.type, b.vehicleId || null, b.name, b.phone || null, b.email || null, b.vin || null, b.message || null, b]);
  return reply.code(201).send(result.rows[0]);
});

app.post('/api/v1/admin/bootstrap', async (req, reply) => {
  const { email, password } = req.body || {};
  if (!email || !password || String(password).length < 12) {
    return reply.code(400).send({ error: 'email_and_12_char_password_required' });
  }
  const count = await pool.query('SELECT count(*)::int AS count FROM admin_users');
  if (count.rows[0].count > 0) return reply.code(409).send({ error: 'admin_already_exists' });
  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    'INSERT INTO admin_users(email,password_hash,role) VALUES($1,$2,$3) RETURNING id,email,role',
    [String(email).trim().toLowerCase(), hash, 'owner']
  );
  return reply.code(201).send({ user: result.rows[0] });
});

app.post('/api/v1/admin/session', async (req, reply) => {
  const { email, password } = req.body || {};
  const result = await pool.query('SELECT * FROM admin_users WHERE lower(email)=lower($1) AND active=true', [email || '']);
  if (!result.rowCount || !(await bcrypt.compare(password || '', result.rows[0].password_hash))) {
    return reply.code(401).send({ error: 'invalid_credentials' });
  }
  const raw = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + TTL_DAYS * 86400000);
  await pool.query('DELETE FROM admin_sessions WHERE user_id=$1 OR expires_at <= now()', [result.rows[0].id]);
  await pool.query('INSERT INTO admin_sessions(user_id,token_hash,expires_at) VALUES($1,$2,$3)', [result.rows[0].id, hashToken(raw), expires]);
  reply.setCookie(COOKIE, raw, { httpOnly: true, secure: true, sameSite: 'none', path: '/', expires });
  await pool.query('UPDATE admin_users SET last_login_at=now() WHERE id=$1', [result.rows[0].id]);
  return { user: { email: result.rows[0].email, role: result.rows[0].role } };
});

app.get('/api/v1/admin/me', { preHandler: requireAdmin }, async req => ({ user: req.admin }));

app.delete('/api/v1/admin/session', { preHandler: requireAdmin }, async (req, reply) => {
  const raw = req.cookies[COOKIE];
  await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1', [hashToken(raw)]);
  reply.clearCookie(COOKIE, { path: '/' });
  return { ok: true };
});

app.get('/api/v1/admin/vin/:vin', { preHandler: requireAdmin }, async (req, reply) => {
  const vin = String(req.params.vin || '').trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return reply.code(400).send({ error: 'invalid_vin' });
  const url = 'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/' + encodeURIComponent(vin) + '?format=json';
  const response = await fetch(url, { headers: { 'User-Agent': 'PhillyCars/1.0' } });
  if (!response.ok) return reply.code(502).send({ error: 'vin_service_unavailable' });
  const data = await response.json();
  const r = data?.Results?.[0] || {};
  const errorCode = String(r.ErrorCode || '');
  if (!r.Make && !r.Model) return reply.code(422).send({ error: 'vin_not_decoded', detail: r.ErrorText || null });

  const bodyRaw = r.BodyClass || '';
  let bodyStyle = '';
  if (/sport utility|suv|crossover/i.test(bodyRaw)) bodyStyle = 'SUV';
  else if (/pickup/i.test(bodyRaw)) bodyStyle = 'Truck';
  else if (/hatchback/i.test(bodyRaw)) bodyStyle = 'Hatchback';
  else if (/coupe/i.test(bodyRaw)) bodyStyle = 'Coupe';
  else if (/convertible|cabriolet/i.test(bodyRaw)) bodyStyle = 'Convertible';
  else if (/wagon/i.test(bodyRaw)) bodyStyle = 'Wagon';
  else if (/sedan/i.test(bodyRaw)) bodyStyle = 'Sedan';

  const driveRaw = r.DriveType || '';
  let drivetrain = '';
  if (/4wd|4-wheel|4x4/i.test(driveRaw)) drivetrain = '4WD';
  else if (/all-wheel|awd/i.test(driveRaw)) drivetrain = 'AWD';
  else if (/front-wheel|fwd/i.test(driveRaw)) drivetrain = 'FWD';
  else if (/rear-wheel|rwd|4x2/i.test(driveRaw)) drivetrain = 'RWD';

  const displacement = r.DisplacementL ? String(r.DisplacementL) + 'L' : '';
  const cyl = r.EngineCylinders ? ' ' + r.EngineCylinders + '-cyl' : '';
  const engine = [displacement + cyl, r.EngineModel || ''].filter(Boolean).join(' · ');

  return {
    vin,
    decoded: !errorCode || errorCode === '0',
    year: Number(r.ModelYear) || null,
    make: r.Make || '',
    model: r.Model || '',
    trim: r.Trim || r.Series || '',
    bodyStyle,
    bodyClass: bodyRaw,
    drivetrain,
    transmission: r.TransmissionStyle || '',
    engine,
    fuelType: r.FuelTypePrimary || '',
    manufacturer: r.Manufacturer || '',
    vehicleType: r.VehicleType || '',
    errorText: r.ErrorText || ''
  };
});

app.get('/api/v1/admin/vehicles', { preHandler: requireAdmin }, async () => {
  const result = await pool.query('SELECT * FROM vehicles ORDER BY created_at DESC');
  return { vehicles: result.rows };
});

app.post('/api/v1/admin/vehicles', { preHandler: requireAdmin }, async (req, reply) => {
  const b = req.body || {};
  if (!b.make || !b.model || !b.year || b.price == null || !b.stockNumber) return reply.code(400).send({ error: 'missing_required_fields' });
  const slug = b.slug || `${b.year}-${slugify(b.make)}-${slugify(b.model)}-${slugify(b.stockNumber)}`;
  const result = await pool.query(`
    INSERT INTO vehicles(slug,stock_number,vin,year,make,model,trim,price,mileage,purchase_price,auction_fees,transport_cost,recon_cost,other_cost,acquired_at,body_style,exterior_color,interior_color,drivetrain,transmission,engine,fuel_type,title_status,status,description,features)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26) RETURNING *
  `,[slug,b.stockNumber,b.vin||null,Number(b.year),b.make,b.model,b.trim||null,Number(b.price||0),Number(b.mileage||0),Number(b.purchasePrice||0),Number(b.auctionFees||0),Number(b.transportCost||0),Number(b.reconCost||0),Number(b.otherCost||0),b.acquiredAt||null,b.bodyStyle||null,b.exteriorColor||null,b.interiorColor||null,b.drivetrain||null,b.transmission||null,b.engine||null,b.fuelType||null,b.titleStatus||null,b.status||'acquired',b.description||null,JSON.stringify(b.features||[])]);
  return reply.code(201).send(result.rows[0]);
});

app.patch('/api/v1/admin/vehicles/:id', { preHandler: requireAdmin }, async (req, reply) => {
  const allowed = {
    stockNumber:'stock_number', vin:'vin', year:'year', make:'make', model:'model', trim:'trim', price:'price', mileage:'mileage', purchasePrice:'purchase_price', auctionFees:'auction_fees', transportCost:'transport_cost', reconCost:'recon_cost', otherCost:'other_cost', acquiredAt:'acquired_at',
    bodyStyle:'body_style', exteriorColor:'exterior_color', interiorColor:'interior_color', drivetrain:'drivetrain', transmission:'transmission',
    engine:'engine', fuelType:'fuel_type', titleStatus:'title_status', status:'status', description:'description', features:'features'
  };
  const sets=[]; const values=[];
  for (const [key,col] of Object.entries(allowed)) if (Object.hasOwn(req.body||{}, key)) {
    values.push(key==='features' ? JSON.stringify(req.body[key]) : req.body[key]);
    sets.push(`${col}=$${values.length}`);
  }
  if (!sets.length) return reply.code(400).send({ error:'no_changes' });
  values.push(req.params.id);
  const result = await pool.query(`UPDATE vehicles SET ${sets.join(',')}, updated_at=now() WHERE id=$${values.length} RETURNING *`, values);
  if (!result.rowCount) return reply.code(404).send({ error:'not_found' });
  return result.rows[0];
});

app.post('/api/v1/admin/vehicles/:id/archive', { preHandler: requireAdmin }, async (req, reply) => {
  const result = await pool.query(`UPDATE vehicles SET status='archived',updated_at=now() WHERE id=$1 RETURNING id,status`, [req.params.id]);
  if (!result.rowCount) return reply.code(404).send({ error:'not_found' });
  return result.rows[0];
});

app.get('/api/v1/admin/vehicles/:id/publications', { preHandler: requireAdmin }, async (req, reply) => {
  const exists = await pool.query('SELECT id FROM vehicles WHERE id=$1', [req.params.id]);
  if (!exists.rowCount) return reply.code(404).send({ error:'not_found' });
  const result = await pool.query('SELECT * FROM vehicle_publications WHERE vehicle_id=$1 ORDER BY channel', [req.params.id]);
  return { publications: result.rows };
});

app.put('/api/v1/admin/vehicles/:id/publications/:channel', { preHandler: requireAdmin }, async (req, reply) => {
  const { status='draft', externalListingId=null, externalUrl=null, lastError=null } = req.body || {};
  const result = await pool.query(`
    INSERT INTO vehicle_publications(vehicle_id,channel,status,external_listing_id,external_url,last_error,last_synced_at)
    VALUES($1,$2,$3,$4,$5,$6,now())
    ON CONFLICT(vehicle_id,channel) DO UPDATE SET status=excluded.status,external_listing_id=excluded.external_listing_id,external_url=excluded.external_url,last_error=excluded.last_error,last_synced_at=now(),updated_at=now()
    RETURNING *
  `,[req.params.id,req.params.channel,status,externalListingId,externalUrl,lastError]);
  return result.rows[0];
});

app.get('/api/v1/admin/leads', { preHandler: requireAdmin }, async () => {
  const result = await pool.query('SELECT * FROM leads ORDER BY created_at DESC LIMIT 500');
  return { leads: result.rows };
});

app.patch('/api/v1/admin/leads/:id', { preHandler: requireAdmin }, async (req, reply) => {
  const status = req.body?.status;
  if (!status) return reply.code(400).send({ error:'status_required' });
  const result = await pool.query('UPDATE leads SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
  if (!result.rowCount) return reply.code(404).send({ error:'not_found' });
  return result.rows[0];
});

await ensureSchema();
await bootstrapAdmin();
await app.listen({ port: PORT, host: '0.0.0.0' });