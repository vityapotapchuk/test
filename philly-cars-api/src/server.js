import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import sharp from 'sharp';
import { PDFParse } from 'pdf-parse';
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
await app.register(multipart, {
  limits: { fileSize: 20 * 1024 * 1024, files: 1, fields: 10 }
});
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

const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/g;

function parseCarfaxText(rawText='') {
  const text=String(rawText||'').replace(/\u00a0/g,' ').replace(/\r/g,'');
  const upper=text.toUpperCase();
  const vinMatches=[...new Set(upper.match(VIN_PATTERN)||[])];
  const vin=vinMatches[0]||null;

  const mileageCandidates=[];
  const mileagePatterns=[
    /(\d{1,3}(?:,\d{3})+|\d{4,7})\s*(?:mi|miles)\b/gi,
    /(?:last reported odometer reading|odometer|mileage)[^0-9]{0,40}(\d[\d,]{2,})/gi
  ];
  for(const re of mileagePatterns){
    for(const m of text.matchAll(re)){
      const n=Number(String(m[1]).replace(/,/g,''));
      if(Number.isFinite(n)&&n>0&&n<2000000)mileageCandidates.push(n);
    }
  }
  const mileage=mileageCandidates.length?Math.max(...mileageCandidates):0;

  const ownerMatch=
    text.match(/\b(\d+)\s*[- ]?owner vehicle\b/i) ||
    text.match(/\bowners?\s*(?:reported)?\s*[:\-]?\s*(\d+)\b/i);
  const owners=ownerMatch?Number(ownerMatch[1]):null;

  const serviceMatch=
    text.match(/\b(\d+)\s+service history records?\b/i) ||
    text.match(/\bservice records?\s*[:\-]?\s*(\d+)\b/i);
  const serviceRecords=serviceMatch?Number(serviceMatch[1]):null;

  const accidentCountMatch=text.match(/\b(\d+)\s+(?:accident|damage)(?:\s+or\s+damage)?\s+records?\b/i);
  const accidentCount=accidentCountMatch?Number(accidentCountMatch[1]):null;
  const accidentReported=/\baccident reported\b|\baccident\/damage\b/i.test(text);
  const damageReported=/\bdamage reported\b/i.test(text);

  let titleStatus=null;
  const titleBrands=[];
  if(/\brebuilt title\b|\breconstructed title\b/i.test(text)){titleStatus='Rebuilt Title';titleBrands.push('rebuilt');}
  else if(/\bsalvage title\b/i.test(text)){titleStatus='Salvage Title';titleBrands.push('salvage');}
  else if(/\bno title issues reported\b|\bno title problems reported\b/i.test(text)){titleStatus='Clean Title';}
  else if(/\bflood title\b/i.test(text)){titleStatus='Other';titleBrands.push('flood');}
  else if(/\blemon title\b|\bmanufacturer buyback\b/i.test(text)){titleStatus='Other';titleBrands.push('lemon/buyback');}
  else if(/\bjunk title\b/i.test(text)){titleStatus='Other';titleBrands.push('junk');}

  const usage=[];
  for(const [label,re] of [
    ['Personal',/\bpersonal vehicle\b/i],
    ['Rental',/\brental vehicle\b/i],
    ['Lease',/\blease vehicle\b/i],
    ['Commercial',/\bcommercial vehicle\b/i],
    ['Fleet',/\bfleet vehicle\b/i]
  ]) if(re.test(text)) usage.push(label);

  const reportDateMatch=
    text.match(/\breport date\s*[:\-]?\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})/i) ||
    text.match(/\breport date\s*[:\-]?\s*(\d{1,2}\/\d{1,2}\/\d{4})/i);

  return {
    vin,
    mileage,
    owners,
    serviceRecords,
    accidentReported,
    damageReported,
    accidentCount,
    titleStatus,
    titleBrands,
    usage,
    reportDate:reportDateMatch?reportDateMatch[1]:null,
    textLength:text.length
  };
}

async function decodeVinForImport(vin) {
  const url='https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/'+encodeURIComponent(vin)+'?format=json';
  const response=await fetch(url,{headers:{'User-Agent':'PhillyCars/1.0'}});
  if(!response.ok) throw new Error('vin_service_unavailable');
  const data=await response.json();
  const r=data?.Results?.[0]||{};
  if(!r.Make&&!r.Model) throw new Error('vin_not_decoded');

  const bodyRaw=r.BodyClass||'';
  let bodyStyle='';
  if(/sport utility|suv|crossover/i.test(bodyRaw))bodyStyle='SUV';
  else if(/pickup/i.test(bodyRaw))bodyStyle='Truck';
  else if(/hatchback/i.test(bodyRaw))bodyStyle='Hatchback';
  else if(/coupe/i.test(bodyRaw))bodyStyle='Coupe';
  else if(/convertible|cabriolet/i.test(bodyRaw))bodyStyle='Convertible';
  else if(/wagon/i.test(bodyRaw))bodyStyle='Wagon';
  else if(/sedan/i.test(bodyRaw))bodyStyle='Sedan';

  const driveRaw=r.DriveType||'';
  let drivetrain='';
  if(/4wd|4-wheel|4x4/i.test(driveRaw))drivetrain='4WD';
  else if(/all-wheel|awd/i.test(driveRaw))drivetrain='AWD';
  else if(/front-wheel|fwd/i.test(driveRaw))drivetrain='FWD';
  else if(/rear-wheel|rwd|4x2/i.test(driveRaw))drivetrain='RWD';

  const displacement=r.DisplacementL?String(r.DisplacementL)+'L':'';
  const cyl=r.EngineCylinders?' '+r.EngineCylinders+'-cyl':'';
  const engine=[displacement+cyl,r.EngineModel||''].filter(Boolean).join(' · ');

  return {
    vin,
    year:Number(r.ModelYear)||null,
    make:r.Make||'',
    model:r.Model||'',
    trim:r.Trim||r.Series||'',
    bodyStyle,
    drivetrain,
    transmission:r.TransmissionStyle||'',
    engine,
    fuelType:r.FuelTypePrimary||''
  };
}

async function nextStockNumber(client) {
  const result=await client.query(`
    SELECT COALESCE(MAX(NULLIF(regexp_replace(stock_number,'\\D','','g'),'')::int),1059) AS max_stock
    FROM vehicles
  `);
  return 'PC'+String(Number(result.rows[0].max_stock||1059)+1).padStart(4,'0');
}

async function ensureSchema() {
  if (!pool) return;
  const sql = fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  app.log.info('Database schema ready');
}

async function bootstrapAdmin() {
  if (!pool) return;

  const primaryEmail = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const primaryPassword = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  if (primaryEmail && primaryPassword && !primaryPassword.startsWith('change-this')) {
    const exists = await pool.query('SELECT id FROM admin_users WHERE lower(email)=lower($1)', [primaryEmail]);
    if (!exists.rowCount) {
      const hash = await bcrypt.hash(primaryPassword, 12);
      await pool.query(
        'INSERT INTO admin_users(email,password_hash,role) VALUES($1,$2,$3)',
        [primaryEmail, hash, 'owner']
      );
      app.log.info({ email: primaryEmail }, 'Bootstrap owner created');
    }
  }

  const extraEmail = process.env.ADMIN_EXTRA_EMAIL;
  const extraPassword = process.env.ADMIN_EXTRA_PASSWORD;
  const extraRole = process.env.ADMIN_EXTRA_ROLE === 'owner' ? 'owner' : 'manager';
  if (extraEmail && extraPassword) {
    const hash = await bcrypt.hash(extraPassword, 12);
    await pool.query(`
      INSERT INTO admin_users(email,password_hash,role,active)
      VALUES($1,$2,$3,true)
      ON CONFLICT (email)
      DO UPDATE SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, active=true
    `, [String(extraEmail).trim().toLowerCase(), hash, extraRole]);
    app.log.info({ email: String(extraEmail).trim().toLowerCase(), role: extraRole }, 'Extra admin account provisioned');
  }
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
  const result = await pool.query(`
    SELECT v.*,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', vi.id,
          'path', vi.path,
          'alt_text', vi.alt_text,
          'sort_order', vi.sort_order,
          'is_cover', vi.is_cover
        ) ORDER BY vi.is_cover DESC, vi.sort_order ASC, vi.created_at ASC)
        FROM vehicle_images vi
        WHERE vi.vehicle_id=v.id
      ), '[]'::jsonb) AS images
    FROM vehicles v
    WHERE ${where.join(' AND ')}
    ORDER BY v.created_at DESC
  `, values);
  return { vehicles: result.rows };
});

app.get('/api/v1/vehicles/:slug', async (req, reply) => {
  const result = await pool.query(`
    SELECT v.*,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', vi.id,
          'path', vi.path,
          'alt_text', vi.alt_text,
          'sort_order', vi.sort_order,
          'is_cover', vi.is_cover
        ) ORDER BY vi.is_cover DESC, vi.sort_order ASC, vi.created_at ASC)
        FROM vehicle_images vi
        WHERE vi.vehicle_id=v.id
      ), '[]'::jsonb) AS images
    FROM vehicles v
    WHERE v.slug=$1 AND v.status IN ('ready_to_publish','available','deposit','sold')
  `, [req.params.slug]);
  if (!result.rowCount) return reply.code(404).send({ error: 'not_found' });
  return result.rows[0];
});

app.get('/api/v1/vehicle-images/:id', async (req, reply) => {
  const result = await pool.query(
    'SELECT content_type,image_data FROM vehicle_images WHERE id=$1',
    [req.params.id]
  );
  if (!result.rowCount || !result.rows[0].image_data) return reply.code(404).send({ error: 'image_not_found' });
  reply.header('Content-Type', result.rows[0].content_type || 'image/jpeg');
  reply.header('Cache-Control', 'public, max-age=31536000, immutable');
  return reply.send(result.rows[0].image_data);
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

app.post('/api/v1/admin/import/carfax', { preHandler: requireAdmin }, async (req, reply) => {
  let part;
  try {
    part=await req.file();
  } catch (err) {
    if(err?.statusCode===413)return reply.code(413).send({error:'carfax_file_too_large',maxBytes:20*1024*1024});
    throw err;
  }
  if(!part)return reply.code(400).send({error:'carfax_pdf_required'});
  if(part.mimetype!=='application/pdf'&&!/\.pdf$/i.test(part.filename||'')){
    part.file.resume();
    return reply.code(415).send({error:'carfax_pdf_required'});
  }

  let pdfBuffer;
  try {
    pdfBuffer=await part.toBuffer();
  } catch (err) {
    if(err?.statusCode===413||err?.code==='FST_REQ_FILE_TOO_LARGE'){
      return reply.code(413).send({error:'carfax_file_too_large',maxBytes:20*1024*1024});
    }
    throw err;
  }
  if(!pdfBuffer?.length)return reply.code(400).send({error:'empty_carfax_file'});

  let parser;
  let parsedText='';
  try {
    parser=new PDFParse({data:pdfBuffer});
    const parsed=await parser.getText();
    parsedText=String(parsed?.text||'');
  } catch (err) {
    req.log.warn({err},'CARFAX PDF text extraction failed');
    return reply.code(422).send({error:'carfax_pdf_unreadable'});
  } finally {
    try{await parser?.destroy();}catch{}
  }

  if(parsedText.trim().length<80)return reply.code(422).send({error:'carfax_text_not_found'});
  if(!/\bCARFAX\b/i.test(parsedText))return reply.code(422).send({error:'not_carfax_report'});

  const summary=parseCarfaxText(parsedText);
  if(!summary.vin)return reply.code(422).send({error:'vin_not_found_in_carfax'});

  let decoded;
  try {
    decoded=await decodeVinForImport(summary.vin);
  } catch (err) {
    req.log.warn({err,vin:summary.vin},'CARFAX VIN decode failed');
    return reply.code(502).send({error:String(err?.message||'vin_decode_failed')});
  }
  if(!decoded.year||!decoded.make||!decoded.model){
    return reply.code(422).send({error:'vehicle_identity_incomplete'});
  }

  const digest=crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const client=await pool.connect();
  try {
    await client.query('BEGIN');

    const sameFile=await client.query(
      "SELECT vehicle_id FROM vehicle_documents WHERE kind='carfax' AND sha256=$1 LIMIT 1",
      [digest]
    );
    if(sameFile.rowCount){
      await client.query('ROLLBACK');
      return reply.code(409).send({error:'carfax_already_imported',vehicleId:sameFile.rows[0].vehicle_id});
    }

    const existing=await client.query('SELECT id,stock_number FROM vehicles WHERE vin=$1 LIMIT 1',[summary.vin]);
    if(existing.rowCount){
      await client.query('ROLLBACK');
      return reply.code(409).send({error:'vehicle_vin_already_exists',vehicleId:existing.rows[0].id,stockNumber:existing.rows[0].stock_number});
    }

    const stockNumber=await nextStockNumber(client);
    const slug=`${decoded.year}-${slugify(decoded.make)}-${slugify(decoded.model)}-${slugify(stockNumber)}`;
    const acquiredAt=new Date().toISOString().slice(0,10);
    const titleStatus=summary.titleStatus||'Other';

    const vehicleResult=await client.query(`
      INSERT INTO vehicles(
        slug,stock_number,vin,year,make,model,trim,price,mileage,
        acquired_at,body_style,drivetrain,transmission,engine,fuel_type,title_status,status
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13,$14,$15,'acquired')
      RETURNING *
    `,[
      slug,stockNumber,summary.vin,decoded.year,decoded.make,decoded.model,decoded.trim||null,
      summary.mileage||0,acquiredAt,decoded.bodyStyle||null,decoded.drivetrain||null,
      decoded.transmission||null,decoded.engine||null,decoded.fuelType||null,titleStatus
    ]);
    const vehicle=vehicleResult.rows[0];

    const parsedData={
      source:'carfax',
      summary,
      vinDecode:decoded,
      importedAt:new Date().toISOString()
    };
    const documentResult=await client.query(`
      INSERT INTO vehicle_documents(
        vehicle_id,kind,original_name,content_type,size_bytes,sha256,document_data,parsed_text,parsed_data
      )
      VALUES($1,'carfax',$2,'application/pdf',$3,$4,$5,$6,$7)
      RETURNING id,original_name,size_bytes,created_at
    `,[
      vehicle.id,part.filename||'carfax.pdf',pdfBuffer.length,digest,pdfBuffer,parsedText,JSON.stringify(parsedData)
    ]);

    await client.query('COMMIT');
    return reply.code(201).send({
      vehicle,
      carfax:parsedData,
      document:documentResult.rows[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

app.get('/api/v1/admin/documents/:id/file', { preHandler: requireAdmin }, async (req, reply) => {
  const result=await pool.query(
    'SELECT original_name,content_type,document_data FROM vehicle_documents WHERE id=$1',
    [req.params.id]
  );
  if(!result.rowCount||!result.rows[0].document_data)return reply.code(404).send({error:'document_not_found'});
  const row=result.rows[0];
  reply.header('Content-Type',row.content_type||'application/pdf');
  reply.header('Content-Disposition',`inline; filename="${String(row.original_name||'carfax.pdf').replace(/"/g,'')}"`);
  reply.header('Cache-Control','private, no-store');
  return reply.send(row.document_data);
});

app.get('/api/v1/admin/vehicles', { preHandler: requireAdmin }, async () => {
  const result = await pool.query(`
    SELECT v.*,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', vi.id,
          'path', vi.path,
          'alt_text', vi.alt_text,
          'sort_order', vi.sort_order,
          'is_cover', vi.is_cover,
          'content_type', vi.content_type,
          'original_name', vi.original_name,
          'size_bytes', vi.size_bytes
        ) ORDER BY vi.is_cover DESC, vi.sort_order ASC, vi.created_at ASC)
        FROM vehicle_images vi
        WHERE vi.vehicle_id=v.id
      ), '[]'::jsonb) AS images,
      (
        SELECT jsonb_build_object(
          'document_id',vd.id,
          'original_name',vd.original_name,
          'created_at',vd.created_at,
          'parsed_data',vd.parsed_data
        )
        FROM vehicle_documents vd
        WHERE vd.vehicle_id=v.id AND vd.kind='carfax'
        ORDER BY vd.created_at DESC
        LIMIT 1
      ) AS carfax
    FROM vehicles v
    ORDER BY v.created_at DESC
  `);
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

app.post('/api/v1/admin/vehicles/:id/images', { preHandler: requireAdmin }, async (req, reply) => {
  const vehicle = await pool.query('SELECT id,year,make,model FROM vehicles WHERE id=$1', [req.params.id]);
  if (!vehicle.rowCount) return reply.code(404).send({ error: 'vehicle_not_found' });

  let part;
  try {
    part = await req.file();
  } catch (err) {
    if (err?.statusCode === 413) return reply.code(413).send({ error: 'image_too_large', maxBytes: 20 * 1024 * 1024 });
    throw err;
  }
  if (!part) return reply.code(400).send({ error: 'image_required' });

  const allowed = new Set(['image/jpeg','image/png','image/webp','image/avif']);
  if (!allowed.has(part.mimetype)) {
    part.file.resume();
    return reply.code(415).send({ error: 'unsupported_image_type', allowed: [...allowed] });
  }

  let data;
  try {
    data = await part.toBuffer();
  } catch (err) {
    if (err?.statusCode === 413 || err?.code === 'FST_REQ_FILE_TOO_LARGE') {
      return reply.code(413).send({ error: 'image_too_large', maxBytes: 20 * 1024 * 1024 });
    }
    throw err;
  }
  if (!data?.length) return reply.code(400).send({ error: 'empty_image' });

  let optimized;
  try {
    optimized = await sharp(data, { failOn: 'none' })
      .rotate()
      .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82, effort: 4, smartSubsample: true })
      .toBuffer();
  } catch (err) {
    req.log.warn({ err }, 'Vehicle image optimization failed');
    return reply.code(422).send({ error: 'image_processing_failed' });
  }

  const stats = await pool.query(
    'SELECT count(*)::int AS count, coalesce(max(sort_order),-1)::int AS max_sort FROM vehicle_images WHERE vehicle_id=$1',
    [req.params.id]
  );
  const first = stats.rows[0].count === 0;
  const sortOrder = stats.rows[0].max_sort + 1;
  const imageId = crypto.randomUUID();
  const path = '/api/v1/vehicle-images/' + imageId;
  const alt = `${vehicle.rows[0].year} ${vehicle.rows[0].make} ${vehicle.rows[0].model}`;

  const result = await pool.query(`
    INSERT INTO vehicle_images(id,vehicle_id,path,alt_text,sort_order,is_cover,content_type,original_name,size_bytes,image_data)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    RETURNING id,path,alt_text,sort_order,is_cover,content_type,original_name,size_bytes,created_at
  `, [
    imageId, req.params.id, path, alt, sortOrder, first,
    'image/webp', part.filename || null, optimized.length, optimized
  ]);
  return reply.code(201).send(result.rows[0]);
});

app.patch('/api/v1/admin/vehicles/:vehicleId/images/:imageId', { preHandler: requireAdmin }, async (req, reply) => {
  const { isCover, sortOrder, altText } = req.body || {};
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exists = await client.query(
      'SELECT id FROM vehicle_images WHERE id=$1 AND vehicle_id=$2',
      [req.params.imageId, req.params.vehicleId]
    );
    if (!exists.rowCount) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'image_not_found' });
    }
    if (isCover === true) {
      await client.query('UPDATE vehicle_images SET is_cover=false WHERE vehicle_id=$1', [req.params.vehicleId]);
    }
    const sets=[]; const values=[];
    if (isCover !== undefined) { values.push(Boolean(isCover)); sets.push('is_cover=$'+values.length); }
    if (sortOrder !== undefined) { values.push(Number(sortOrder)); sets.push('sort_order=$'+values.length); }
    if (altText !== undefined) { values.push(altText || null); sets.push('alt_text=$'+values.length); }
    if (!sets.length) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: 'no_changes' });
    }
    const imageParam=values.length+1; values.push(req.params.imageId);
    const vehicleParam=values.length+1; values.push(req.params.vehicleId);
    const sql='UPDATE vehicle_images SET '+sets.join(',')+' WHERE id=$'+imageParam+' AND vehicle_id=$'+vehicleParam+
      ' RETURNING id,path,alt_text,sort_order,is_cover,content_type,original_name,size_bytes';
    const result = await client.query(sql, values);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

app.put('/api/v1/admin/vehicles/:id/images/order', { preHandler: requireAdmin }, async (req, reply) => {
  const imageIds = req.body?.imageIds;
  if (!Array.isArray(imageIds) || !imageIds.length) return reply.code(400).send({ error: 'image_ids_required' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id FROM vehicle_images WHERE vehicle_id=$1',
      [req.params.id]
    );
    const allowed = new Set(existing.rows.map(r => r.id));
    if (imageIds.some(id => !allowed.has(id)) || imageIds.length !== allowed.size) {
      await client.query('ROLLBACK');
      return reply.code(400).send({ error: 'image_order_mismatch' });
    }
    for (let i=0;i<imageIds.length;i++) {
      await client.query('UPDATE vehicle_images SET sort_order=$1 WHERE id=$2 AND vehicle_id=$3', [i,imageIds[i],req.params.id]);
    }
    await client.query('COMMIT');
    return { ok:true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

app.delete('/api/v1/admin/vehicles/:vehicleId/images/:imageId', { preHandler: requireAdmin }, async (req, reply) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const deleted = await client.query(
      'DELETE FROM vehicle_images WHERE id=$1 AND vehicle_id=$2 RETURNING is_cover',
      [req.params.imageId, req.params.vehicleId]
    );
    if (!deleted.rowCount) {
      await client.query('ROLLBACK');
      return reply.code(404).send({ error: 'image_not_found' });
    }
    if (deleted.rows[0].is_cover) {
      await client.query(`
        UPDATE vehicle_images SET is_cover=true
        WHERE id=(
          SELECT id FROM vehicle_images
          WHERE vehicle_id=$1
          ORDER BY sort_order ASC, created_at ASC
          LIMIT 1
        )
      `, [req.params.vehicleId]);
    }
    await client.query('COMMIT');
    return { ok:true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
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