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
  allowedHeaders: ['Content-Type','Authorization']
});

const hashToken = value => crypto.createHash('sha256').update(value).digest('hex');
const slugify = s => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const DISTRIBUTION_CHANNELS=new Set(['website','facebook','google','cargurus','cars','autotrader']);
const PUBLIC_SITE_URL=String(process.env.CLIENT_ORIGIN||'https://philly-cars-dev.onrender.com').replace(/\/$/,'');
const csvCell=value=>'"'+String(value??'').replace(/"/g,'""').replace(/[\r\n]+/g,' ').trim()+'"';
const tsvCell=value=>String(value??'').replace(/[\t\r\n]+/g,' ').trim();
const absoluteApiOrigin=req=>String(process.env.PUBLIC_API_URL||(`${req.protocol}://${req.headers.host}`)).replace(/\/$/,'');
const vehicleVdpUrl=vehicle=>PUBLIC_SITE_URL+'/#/vehicle/'+encodeURIComponent(vehicle.slug);
const absoluteVehicleImageUrl=(req,path)=>path?(path.startsWith('http')?path:absoluteApiOrigin(req)+path):'';

async function getDistributionInventory() {
  const result=await pool.query(`
    SELECT v.*,
      (
        SELECT vi.path
        FROM vehicle_images vi
        WHERE vi.vehicle_id=v.id
        ORDER BY vi.is_cover DESC,vi.sort_order ASC,vi.created_at ASC
        LIMIT 1
      ) AS cover_path
    FROM vehicles v
    WHERE v.status IN ('ready_to_publish','available','deposit')
    ORDER BY v.created_at DESC
  `);
  return result.rows;
}

const VIN_PATTERN = /\b[A-HJ-NPR-Z0-9]{17}\b/g;

function normalizeTransmissionLabel(value='',speeds=null) {
  let raw=String(value||'').replace(/\s+/g,' ').trim();
  if(!raw)return '';

  raw=raw
    .replace(/\bcontinuously variable transmission\b/i,'CVT')
    .replace(/\bdual[- ]clutch transmission\b/i,'Dual-Clutch')
    .replace(/\bdual[- ]clutch\b/i,'Dual-Clutch')
    .replace(/\bautomated manual transmission(?:\s*\(AMT\))?\b/i,'Automated Manual')
    .replace(/\bmanual\/standard\b/i,'Manual')
    .replace(/\s+transmission$/i,'')
    .trim();

  const speedCount=Number(speeds)||null;
  if(speedCount && !/\b\d{1,2}\s*[- ]?speed\b/i.test(raw) && !/\b(?:CVT|eCVT|single[- ]?speed)\b/i.test(raw)){
    raw=speedCount+'-Speed '+raw;
  }

  return raw
    .replace(/\b(\d{1,2})\s+speed\b/gi,'$1-Speed')
    .replace(/\b(\d{1,2})-speed\b/gi,'$1-Speed')
    .replace(/\s+/g,' ')
    .trim();
}

function normalizeCarfaxColor(value='') {
  const raw=String(value||'')
    .replace(/\s+/g,' ')
    .replace(/^[\s:;\-–—]+|[\s:;\-–—]+$/g,'')
    .trim();
  if(!raw||raw.length>48)return '';
  if(/^(?:n\/?a|unknown|unspecified|not available|none)$/i.test(raw))return '';
  return raw
    .toLowerCase()
    .replace(/\b\w/g,m=>m.toUpperCase());
}

function parseCarfaxColor(text='',label='Exterior') {
  const source=String(text||'').replace(/\u00a0/g,' ').replace(/\r/g,'');
  const name=label==='Interior'?'Interior':'Exterior';
  const patterns=[
    new RegExp('(?:^|\\n)\\s*'+name+'\\s+Color\\s*[:\\-]?\\s*([^\\n]{2,48})(?:\\n|$)','i'),
    new RegExp('\\b'+name+'\\s+Color\\s*[:\\-]\\s*([A-Za-z][A-Za-z0-9 /&.+-]{1,46})','i')
  ];
  for(const re of patterns){
    const match=source.match(re);
    if(match?.[1]){
      const cleaned=normalizeCarfaxColor(match[1]);
      if(cleaned && !/^(?:interior|exterior|engine|fuel|drive|body|transmission)\b/i.test(cleaned))return cleaned;
    }
  }
  return '';
}

function parseCarfaxTransmission(text='') {
  const source=String(text||'').replace(/\u00a0/g,' ').replace(/\r/g,'');
  const labeledPatterns=[
    /(?:^|\n)\s*transmission\s*[:\-]?\s*((?:\d{1,2}\s*[- ]?speed\s+)?(?:automatic|manual|dual[- ]clutch|dct|dsg|pdk|tiptronic|cvt|ecvt|continuously variable|single[- ]speed)(?:\s+transmission)?)[ \t]*(?:\n|$)/im,
    /\btransmission\s*[:\-]\s*((?:\d{1,2}\s*[- ]?speed\s+)?(?:automatic|manual|dual[- ]clutch|dct|dsg|pdk|tiptronic|cvt|ecvt|continuously variable|single[- ]speed)(?:\s+transmission)?)/i
  ];
  for(const re of labeledPatterns){
    const m=source.match(re);
    if(m?.[1])return normalizeTransmissionLabel(m[1]);
  }

  const specPattern=/\b(\d{1,2}\s*[- ]?speed\s+(?:automatic|manual|dual[- ]clutch|dct|dsg|pdk|tiptronic)|(?:e?cvt|continuously variable transmission)|single[- ]speed(?:\s+automatic)?)\b/i;
  const spec=source.match(specPattern);
  return spec?.[1]?normalizeTransmissionLabel(spec[1]):'';
}

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
  const transmission=parseCarfaxTransmission(text);
  const exteriorColor=parseCarfaxColor(text,'Exterior');
  const interiorColor=parseCarfaxColor(text,'Interior');

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
    transmission:transmission||null,
    exteriorColor:exteriorColor||null,
    interiorColor:interiorColor||null,
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
    series:r.Series||'',
    bodyStyle,
    bodyClass:bodyRaw,
    drivetrain,
    transmission:normalizeTransmissionLabel(r.TransmissionStyle||'',Number(r.TransmissionSpeeds)||null),
    transmissionStyle:r.TransmissionStyle||'',
    transmissionSpeeds:Number(r.TransmissionSpeeds)||null,
    engine,
    engineCylinders:Number(r.EngineCylinders)||null,
    engineHP:Number(r.EngineHP)||null,
    displacementL:Number(r.DisplacementL)||null,
    turbo:r.Turbo||'',
    fuelType:r.FuelTypePrimary||'',
    fuelTypeSecondary:r.FuelTypeSecondary||'',
    electrificationLevel:r.ElectrificationLevel||'',
    doors:Number(r.Doors)||null,
    seats:Number(r.Seats)||null,
    seatRows:Number(r.SeatRows)||null,
    manufacturer:r.Manufacturer||'',
    vehicleType:r.VehicleType||'',
    plantCity:r.PlantCity||'',
    plantState:r.PlantState||'',
    plantCountry:r.PlantCountry||''
  };
}

async function fetchNhtsaRecalls(year,make,model) {
  if(!year||!make||!model)return null;
  const params=new URLSearchParams({
    make:String(make),
    model:String(model),
    modelYear:String(year)
  });
  const url='https://api.nhtsa.gov/recalls/recallsByVehicle?'+params.toString();
  const response=await fetch(url,{
    headers:{'User-Agent':'PhillyCars/1.0','Accept':'application/json'},
    signal:AbortSignal.timeout(12000)
  });
  if(!response.ok)throw new Error('nhtsa_recalls_unavailable');
  const data=await response.json();
  const results=Array.isArray(data?.results)?data.results:[];
  return {
    count:results.length,
    sourceUrl:url,
    campaigns:results.slice(0,12).map(r=>({
      campaignNumber:r.NHTSACampaignNumber||null,
      component:r.Component||null,
      reportReceivedDate:r.ReportReceivedDate||null,
      summary:r.Summary||null
    }))
  };
}

function buildVehicleDescription(vehicle,{carfaxSummary=null,vinDecode=null,recalls=null}={}) {
  const year=Number(vehicle.year)||'';
  const make=String(vehicle.make||'').trim();
  const model=String(vehicle.model||'').trim();
  const trim=String(vehicle.trim||'').trim();
  const mileage=Number(vehicle.mileage||0);
  const price=Number(vehicle.price||0);
  const body=String(vehicle.body_style||vinDecode?.bodyStyle||vinDecode?.bodyClass||'').trim();
  const drivetrain=String(vehicle.drivetrain||vinDecode?.drivetrain||'').trim();
  const transmission=String(vehicle.transmission||vinDecode?.transmission||'').trim();
  const engineRaw=String(vehicle.engine||vinDecode?.engine||'').trim();
  const titleStatus=String(vehicle.title_status||carfaxSummary?.titleStatus||'').trim();
  const seatRows=Number(vinDecode?.seatRows)||null;
  const seats=Number(vinDecode?.seats)||null;
  const features=Array.isArray(vehicle.features)?vehicle.features.filter(Boolean):[];

  const shortModel=[make,model].filter(Boolean).join(' ');
  const fullName=[year,make,model].filter(Boolean).join(' ');

  const descriptor=(()=>{
    if(/suv|sport utility|crossover/i.test(body)){
      if(seatRows>=3)return 'Modern 3-Row SUV';
      return 'Modern SUV';
    }
    if(/sedan/i.test(body))return 'Modern Sedan';
    if(/coupe/i.test(body))return 'Sport Coupe';
    if(/convertible|cabriolet/i.test(body))return 'Convertible';
    if(/pickup|truck/i.test(body))return 'Modern Pickup';
    if(/hatchback/i.test(body))return 'Versatile Hatchback';
    if(/wagon/i.test(body))return 'Versatile Wagon';
    if(/van|minivan/i.test(body))return 'Family Van';
    if(/electric/i.test(vehicle.fuel_type||vinDecode?.fuelType||''))return 'Electric Vehicle';
    return trim||body||'Pre-Owned Vehicle';
  })();

  const cleanEngine=(()=>{
    if(!engineRaw)return '';
    let value=engineRaw
      .replace(/\s*·\s*[^·]+$/,'')
      .replace(/\b(\d+)\s*-?cyl(?:inder)?s?\b/i,'$1-Cylinder')
      .replace(/\s+/g,' ')
      .trim();
    if(vinDecode?.turbo && !/^not applicable$/i.test(vinDecode.turbo) && !/turbo/i.test(value)){
      value+=' Turbo';
    }
    return value;
  })();

  const lines=[];
  lines.push(`${fullName} – ${descriptor}`);
  lines.push('');

  if(titleStatus){
    lines.push(titleStatus.replace(/\bTitle\b/,'title'));
    lines.push('');
  }

  if(mileage>0){
    const lowMileage=mileage<=15000?'low-mileage ':'';
    lines.push(`Selling a ${lowMileage}${fullName} with only ${new Intl.NumberFormat('en-US').format(mileage)} miles.`);
  }else{
    lines.push(`Selling a ${fullName}.`);
  }
  lines.push('');

  const salesSentence=(()=>{
    if(seatRows>=3){
      return `This ${shortModel} offers three-row versatility, a spacious cabin, and a practical setup for family use or everyday driving.`;
    }
    if(/suv|sport utility|crossover/i.test(body)){
      return `This ${shortModel} combines SUV versatility with a comfortable, practical layout for everyday driving.`;
    }
    if(/sedan/i.test(body)){
      return `This ${shortModel} offers a comfortable sedan layout with a clean, practical setup for daily driving.`;
    }
    if(/coupe/i.test(body)){
      return `This ${shortModel} combines a sporty two-door profile with an easy-to-live-with everyday setup.`;
    }
    if(/pickup|truck/i.test(body)){
      return `This ${shortModel} offers a practical pickup configuration for everyday use, work, and hauling needs.`;
    }
    return `This ${shortModel} is presented with a clear set of verified specifications and vehicle-history details.`;
  })();
  lines.push(salesSentence);
  lines.push('');

  const highlights=[];
  const addHighlight=value=>{
    const v=String(value||'').trim();
    if(!v)return;
    if(!highlights.some(x=>x.toLowerCase()===v.toLowerCase()))highlights.push(v);
  };

  addHighlight(drivetrain);
  addHighlight(cleanEngine);
  if(seatRows>=3)addHighlight('3rd-row seating');
  else if(seats)addHighlight(seats+'-passenger seating');
  if(transmission && !/^automatic$/i.test(transmission))addHighlight(transmission);

  for(const feature of features.slice(0,12))addHighlight(feature);

  if(vinDecode?.engineHP)addHighlight(Math.round(vinDecode.engineHP)+' hp');
  if(vinDecode?.electrificationLevel)addHighlight(vinDecode.electrificationLevel);

  if(highlights.length){
    for(const h of highlights)lines.push(h);
    lines.push('');
  }

  if(carfaxSummary){
    const history=[];
    if(carfaxSummary.owners!=null){
      history.push(`${carfaxSummary.owners} owner${carfaxSummary.owners===1?'':'s'} reported`);
    }
    if(carfaxSummary.serviceRecords!=null){
      history.push(`${carfaxSummary.serviceRecords} service record${carfaxSummary.serviceRecords===1?'':'s'}`);
    }
    if(carfaxSummary.accidentCount!=null && carfaxSummary.accidentCount>0){
      history.push(`${carfaxSummary.accidentCount} accident/damage record${carfaxSummary.accidentCount===1?'':'s'} reported`);
    }else if(carfaxSummary.accidentReported||carfaxSummary.damageReported){
      history.push('accident/damage reported');
    }else{
      history.push('no accident/damage reported in the parsed CARFAX summary');
    }
    if(carfaxSummary.usage?.length)history.push(carfaxSummary.usage.join(', ')+' use');
    if(history.length){
      lines.push('CARFAX: '+history.join(' · '));
      lines.push('');
    }
  }

  const closing=[];
  if(price>0)closing.push('Asking '+new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(price)+'.');
  closing.push('Located in Philadelphia, PA.');
  closing.push('Message us to schedule a viewing or test drive!');
  lines.push(closing.join(' '));

  return lines.join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

async function generateAndPersistVehicleDescription(vehicleId,{knownCarfax=null,knownVinDecode=null}={}) {
  const vehicleResult=await pool.query('SELECT * FROM vehicles WHERE id=$1',[vehicleId]);
  if(!vehicleResult.rowCount)throw new Error('vehicle_not_found');
  let vehicle=vehicleResult.rows[0];

  let carfaxSummary=knownCarfax;
  let vinDecode=knownVinDecode;
  let carfaxDocument=null;

  if(!carfaxSummary){
    const carfaxResult=await pool.query(`
      SELECT id,original_name,parsed_data,parsed_text,created_at
      FROM vehicle_documents
      WHERE vehicle_id=$1 AND kind='carfax'
      ORDER BY created_at DESC
      LIMIT 1
    `,[vehicleId]);
    if(carfaxResult.rowCount){
      carfaxDocument=carfaxResult.rows[0];
      carfaxSummary=carfaxDocument.parsed_data?.summary||null;
      vinDecode=vinDecode||carfaxDocument.parsed_data?.vinDecode||null;

      if(carfaxDocument.parsed_text){
        const reparsed=parseCarfaxText(carfaxDocument.parsed_text);
        const upgraded={...(carfaxSummary||{})};
        for(const key of ['transmission','exteriorColor','interiorColor']){
          if(!upgraded[key]&&reparsed[key])upgraded[key]=reparsed[key];
        }
        carfaxSummary=upgraded;
        if(carfaxDocument.parsed_data){
          const upgradedData={...carfaxDocument.parsed_data,summary:upgraded};
          await pool.query(
            'UPDATE vehicle_documents SET parsed_data=$1 WHERE id=$2',
            [JSON.stringify(upgradedData),carfaxDocument.id]
          );
        }
      }
    }
  }

  if(!vinDecode && vehicle.vin){
    try{vinDecode=await decodeVinForImport(vehicle.vin);}
    catch(err){app.log.warn({err,vehicleId,vin:vehicle.vin},'Description VIN enrichment unavailable');}
  }

  const backfillSets=[];
  const backfillValues=[];
  if(!String(vehicle.exterior_color||'').trim() && carfaxSummary?.exteriorColor){
    backfillValues.push(carfaxSummary.exteriorColor);
    backfillSets.push('exterior_color=$'+backfillValues.length);
  }
  if(!String(vehicle.interior_color||'').trim() && carfaxSummary?.interiorColor){
    backfillValues.push(carfaxSummary.interiorColor);
    backfillSets.push('interior_color=$'+backfillValues.length);
  }
  if(backfillSets.length){
    backfillValues.push(vehicleId);
    const colorUpdate=await pool.query(
      'UPDATE vehicles SET '+backfillSets.join(',')+',updated_at=now() WHERE id=$'+backfillValues.length+' RETURNING *',
      backfillValues
    );
    if(colorUpdate.rowCount)vehicle=colorUpdate.rows[0];
  }

  const detailedTransmission=carfaxSummary?.transmission||vinDecode?.transmission||'';
  const currentTransmission=String(vehicle.transmission||'').trim();
  const currentIsGeneric=/^(automatic|manual)$/i.test(currentTransmission);
  if(detailedTransmission && (!currentTransmission||currentIsGeneric) && detailedTransmission.toLowerCase()!==currentTransmission.toLowerCase()){
    const transmissionUpdate=await pool.query(
      'UPDATE vehicles SET transmission=$1,updated_at=now() WHERE id=$2 RETURNING *',
      [detailedTransmission,vehicleId]
    );
    if(transmissionUpdate.rowCount)vehicle=transmissionUpdate.rows[0];
  }

  let recalls=null;
  try{recalls=await fetchNhtsaRecalls(vehicle.year,vehicle.make,vehicle.model);}
  catch(err){app.log.warn({err,vehicleId},'Description recall enrichment unavailable');}

  const description=buildVehicleDescription(vehicle,{carfaxSummary,vinDecode,recalls});
  const generatedAt=new Date().toISOString();
  const sources={
    generator:'philly-cars-marketplace-v2',
    generatedAt,
    carfax:carfaxSummary?{
      documentId:carfaxDocument?.id||null,
      originalName:carfaxDocument?.original_name||null,
      reportDate:carfaxSummary.reportDate||null
    }:null,
    nhtsaVpic:vehicle.vin?{
      url:'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/'+encodeURIComponent(vehicle.vin)+'?format=json'
    }:null,
    nhtsaRecalls:recalls?{
      url:recalls.sourceUrl,
      count:recalls.count,
      campaigns:recalls.campaigns
    }:null
  };

  const updated=await pool.query(`
    UPDATE vehicles
    SET description=$1,description_generated_at=$2,description_sources=$3,updated_at=now()
    WHERE id=$4
    RETURNING *
  `,[description,generatedAt,JSON.stringify(sources),vehicleId]);

  return {vehicle:updated.rows[0],sources};
}

function parseGoogleDriveFolderLink(value='') {
  const raw=String(value||'').trim();
  if(!raw)return null;
  try{
    const url=new URL(raw);
    if(!/(^|\.)drive\.google\.com$/i.test(url.hostname))return null;
    const match=url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
    if(!match)return null;
    return {
      folderId:match[1],
      resourceKey:url.searchParams.get('resourcekey')||url.searchParams.get('resourceKey')||''
    };
  }catch{
    return null;
  }
}

async function listPublicGoogleDriveImages(folderUrl) {
  const apiKey=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  if(!apiKey)throw new Error('google_drive_not_configured');
  const parsed=parseGoogleDriveFolderLink(folderUrl);
  if(!parsed)throw new Error('invalid_google_drive_folder_url');

  const queue=[parsed];
  const visited=new Set();
  const images=[];
  let foldersScanned=0;

  while(queue.length && foldersScanned<20 && images.length<100){
    const folder=queue.shift();
    if(!folder?.folderId||visited.has(folder.folderId))continue;
    visited.add(folder.folderId);
    foldersScanned++;

    let pageToken='';
    do{
      const params=new URLSearchParams({
        q:`'${folder.folderId}' in parents and trashed = false`,
        fields:'nextPageToken,files(id,name,mimeType,size,webContentLink,resourceKey,capabilities(canDownload))',
        pageSize:'1000',
        supportsAllDrives:'true',
        includeItemsFromAllDrives:'true',
        key:apiKey
      });
      if(pageToken)params.set('pageToken',pageToken);
      const headers={Accept:'application/json'};
      if(folder.resourceKey)headers['X-Goog-Drive-Resource-Keys']=folder.folderId+'/'+folder.resourceKey;

      const response=await fetch('https://www.googleapis.com/drive/v3/files?'+params.toString(),{
        headers,
        signal:AbortSignal.timeout(15000)
      });
      if(!response.ok){
        let googleError={};
        try{googleError=await response.json();}catch{}
        const message=String(googleError?.error?.message||'');
        const reason=String(googleError?.error?.errors?.[0]?.reason||'');
        app.log.warn({
          status:response.status,
          reason:reason||null,
          googleMessage:message||null,
          folderId:folder.folderId
        },'Google Drive public-folder list failed');

        if(response.status===400 && /api key not valid|invalid api key/i.test(message)){
          throw new Error('google_drive_api_key_invalid');
        }
        if(response.status===403 && /api.*not.*enabled|accessnotconfigured|service disabled/i.test(message+' '+reason)){
          throw new Error('google_drive_api_disabled');
        }
        if(response.status===403 && /referer|referrer|ip address|blocked|forbidden/i.test(message+' '+reason)){
          throw new Error('google_drive_api_key_restricted');
        }
        if(response.status===403||response.status===404)throw new Error('google_drive_folder_not_public');
        throw new Error('google_drive_list_failed');
      }
      const data=await response.json();
      for(const file of data.files||[]){
        if(file.mimeType==='application/vnd.google-apps.folder'){
          queue.push({folderId:file.id,resourceKey:file.resourceKey||''});
          continue;
        }
        if(/^image\//i.test(file.mimeType||'') && file.capabilities?.canDownload!==false){
          images.push(file);
          if(images.length>=100)break;
        }
      }
      pageToken=data.nextPageToken||'';
    }while(pageToken && images.length<100);
  }

  return images.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{numeric:true,sensitivity:'base'}));
}

async function downloadPublicGoogleDriveImage(file) {
  const maxBytes=30*1024*1024;
  const declared=Number(file.size||0);
  if(declared>maxBytes)throw new Error('drive_image_too_large');

  const apiKey=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  let response=null;

  if(apiKey&&file.id){
    const params=new URLSearchParams({
      alt:'media',
      supportsAllDrives:'true',
      key:apiKey
    });
    const headers={
      'User-Agent':'PhillyCars/1.0',
      Accept:file.mimeType||'image/*'
    };
    if(file.resourceKey)headers['X-Goog-Drive-Resource-Keys']=file.id+'/'+file.resourceKey;

    try{
      response=await fetch(
        'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?'+params.toString(),
        {
          redirect:'follow',
          signal:AbortSignal.timeout(30000),
          headers
        }
      );
    }catch{}
  }

  if((!response||!response.ok)&&file.webContentLink){
    try{await response?.body?.cancel();}catch{}
    response=await fetch(file.webContentLink,{
      redirect:'follow',
      signal:AbortSignal.timeout(30000),
      headers:{'User-Agent':'PhillyCars/1.0'}
    });
  }

  if(!response||!response.ok)throw new Error('drive_image_download_failed');

  const contentLength=Number(response.headers.get('content-length')||0);
  if(contentLength>maxBytes)throw new Error('drive_image_too_large');
  const data=Buffer.from(await response.arrayBuffer());
  if(!data.length)throw new Error('drive_image_empty');
  if(data.length>maxBytes)throw new Error('drive_image_too_large');
  return data;
}

function googleDriveImportConcurrency(){
  const configured=Number(process.env.DRIVE_IMPORT_CONCURRENCY||3);
  if(!Number.isFinite(configured))return 3;
  return Math.max(1,Math.min(4,Math.floor(configured)));
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
    const normalizedEmail=String(extraEmail).trim().toLowerCase();
    const provisioned=await pool.query(`
      INSERT INTO admin_users(email,password_hash,role,active)
      VALUES($1,$2,$3,true)
      ON CONFLICT (email)
      DO UPDATE SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, active=true
      RETURNING id
    `, [normalizedEmail, hash, extraRole]);
    await pool.query('DELETE FROM admin_sessions WHERE user_id=$1', [provisioned.rows[0].id]);
    app.log.info({ email: normalizedEmail, role: extraRole }, 'Extra admin account provisioned');
  }
}

async function requireAdmin(req, reply) {
  if (!pool) return reply.code(503).send({ error: 'database_not_connected' });
  const auth = String(req.headers.authorization || '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const raw = bearer || req.cookies[COOKIE];
  if (!raw) return reply.code(401).send({ error: 'unauthorized' });
  const result = await pool.query(`
    SELECT u.id, u.email, u.role
    FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active=true
  `, [hashToken(raw)]);
  if (!result.rowCount) return reply.code(401).send({ error: 'unauthorized' });
  req.admin = result.rows[0];
  req.adminSessionToken = raw;
}

async function requireOwner(req, reply) {
  await requireAdmin(req, reply);
  if (reply.sent) return;
  if (req.admin?.role !== 'owner') {
    return reply.code(403).send({ error: 'owner_required' });
  }
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

app.get('/api/v1/feeds/inventory.json', async req => {
  const vehicles=await getDistributionInventory();
  return {
    generatedAt:new Date().toISOString(),
    source:'Philly Cars',
    vehicles:vehicles.map(v=>({
      id:v.id,
      stockNumber:v.stock_number,
      vin:v.vin,
      year:v.year,
      make:v.make,
      model:v.model,
      trim:v.trim,
      price:v.price,
      mileage:v.mileage,
      bodyStyle:v.body_style,
      exteriorColor:v.exterior_color,
      interiorColor:v.interior_color,
      drivetrain:v.drivetrain,
      transmission:v.transmission,
      engine:v.engine,
      fuelType:v.fuel_type,
      titleStatus:v.title_status,
      status:v.status,
      description:v.description,
      features:v.features,
      url:vehicleVdpUrl(v),
      imageUrl:absoluteVehicleImageUrl(req,v.cover_path)
    }))
  };
});

app.get('/api/v1/feeds/inventory.csv', async (req, reply) => {
  const vehicles=await getDistributionInventory();
  const header=['stock_number','vin','year','make','model','trim','price','mileage','body_style','exterior_color','interior_color','drivetrain','transmission','engine','fuel_type','title_status','status','description','features','url','image_url'];
  const rows=vehicles.map(v=>[
    v.stock_number,v.vin,v.year,v.make,v.model,v.trim,v.price,v.mileage,v.body_style,v.exterior_color,
    v.interior_color,v.drivetrain,v.transmission,v.engine,v.fuel_type,v.title_status,v.status,v.description,
    Array.isArray(v.features)?v.features.join(', '):'',vehicleVdpUrl(v),absoluteVehicleImageUrl(req,v.cover_path)
  ].map(csvCell).join(','));
  reply.header('Content-Type','text/csv; charset=utf-8');
  reply.header('Content-Disposition','inline; filename="philly-cars-inventory.csv"');
  reply.header('Cache-Control','public, max-age=300');
  return reply.send([header.map(csvCell).join(','),...rows].join('\n'));
});

app.get('/api/v1/feeds/google-vehicles.tsv', async (req, reply) => {
  const configResult=await pool.query("SELECT config FROM distribution_connections WHERE channel='google' LIMIT 1");
  const config=configResult.rows[0]?.config||{};
  const fulfillment=config.fulfillment==='online'?'online':'in_store';
  const storeCode=String(config.storeCode||'').trim();
  const vehicles=(await getDistributionInventory()).filter(v=>['ready_to_publish','available'].includes(v.status));

  const header=[
    'id','title','description','link','link_template','image_link','availability','price','condition','brand','model','year',
    'mileage','color','vin','vehicle_option','vehicle_fulfillment(option)','vehicle_fulfillment(store_code)'
  ];
  const rows=vehicles.map(v=>{
    const title=[v.year,v.make,v.model,v.trim].filter(Boolean).join(' ');
    const options=Array.isArray(v.features)?v.features.join(', '):'';
    return [
      v.stock_number||v.id,
      title,
      v.description||title,
      vehicleVdpUrl(v),
      fulfillment==='in_store'
        ?PUBLIC_SITE_URL+'/?store={store_code}#/vehicle/'+encodeURIComponent(v.slug)
        :'',
      absoluteVehicleImageUrl(req,v.cover_path),
      'in_stock',
      Number(v.price||0).toFixed(2)+' USD',
      'used',
      v.make,
      v.model,
      v.year,
      Number(v.mileage||0)+' miles',
      v.exterior_color||'',
      v.vin||'',
      options,
      fulfillment,
      fulfillment==='in_store'?storeCode:''
    ].map(tsvCell).join('\t');
  });

  reply.header('Content-Type','text/tab-separated-values; charset=utf-8');
  reply.header('Content-Disposition','inline; filename="philly-cars-google-vehicles.tsv"');
  reply.header('Cache-Control','public, max-age=300');
  return reply.send([header.join('\t'),...rows].join('\n'));
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
  return {
    user: { email: result.rows[0].email, role: result.rows[0].role },
    sessionToken: raw,
    expiresAt: expires.toISOString()
  };
});

app.get('/api/v1/admin/me', { preHandler: requireAdmin }, async req => ({ user: req.admin }));

app.delete('/api/v1/admin/session', { preHandler: requireAdmin }, async (req, reply) => {
  const raw = req.adminSessionToken || req.cookies[COOKIE];
  if (raw) await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1', [hashToken(raw)]);
  reply.clearCookie(COOKIE, { path: '/' });
  return { ok: true };
});

app.get('/api/v1/admin/accounts', { preHandler: requireAdmin }, async req => {
  const result = await pool.query(`
    SELECT id,email,role,active,created_at,last_login_at
    FROM admin_users
    ORDER BY CASE WHEN role='owner' THEN 0 ELSE 1 END, created_at ASC
  `);
  return {
    accounts: result.rows,
    currentUserId: req.admin.id,
    currentRole: req.admin.role,
    canManage: req.admin.role === 'owner'
  };
});

app.post('/api/v1/admin/accounts', { preHandler: requireOwner }, async (req, reply) => {
  const { email, password, role='manager', active=true } = req.body || {};
  const normalizedEmail=String(email||'').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return reply.code(400).send({ error: 'valid_email_required' });
  }
  if (String(password||'').length < 12) {
    return reply.code(400).send({ error: 'password_min_12' });
  }
  if (!['owner','manager'].includes(role)) {
    return reply.code(400).send({ error: 'invalid_role' });
  }
  const hash=await bcrypt.hash(String(password),12);
  try {
    const result=await pool.query(`
      INSERT INTO admin_users(email,password_hash,role,active)
      VALUES($1,$2,$3,$4)
      RETURNING id,email,role,active,created_at,last_login_at
    `,[normalizedEmail,hash,role,Boolean(active)]);
    return reply.code(201).send({ account: result.rows[0] });
  } catch (err) {
    if (err?.code==='23505') return reply.code(409).send({ error: 'email_already_exists' });
    throw err;
  }
});

app.patch('/api/v1/admin/accounts/:id', { preHandler: requireOwner }, async (req, reply) => {
  const accountId=String(req.params.id||'');
  const existing=await pool.query(
    'SELECT id,email,role,active FROM admin_users WHERE id=$1',
    [accountId]
  );
  if(!existing.rowCount)return reply.code(404).send({error:'account_not_found'});

  const current=existing.rows[0];
  const email=req.body?.email!==undefined?String(req.body.email).trim().toLowerCase():current.email;
  const role=req.body?.role!==undefined?String(req.body.role):current.role;
  const active=req.body?.active!==undefined?Boolean(req.body.active):current.active;
  const password=req.body?.password!==undefined?String(req.body.password):'';

  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply.code(400).send({error:'valid_email_required'});
  if(!['owner','manager'].includes(role))return reply.code(400).send({error:'invalid_role'});
  if(password && password.length<12)return reply.code(400).send({error:'password_min_12'});

  const removingOwner = current.role==='owner' && current.active && (role!=='owner' || !active);
  if(removingOwner){
    const owners=await pool.query(
      "SELECT count(*)::int AS count FROM admin_users WHERE role='owner' AND active=true AND id<>$1",
      [accountId]
    );
    if(owners.rows[0].count<1)return reply.code(409).send({error:'last_owner_required'});
  }

  const values=[email,role,active,accountId];
  let passwordSql='';
  if(password){
    const hash=await bcrypt.hash(password,12);
    values.push(hash);
    passwordSql=', password_hash=$5';
  }

  try{
    const result=await pool.query(`
      UPDATE admin_users
      SET email=$1, role=$2, active=$3${passwordSql}
      WHERE id=$4
      RETURNING id,email,role,active,created_at,last_login_at
    `,values);

    const securityChanged = Boolean(password) || role!==current.role || active!==current.active;
    if(securityChanged){
      await pool.query('DELETE FROM admin_sessions WHERE user_id=$1',[accountId]);
    }

    return {
      account:result.rows[0],
      reauthRequired: securityChanged && accountId===req.admin.id
    };
  }catch(err){
    if(err?.code==='23505')return reply.code(409).send({error:'email_already_exists'});
    throw err;
  }
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

  let recalls=null;
  try{recalls=await fetchNhtsaRecalls(decoded.year,decoded.make,decoded.model);}
  catch(err){req.log.warn({err,vin:summary.vin},'CARFAX description recall enrichment unavailable');}

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

    const descriptionSeed={
      year:decoded.year,make:decoded.make,model:decoded.model,trim:decoded.trim||null,
      mileage:summary.mileage||0,body_style:decoded.bodyStyle||null,
      exterior_color:summary.exteriorColor||null,interior_color:summary.interiorColor||null,
      drivetrain:decoded.drivetrain||null,
      transmission:summary.transmission||decoded.transmission||null,engine:decoded.engine||null,fuel_type:decoded.fuelType||null,
      title_status:titleStatus,stock_number:stockNumber,vin:summary.vin
    };
    const generatedDescription=buildVehicleDescription(descriptionSeed,{
      carfaxSummary:summary,
      vinDecode:decoded,
      recalls
    });
    const descriptionGeneratedAt=new Date().toISOString();

    const vehicleResult=await client.query(`
      INSERT INTO vehicles(
        slug,stock_number,vin,year,make,model,trim,price,mileage,
        acquired_at,body_style,exterior_color,interior_color,drivetrain,transmission,engine,fuel_type,title_status,status,
        description,description_generated_at
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'acquired',$18,$19)
      RETURNING *
    `,[
      slug,stockNumber,summary.vin,decoded.year,decoded.make,decoded.model,decoded.trim||null,
      summary.mileage||0,acquiredAt,decoded.bodyStyle||null,
      summary.exteriorColor||null,summary.interiorColor||null,decoded.drivetrain||null,
      summary.transmission||decoded.transmission||null,decoded.engine||null,decoded.fuelType||null,titleStatus,
      generatedDescription,descriptionGeneratedAt
    ]);
    let vehicle=vehicleResult.rows[0];

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

    const descriptionSources={
      generator:'philly-cars-marketplace-v2',
      generatedAt:descriptionGeneratedAt,
      carfax:{
        documentId:documentResult.rows[0].id,
        originalName:documentResult.rows[0].original_name,
        reportDate:summary.reportDate||null
      },
      nhtsaVpic:{
        url:'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/'+encodeURIComponent(summary.vin)+'?format=json'
      },
      nhtsaRecalls:recalls?{
        url:recalls.sourceUrl,
        count:recalls.count,
        campaigns:recalls.campaigns
      }:null
    };
    const descriptionUpdate=await client.query(
      'UPDATE vehicles SET description_sources=$1 WHERE id=$2 RETURNING *',
      [JSON.stringify(descriptionSources),vehicle.id]
    );
    vehicle=descriptionUpdate.rows[0];

    await client.query('COMMIT');
    return reply.code(201).send({
      vehicle,
      carfax:parsedData,
      document:documentResult.rows[0],
      descriptionSources
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
    INSERT INTO vehicles(slug,stock_number,vin,year,make,model,trim,price,mileage,purchase_price,auction_fees,transport_cost,recon_cost,other_cost,acquired_at,body_style,exterior_color,interior_color,drivetrain,transmission,engine,fuel_type,mpg_combined,title_status,status,description,features)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *
  `,[slug,b.stockNumber,b.vin||null,Number(b.year),b.make,b.model,b.trim||null,Number(b.price||0),Number(b.mileage||0),Number(b.purchasePrice||0),Number(b.auctionFees||0),Number(b.transportCost||0),Number(b.reconCost||0),Number(b.otherCost||0),b.acquiredAt||null,b.bodyStyle||null,b.exteriorColor||null,b.interiorColor||null,b.drivetrain||null,b.transmission||null,b.engine||null,b.fuelType||null,b.mpgCombined?Number(b.mpgCombined):null,b.titleStatus||null,b.status||'acquired',b.description||null,JSON.stringify(b.features||[])]);
  try{
    const generated=await generateAndPersistVehicleDescription(result.rows[0].id);
    return reply.code(201).send(generated.vehicle);
  }catch(err){
    req.log.warn({err,vehicleId:result.rows[0].id},'Automatic description generation failed');
    return reply.code(201).send(result.rows[0]);
  }
});

app.patch('/api/v1/admin/vehicles/:id', { preHandler: requireAdmin }, async (req, reply) => {
  const allowed = {
    stockNumber:'stock_number', vin:'vin', year:'year', make:'make', model:'model', trim:'trim', price:'price', mileage:'mileage', purchasePrice:'purchase_price', auctionFees:'auction_fees', transportCost:'transport_cost', reconCost:'recon_cost', otherCost:'other_cost', acquiredAt:'acquired_at',
    bodyStyle:'body_style', exteriorColor:'exterior_color', interiorColor:'interior_color', drivetrain:'drivetrain', transmission:'transmission',
    engine:'engine', fuelType:'fuel_type', mpgCombined:'mpg_combined', titleStatus:'title_status', status:'status', description:'description', features:'features', photoSourceUrl:'photo_source_url'
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

app.post('/api/v1/admin/vehicles/:id/generate-description', { preHandler: requireAdmin }, async (req, reply) => {
  try{
    const result=await generateAndPersistVehicleDescription(req.params.id);
    return {
      ok:true,
      vehicle:result.vehicle,
      sources:result.sources
    };
  }catch(err){
    if(String(err?.message)==='vehicle_not_found')return reply.code(404).send({error:'vehicle_not_found'});
    req.log.warn({err,vehicleId:req.params.id},'Vehicle description generation failed');
    return reply.code(502).send({error:'description_generation_failed'});
  }
});

app.post('/api/v1/admin/vehicles/:id/archive', { preHandler: requireAdmin }, async (req, reply) => {
  const result = await pool.query(`UPDATE vehicles SET status='archived',updated_at=now() WHERE id=$1 RETURNING id,status`, [req.params.id]);
  if (!result.rowCount) return reply.code(404).send({ error:'not_found' });
  return result.rows[0];
});

app.get('/api/v1/admin/google-drive/status', { preHandler: requireAdmin }, async () => {
  const key=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  return {
    configured:Boolean(key),
    keyFormatValid:/^AIza[0-9A-Za-z_-]{20,}$/.test(key),
    keyLength:key.length
  };
});

app.post('/api/v1/admin/vehicles/:id/images/import-drive', { preHandler: requireAdmin }, async (req, reply) => {
  const startedAt=Date.now();
  const folderUrl=String(req.body?.folderUrl||'').trim();
  if(!folderUrl)return reply.code(400).send({error:'google_drive_folder_url_required'});

  const vehicle=await pool.query(
    'SELECT id,year,make,model FROM vehicles WHERE id=$1',
    [req.params.id]
  );
  if(!vehicle.rowCount)return reply.code(404).send({error:'vehicle_not_found'});

  let files;
  try{
    files=await listPublicGoogleDriveImages(folderUrl);
  }catch(err){
    const code=String(err?.message||'google_drive_list_failed');
    const status=code==='google_drive_not_configured'?503:
      code==='google_drive_api_key_invalid'?503:
      code==='google_drive_api_disabled'?503:
      code==='google_drive_api_key_restricted'?503:
      code==='invalid_google_drive_folder_url'?400:
      code==='google_drive_folder_not_public'?403:502;
    return reply.code(status).send({error:code});
  }
  if(!files.length)return reply.code(422).send({error:'google_drive_no_images'});

  const existing=await pool.query(
    "SELECT source_id FROM vehicle_images WHERE vehicle_id=$1 AND source_type='google_drive' AND source_id IS NOT NULL",
    [req.params.id]
  );
  const importedIds=new Set(existing.rows.map(r=>r.source_id));
  const stats=await pool.query(
    'SELECT count(*)::int AS count, coalesce(max(sort_order),-1)::int AS max_sort FROM vehicle_images WHERE vehicle_id=$1',
    [req.params.id]
  );

  let nextSort=stats.rows[0].max_sort+1;
  let coverAvailable=stats.rows[0].count>0;
  const imported=[];
  const skipped=[];
  const failed=[];
  const alt=`${vehicle.rows[0].year} ${vehicle.rows[0].make} ${vehicle.rows[0].model}`;
  const concurrency=googleDriveImportConcurrency();

  const pending=[];
  for(const file of files){
    if(importedIds.has(file.id)){
      skipped.push({id:file.id,name:file.name,reason:'already_imported'});
    }else{
      pending.push(file);
    }
  }

  for(let offset=0;offset<pending.length;offset+=concurrency){
    const batch=pending.slice(offset,offset+concurrency);

    const processed=await Promise.all(batch.map(async file=>{
      const itemStartedAt=Date.now();
      try{
        const raw=await downloadPublicGoogleDriveImage(file);
        const optimized=await sharp(raw,{failOn:'none'})
          .rotate()
          .resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true})
          .webp({quality:82,effort:3,smartSubsample:true})
          .toBuffer();

        return {
          ok:true,
          file,
          optimized,
          processingMs:Date.now()-itemStartedAt
        };
      }catch(err){
        req.log.warn({err,fileId:file.id,fileName:file.name},'Google Drive vehicle image import failed');
        return {
          ok:false,
          file,
          reason:String(err?.message||'import_failed')
        };
      }
    }));

    const successful=processed.filter(x=>x.ok);
    const batchSortStart=nextSort;

    const insertResults=await Promise.all(successful.map(async(item,index)=>{
      const imageId=crypto.randomUUID();
      const path='/api/v1/vehicle-images/'+imageId;
      const isCover=!coverAvailable&&index===0;
      const sortOrder=batchSortStart+index;

      const inserted=await pool.query(`
        INSERT INTO vehicle_images(
          id,vehicle_id,path,alt_text,sort_order,is_cover,content_type,original_name,size_bytes,image_data,
          source_type,source_id,source_url
        )
        VALUES($1,$2,$3,$4,$5,$6,'image/webp',$7,$8,$9,'google_drive',$10,$11)
        ON CONFLICT DO NOTHING
        RETURNING id,path,alt_text,sort_order,is_cover,content_type,original_name,size_bytes,created_at
      `,[
        imageId,req.params.id,path,alt,sortOrder,isCover,item.file.name||null,item.optimized.length,item.optimized,
        item.file.id,item.file.webContentLink||null
      ]);

      return {
        item,
        row:inserted.rows[0]||null
      };
    }));

    for(const result of insertResults){
      if(result.row){
        imported.push(result.row);
        importedIds.add(result.item.file.id);
      }else{
        skipped.push({
          id:result.item.file.id,
          name:result.item.file.name,
          reason:'already_imported'
        });
      }
    }

    for(const item of processed.filter(x=>!x.ok)){
      failed.push({
        id:item.file.id,
        name:item.file.name,
        reason:item.reason
      });
    }

    nextSort+=successful.length;
    if(insertResults.some(x=>x.row))coverAvailable=true;
  }

  await pool.query(
    'UPDATE vehicles SET photo_source_url=$1, photo_source_synced_at=now(), updated_at=now() WHERE id=$2',
    [folderUrl,req.params.id]
  );

  const elapsedMs=Date.now()-startedAt;
  req.log.info({
    vehicleId:req.params.id,
    found:files.length,
    imported:imported.length,
    skipped:skipped.length,
    failed:failed.length,
    concurrency,
    elapsedMs
  },'Google Drive vehicle image import completed');

  return {
    ok:true,
    found:files.length,
    importedCount:imported.length,
    skippedCount:skipped.length,
    failedCount:failed.length,
    concurrency,
    elapsedMs,
    imported,
    skipped,
    failed
  };
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

app.get('/api/v1/admin/distribution/connections', { preHandler: requireAdmin }, async req => {
  const result=await pool.query('SELECT * FROM distribution_connections ORDER BY channel');
  const apiOrigin=absoluteApiOrigin(req);
  return {
    connections:result.rows,
    canManage:req.admin.role==='owner',
    feeds:{
      google:apiOrigin+'/api/v1/feeds/google-vehicles.tsv',
      inventoryCsv:apiOrigin+'/api/v1/feeds/inventory.csv',
      inventoryJson:apiOrigin+'/api/v1/feeds/inventory.json'
    },
    publicSiteUrl:PUBLIC_SITE_URL
  };
});

app.put('/api/v1/admin/distribution/connections/:channel', { preHandler: requireOwner }, async (req, reply) => {
  const channel=String(req.params.channel||'').toLowerCase();
  if(!DISTRIBUTION_CHANNELS.has(channel))return reply.code(400).send({error:'invalid_channel'});
  if(channel==='website')return reply.code(400).send({error:'website_connection_is_internal'});

  const current=await pool.query('SELECT * FROM distribution_connections WHERE channel=$1',[channel]);
  if(!current.rowCount)return reply.code(404).send({error:'connection_not_found'});

  const previous=current.rows[0];
  const enabled=req.body?.enabled!==undefined?Boolean(req.body.enabled):previous.enabled;
  const accountLabel=req.body?.accountLabel!==undefined?String(req.body.accountLabel||'').trim():previous.account_label;
  const incomingConfig=req.body?.config&&typeof req.body.config==='object'?req.body.config:{};
  const config={...(previous.config||{}),...incomingConfig};

  const mode=channel==='google'?'scheduled_feed':channel==='facebook'?'manual':'partner_feed';
  const status=enabled?'setup':'not_connected';
  const result=await pool.query(`
    UPDATE distribution_connections
    SET enabled=$1,status=$2,mode=$3,account_label=$4,config=$5,last_error=null,updated_at=now()
    WHERE channel=$6
    RETURNING *
  `,[enabled,status,mode,accountLabel||null,JSON.stringify(config),channel]);
  return {connection:result.rows[0]};
});

app.post('/api/v1/admin/distribution/connections/:channel/test', { preHandler: requireAdmin }, async (req, reply) => {
  const channel=String(req.params.channel||'').toLowerCase();
  if(!DISTRIBUTION_CHANNELS.has(channel))return reply.code(400).send({error:'invalid_channel'});

  const connectionResult=await pool.query('SELECT * FROM distribution_connections WHERE channel=$1',[channel]);
  if(!connectionResult.rowCount)return reply.code(404).send({error:'connection_not_found'});
  const connection=connectionResult.rows[0];
  const config=connection.config||{};
  const vehicles=await getDistributionInventory();

  const issues=[];
  let eligible=vehicles.length;

  if(channel==='website'){
    if(!vehicles.length)issues.push('No publishable vehicles in inventory');
  }else if(channel==='google'){
    if(!String(config.merchantCenterId||'').trim())issues.push('Merchant Center ID is missing');
    if(!String(config.dealershipName||'').trim())issues.push('Dealership name is missing');
    if(!String(config.dealershipAddress||'').trim())issues.push('Dealership address is missing');
    if((config.fulfillment||'in_store')==='in_store'&&!String(config.storeCode||'').trim())issues.push('Google store code is missing for in-store fulfillment');

    const googleVehicles=vehicles.filter(v=>['ready_to_publish','available'].includes(v.status));
    eligible=0;
    for(const v of googleVehicles){
      const missing=[];
      if(!v.vin)missing.push('VIN');
      if(!v.make)missing.push('make');
      if(!v.model)missing.push('model');
      if(!v.year)missing.push('year');
      if(!(Number(v.price)>0))missing.push('price');
      if(!(Number(v.mileage)>=0))missing.push('mileage');
      if(!v.cover_path)missing.push('photo');
      if(!v.description)missing.push('description');
      if(missing.length)issues.push(`${v.stock_number||v.id}: missing ${missing.join(', ')}`);
      else eligible++;
    }
    if(!googleVehicles.length)issues.push('No Ready to Publish / Available vehicles');
    if(/onrender\.com/i.test(PUBLIC_SITE_URL))issues.push('Production domain is not connected yet; use phillycars.com before Google review');
  }else if(channel==='facebook'){
    issues.push('Direct dealer Marketplace automation is not configured; keep this channel manual until Meta business access is confirmed');
  }else{
    if(!String(config.dealerAccountId||'').trim())issues.push('Dealer account ID is missing');
    issues.push('Provider feed specification/onboarding confirmation is still required');
  }

  const ready=channel==='website'?issues.length===0:
    channel==='google'?issues.length===0&&eligible>0:false;
  const nextStatus=channel==='website'?'connected':ready?'ready':connection.enabled?'setup':'not_connected';
  const lastError=issues.length?issues.slice(0,20).join(' | '):null;
  const updated=await pool.query(`
    UPDATE distribution_connections
    SET status=$1,last_tested_at=now(),last_error=$2,updated_at=now()
    WHERE channel=$3
    RETURNING *
  `,[nextStatus,lastError,channel]);

  return {
    ok:issues.length===0,
    ready,
    eligibleVehicles:eligible,
    totalVehicles:vehicles.length,
    issues,
    connection:updated.rows[0]
  };
});

app.post('/api/v1/admin/distribution/connections/:channel/confirm', { preHandler: requireOwner }, async (req, reply) => {
  const channel=String(req.params.channel||'').toLowerCase();
  if(!DISTRIBUTION_CHANNELS.has(channel)||channel==='website')return reply.code(400).send({error:'invalid_channel'});
  const result=await pool.query(`
    UPDATE distribution_connections
    SET enabled=true,status='connected',last_sync_at=now(),last_error=null,updated_at=now()
    WHERE channel=$1
    RETURNING *
  `,[channel]);
  if(!result.rowCount)return reply.code(404).send({error:'connection_not_found'});
  return {connection:result.rows[0]};
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
{
  const driveKey=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  app.log.info({
    configured:Boolean(driveKey),
    keyFormatValid:/^AIza[0-9A-Za-z_-]{20,}$/.test(driveKey),
    keyLength:driveKey.length
  },'Google Drive integration diagnostics');
}
await app.listen({ port: PORT, host: '0.0.0.0' });+backfillValues.length);
  }
  if(!String(vehicle.interior_color||'').trim() && carfaxSummary?.interiorColor){
    backfillValues.push(carfaxSummary.interiorColor);
    backfillSets.push('interior_color=
  const currentIsGeneric=/^(automatic|manual)$/i.test(currentTransmission);
  if(detailedTransmission && (!currentTransmission||currentIsGeneric) && detailedTransmission.toLowerCase()!==currentTransmission.toLowerCase()){
    const transmissionUpdate=await pool.query(
      'UPDATE vehicles SET transmission=$1,updated_at=now() WHERE id=$2 RETURNING *',
      [detailedTransmission,vehicleId]
    );
    if(transmissionUpdate.rowCount)vehicle=transmissionUpdate.rows[0];
  }

  let recalls=null;
  try{recalls=await fetchNhtsaRecalls(vehicle.year,vehicle.make,vehicle.model);}
  catch(err){app.log.warn({err,vehicleId},'Description recall enrichment unavailable');}

  const description=buildVehicleDescription(vehicle,{carfaxSummary,vinDecode,recalls});
  const generatedAt=new Date().toISOString();
  const sources={
    generator:'philly-cars-marketplace-v2',
    generatedAt,
    carfax:carfaxSummary?{
      documentId:carfaxDocument?.id||null,
      originalName:carfaxDocument?.original_name||null,
      reportDate:carfaxSummary.reportDate||null
    }:null,
    nhtsaVpic:vehicle.vin?{
      url:'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/'+encodeURIComponent(vehicle.vin)+'?format=json'
    }:null,
    nhtsaRecalls:recalls?{
      url:recalls.sourceUrl,
      count:recalls.count,
      campaigns:recalls.campaigns
    }:null
  };

  const updated=await pool.query(`
    UPDATE vehicles
    SET description=$1,description_generated_at=$2,description_sources=$3,updated_at=now()
    WHERE id=$4
    RETURNING *
  `,[description,generatedAt,JSON.stringify(sources),vehicleId]);

  return {vehicle:updated.rows[0],sources};
}

function parseGoogleDriveFolderLink(value='') {
  const raw=String(value||'').trim();
  if(!raw)return null;
  try{
    const url=new URL(raw);
    if(!/(^|\.)drive\.google\.com$/i.test(url.hostname))return null;
    const match=url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
    if(!match)return null;
    return {
      folderId:match[1],
      resourceKey:url.searchParams.get('resourcekey')||url.searchParams.get('resourceKey')||''
    };
  }catch{
    return null;
  }
}

async function listPublicGoogleDriveImages(folderUrl) {
  const apiKey=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  if(!apiKey)throw new Error('google_drive_not_configured');
  const parsed=parseGoogleDriveFolderLink(folderUrl);
  if(!parsed)throw new Error('invalid_google_drive_folder_url');

  const queue=[parsed];
  const visited=new Set();
  const images=[];
  let foldersScanned=0;

  while(queue.length && foldersScanned<20 && images.length<100){
    const folder=queue.shift();
    if(!folder?.folderId||visited.has(folder.folderId))continue;
    visited.add(folder.folderId);
    foldersScanned++;

    let pageToken='';
    do{
      const params=new URLSearchParams({
        q:`'${folder.folderId}' in parents and trashed = false`,
        fields:'nextPageToken,files(id,name,mimeType,size,webContentLink,resourceKey,capabilities(canDownload))',
        pageSize:'1000',
        supportsAllDrives:'true',
        includeItemsFromAllDrives:'true',
        key:apiKey
      });
      if(pageToken)params.set('pageToken',pageToken);
      const headers={Accept:'application/json'};
      if(folder.resourceKey)headers['X-Goog-Drive-Resource-Keys']=folder.folderId+'/'+folder.resourceKey;

      const response=await fetch('https://www.googleapis.com/drive/v3/files?'+params.toString(),{
        headers,
        signal:AbortSignal.timeout(15000)
      });
      if(!response.ok){
        let googleError={};
        try{googleError=await response.json();}catch{}
        const message=String(googleError?.error?.message||'');
        const reason=String(googleError?.error?.errors?.[0]?.reason||'');
        app.log.warn({
          status:response.status,
          reason:reason||null,
          googleMessage:message||null,
          folderId:folder.folderId
        },'Google Drive public-folder list failed');

        if(response.status===400 && /api key not valid|invalid api key/i.test(message)){
          throw new Error('google_drive_api_key_invalid');
        }
        if(response.status===403 && /api.*not.*enabled|accessnotconfigured|service disabled/i.test(message+' '+reason)){
          throw new Error('google_drive_api_disabled');
        }
        if(response.status===403 && /referer|referrer|ip address|blocked|forbidden/i.test(message+' '+reason)){
          throw new Error('google_drive_api_key_restricted');
        }
        if(response.status===403||response.status===404)throw new Error('google_drive_folder_not_public');
        throw new Error('google_drive_list_failed');
      }
      const data=await response.json();
      for(const file of data.files||[]){
        if(file.mimeType==='application/vnd.google-apps.folder'){
          queue.push({folderId:file.id,resourceKey:file.resourceKey||''});
          continue;
        }
        if(/^image\//i.test(file.mimeType||'') && file.capabilities?.canDownload!==false){
          images.push(file);
          if(images.length>=100)break;
        }
      }
      pageToken=data.nextPageToken||'';
    }while(pageToken && images.length<100);
  }

  return images.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{numeric:true,sensitivity:'base'}));
}

async function downloadPublicGoogleDriveImage(file) {
  const maxBytes=30*1024*1024;
  const declared=Number(file.size||0);
  if(declared>maxBytes)throw new Error('drive_image_too_large');

  const apiKey=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  let response=null;

  if(apiKey&&file.id){
    const params=new URLSearchParams({
      alt:'media',
      supportsAllDrives:'true',
      key:apiKey
    });
    const headers={
      'User-Agent':'PhillyCars/1.0',
      Accept:file.mimeType||'image/*'
    };
    if(file.resourceKey)headers['X-Goog-Drive-Resource-Keys']=file.id+'/'+file.resourceKey;

    try{
      response=await fetch(
        'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?'+params.toString(),
        {
          redirect:'follow',
          signal:AbortSignal.timeout(30000),
          headers
        }
      );
    }catch{}
  }

  if((!response||!response.ok)&&file.webContentLink){
    try{await response?.body?.cancel();}catch{}
    response=await fetch(file.webContentLink,{
      redirect:'follow',
      signal:AbortSignal.timeout(30000),
      headers:{'User-Agent':'PhillyCars/1.0'}
    });
  }

  if(!response||!response.ok)throw new Error('drive_image_download_failed');

  const contentLength=Number(response.headers.get('content-length')||0);
  if(contentLength>maxBytes)throw new Error('drive_image_too_large');
  const data=Buffer.from(await response.arrayBuffer());
  if(!data.length)throw new Error('drive_image_empty');
  if(data.length>maxBytes)throw new Error('drive_image_too_large');
  return data;
}

function googleDriveImportConcurrency(){
  const configured=Number(process.env.DRIVE_IMPORT_CONCURRENCY||3);
  if(!Number.isFinite(configured))return 3;
  return Math.max(1,Math.min(4,Math.floor(configured)));
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
    const normalizedEmail=String(extraEmail).trim().toLowerCase();
    const provisioned=await pool.query(`
      INSERT INTO admin_users(email,password_hash,role,active)
      VALUES($1,$2,$3,true)
      ON CONFLICT (email)
      DO UPDATE SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, active=true
      RETURNING id
    `, [normalizedEmail, hash, extraRole]);
    await pool.query('DELETE FROM admin_sessions WHERE user_id=$1', [provisioned.rows[0].id]);
    app.log.info({ email: normalizedEmail, role: extraRole }, 'Extra admin account provisioned');
  }
}

async function requireAdmin(req, reply) {
  if (!pool) return reply.code(503).send({ error: 'database_not_connected' });
  const auth = String(req.headers.authorization || '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const raw = bearer || req.cookies[COOKIE];
  if (!raw) return reply.code(401).send({ error: 'unauthorized' });
  const result = await pool.query(`
    SELECT u.id, u.email, u.role
    FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active=true
  `, [hashToken(raw)]);
  if (!result.rowCount) return reply.code(401).send({ error: 'unauthorized' });
  req.admin = result.rows[0];
  req.adminSessionToken = raw;
}

async function requireOwner(req, reply) {
  await requireAdmin(req, reply);
  if (reply.sent) return;
  if (req.admin?.role !== 'owner') {
    return reply.code(403).send({ error: 'owner_required' });
  }
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

app.get('/api/v1/feeds/inventory.json', async req => {
  const vehicles=await getDistributionInventory();
  return {
    generatedAt:new Date().toISOString(),
    source:'Philly Cars',
    vehicles:vehicles.map(v=>({
      id:v.id,
      stockNumber:v.stock_number,
      vin:v.vin,
      year:v.year,
      make:v.make,
      model:v.model,
      trim:v.trim,
      price:v.price,
      mileage:v.mileage,
      bodyStyle:v.body_style,
      exteriorColor:v.exterior_color,
      interiorColor:v.interior_color,
      drivetrain:v.drivetrain,
      transmission:v.transmission,
      engine:v.engine,
      fuelType:v.fuel_type,
      titleStatus:v.title_status,
      status:v.status,
      description:v.description,
      features:v.features,
      url:vehicleVdpUrl(v),
      imageUrl:absoluteVehicleImageUrl(req,v.cover_path)
    }))
  };
});

app.get('/api/v1/feeds/inventory.csv', async (req, reply) => {
  const vehicles=await getDistributionInventory();
  const header=['stock_number','vin','year','make','model','trim','price','mileage','body_style','exterior_color','interior_color','drivetrain','transmission','engine','fuel_type','title_status','status','description','features','url','image_url'];
  const rows=vehicles.map(v=>[
    v.stock_number,v.vin,v.year,v.make,v.model,v.trim,v.price,v.mileage,v.body_style,v.exterior_color,
    v.interior_color,v.drivetrain,v.transmission,v.engine,v.fuel_type,v.title_status,v.status,v.description,
    Array.isArray(v.features)?v.features.join(', '):'',vehicleVdpUrl(v),absoluteVehicleImageUrl(req,v.cover_path)
  ].map(csvCell).join(','));
  reply.header('Content-Type','text/csv; charset=utf-8');
  reply.header('Content-Disposition','inline; filename="philly-cars-inventory.csv"');
  reply.header('Cache-Control','public, max-age=300');
  return reply.send([header.map(csvCell).join(','),...rows].join('\n'));
});

app.get('/api/v1/feeds/google-vehicles.tsv', async (req, reply) => {
  const configResult=await pool.query("SELECT config FROM distribution_connections WHERE channel='google' LIMIT 1");
  const config=configResult.rows[0]?.config||{};
  const fulfillment=config.fulfillment==='online'?'online':'in_store';
  const storeCode=String(config.storeCode||'').trim();
  const vehicles=(await getDistributionInventory()).filter(v=>['ready_to_publish','available'].includes(v.status));

  const header=[
    'id','title','description','link','link_template','image_link','availability','price','condition','brand','model','year',
    'mileage','color','vin','vehicle_option','vehicle_fulfillment(option)','vehicle_fulfillment(store_code)'
  ];
  const rows=vehicles.map(v=>{
    const title=[v.year,v.make,v.model,v.trim].filter(Boolean).join(' ');
    const options=Array.isArray(v.features)?v.features.join(', '):'';
    return [
      v.stock_number||v.id,
      title,
      v.description||title,
      vehicleVdpUrl(v),
      fulfillment==='in_store'
        ?PUBLIC_SITE_URL+'/?store={store_code}#/vehicle/'+encodeURIComponent(v.slug)
        :'',
      absoluteVehicleImageUrl(req,v.cover_path),
      'in_stock',
      Number(v.price||0).toFixed(2)+' USD',
      'used',
      v.make,
      v.model,
      v.year,
      Number(v.mileage||0)+' miles',
      v.exterior_color||'',
      v.vin||'',
      options,
      fulfillment,
      fulfillment==='in_store'?storeCode:''
    ].map(tsvCell).join('\t');
  });

  reply.header('Content-Type','text/tab-separated-values; charset=utf-8');
  reply.header('Content-Disposition','inline; filename="philly-cars-google-vehicles.tsv"');
  reply.header('Cache-Control','public, max-age=300');
  return reply.send([header.join('\t'),...rows].join('\n'));
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
  return {
    user: { email: result.rows[0].email, role: result.rows[0].role },
    sessionToken: raw,
    expiresAt: expires.toISOString()
  };
});

app.get('/api/v1/admin/me', { preHandler: requireAdmin }, async req => ({ user: req.admin }));

app.delete('/api/v1/admin/session', { preHandler: requireAdmin }, async (req, reply) => {
  const raw = req.adminSessionToken || req.cookies[COOKIE];
  if (raw) await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1', [hashToken(raw)]);
  reply.clearCookie(COOKIE, { path: '/' });
  return { ok: true };
});

app.get('/api/v1/admin/accounts', { preHandler: requireAdmin }, async req => {
  const result = await pool.query(`
    SELECT id,email,role,active,created_at,last_login_at
    FROM admin_users
    ORDER BY CASE WHEN role='owner' THEN 0 ELSE 1 END, created_at ASC
  `);
  return {
    accounts: result.rows,
    currentUserId: req.admin.id,
    currentRole: req.admin.role,
    canManage: req.admin.role === 'owner'
  };
});

app.post('/api/v1/admin/accounts', { preHandler: requireOwner }, async (req, reply) => {
  const { email, password, role='manager', active=true } = req.body || {};
  const normalizedEmail=String(email||'').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return reply.code(400).send({ error: 'valid_email_required' });
  }
  if (String(password||'').length < 12) {
    return reply.code(400).send({ error: 'password_min_12' });
  }
  if (!['owner','manager'].includes(role)) {
    return reply.code(400).send({ error: 'invalid_role' });
  }
  const hash=await bcrypt.hash(String(password),12);
  try {
    const result=await pool.query(`
      INSERT INTO admin_users(email,password_hash,role,active)
      VALUES($1,$2,$3,$4)
      RETURNING id,email,role,active,created_at,last_login_at
    `,[normalizedEmail,hash,role,Boolean(active)]);
    return reply.code(201).send({ account: result.rows[0] });
  } catch (err) {
    if (err?.code==='23505') return reply.code(409).send({ error: 'email_already_exists' });
    throw err;
  }
});

app.patch('/api/v1/admin/accounts/:id', { preHandler: requireOwner }, async (req, reply) => {
  const accountId=String(req.params.id||'');
  const existing=await pool.query(
    'SELECT id,email,role,active FROM admin_users WHERE id=$1',
    [accountId]
  );
  if(!existing.rowCount)return reply.code(404).send({error:'account_not_found'});

  const current=existing.rows[0];
  const email=req.body?.email!==undefined?String(req.body.email).trim().toLowerCase():current.email;
  const role=req.body?.role!==undefined?String(req.body.role):current.role;
  const active=req.body?.active!==undefined?Boolean(req.body.active):current.active;
  const password=req.body?.password!==undefined?String(req.body.password):'';

  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply.code(400).send({error:'valid_email_required'});
  if(!['owner','manager'].includes(role))return reply.code(400).send({error:'invalid_role'});
  if(password && password.length<12)return reply.code(400).send({error:'password_min_12'});

  const removingOwner = current.role==='owner' && current.active && (role!=='owner' || !active);
  if(removingOwner){
    const owners=await pool.query(
      "SELECT count(*)::int AS count FROM admin_users WHERE role='owner' AND active=true AND id<>$1",
      [accountId]
    );
    if(owners.rows[0].count<1)return reply.code(409).send({error:'last_owner_required'});
  }

  const values=[email,role,active,accountId];
  let passwordSql='';
  if(password){
    const hash=await bcrypt.hash(password,12);
    values.push(hash);
    passwordSql=', password_hash=$5';
  }

  try{
    const result=await pool.query(`
      UPDATE admin_users
      SET email=$1, role=$2, active=$3${passwordSql}
      WHERE id=$4
      RETURNING id,email,role,active,created_at,last_login_at
    `,values);

    const securityChanged = Boolean(password) || role!==current.role || active!==current.active;
    if(securityChanged){
      await pool.query('DELETE FROM admin_sessions WHERE user_id=$1',[accountId]);
    }

    return {
      account:result.rows[0],
      reauthRequired: securityChanged && accountId===req.admin.id
    };
  }catch(err){
    if(err?.code==='23505')return reply.code(409).send({error:'email_already_exists'});
    throw err;
  }
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

  let recalls=null;
  try{recalls=await fetchNhtsaRecalls(decoded.year,decoded.make,decoded.model);}
  catch(err){req.log.warn({err,vin:summary.vin},'CARFAX description recall enrichment unavailable');}

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

    const descriptionSeed={
      year:decoded.year,make:decoded.make,model:decoded.model,trim:decoded.trim||null,
      mileage:summary.mileage||0,body_style:decoded.bodyStyle||null,
      exterior_color:summary.exteriorColor||null,interior_color:summary.interiorColor||null,
      drivetrain:decoded.drivetrain||null,
      transmission:summary.transmission||decoded.transmission||null,engine:decoded.engine||null,fuel_type:decoded.fuelType||null,
      title_status:titleStatus,stock_number:stockNumber,vin:summary.vin
    };
    const generatedDescription=buildVehicleDescription(descriptionSeed,{
      carfaxSummary:summary,
      vinDecode:decoded,
      recalls
    });
    const descriptionGeneratedAt=new Date().toISOString();

    const vehicleResult=await client.query(`
      INSERT INTO vehicles(
        slug,stock_number,vin,year,make,model,trim,price,mileage,
        acquired_at,body_style,exterior_color,interior_color,drivetrain,transmission,engine,fuel_type,title_status,status,
        description,description_generated_at
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'acquired',$18,$19)
      RETURNING *
    `,[
      slug,stockNumber,summary.vin,decoded.year,decoded.make,decoded.model,decoded.trim||null,
      summary.mileage||0,acquiredAt,decoded.bodyStyle||null,
      summary.exteriorColor||null,summary.interiorColor||null,decoded.drivetrain||null,
      summary.transmission||decoded.transmission||null,decoded.engine||null,decoded.fuelType||null,titleStatus,
      generatedDescription,descriptionGeneratedAt
    ]);
    let vehicle=vehicleResult.rows[0];

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

    const descriptionSources={
      generator:'philly-cars-marketplace-v2',
      generatedAt:descriptionGeneratedAt,
      carfax:{
        documentId:documentResult.rows[0].id,
        originalName:documentResult.rows[0].original_name,
        reportDate:summary.reportDate||null
      },
      nhtsaVpic:{
        url:'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/'+encodeURIComponent(summary.vin)+'?format=json'
      },
      nhtsaRecalls:recalls?{
        url:recalls.sourceUrl,
        count:recalls.count,
        campaigns:recalls.campaigns
      }:null
    };
    const descriptionUpdate=await client.query(
      'UPDATE vehicles SET description_sources=$1 WHERE id=$2 RETURNING *',
      [JSON.stringify(descriptionSources),vehicle.id]
    );
    vehicle=descriptionUpdate.rows[0];

    await client.query('COMMIT');
    return reply.code(201).send({
      vehicle,
      carfax:parsedData,
      document:documentResult.rows[0],
      descriptionSources
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
    INSERT INTO vehicles(slug,stock_number,vin,year,make,model,trim,price,mileage,purchase_price,auction_fees,transport_cost,recon_cost,other_cost,acquired_at,body_style,exterior_color,interior_color,drivetrain,transmission,engine,fuel_type,mpg_combined,title_status,status,description,features)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *
  `,[slug,b.stockNumber,b.vin||null,Number(b.year),b.make,b.model,b.trim||null,Number(b.price||0),Number(b.mileage||0),Number(b.purchasePrice||0),Number(b.auctionFees||0),Number(b.transportCost||0),Number(b.reconCost||0),Number(b.otherCost||0),b.acquiredAt||null,b.bodyStyle||null,b.exteriorColor||null,b.interiorColor||null,b.drivetrain||null,b.transmission||null,b.engine||null,b.fuelType||null,b.mpgCombined?Number(b.mpgCombined):null,b.titleStatus||null,b.status||'acquired',b.description||null,JSON.stringify(b.features||[])]);
  try{
    const generated=await generateAndPersistVehicleDescription(result.rows[0].id);
    return reply.code(201).send(generated.vehicle);
  }catch(err){
    req.log.warn({err,vehicleId:result.rows[0].id},'Automatic description generation failed');
    return reply.code(201).send(result.rows[0]);
  }
});

app.patch('/api/v1/admin/vehicles/:id', { preHandler: requireAdmin }, async (req, reply) => {
  const allowed = {
    stockNumber:'stock_number', vin:'vin', year:'year', make:'make', model:'model', trim:'trim', price:'price', mileage:'mileage', purchasePrice:'purchase_price', auctionFees:'auction_fees', transportCost:'transport_cost', reconCost:'recon_cost', otherCost:'other_cost', acquiredAt:'acquired_at',
    bodyStyle:'body_style', exteriorColor:'exterior_color', interiorColor:'interior_color', drivetrain:'drivetrain', transmission:'transmission',
    engine:'engine', fuelType:'fuel_type', mpgCombined:'mpg_combined', titleStatus:'title_status', status:'status', description:'description', features:'features', photoSourceUrl:'photo_source_url'
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

app.post('/api/v1/admin/vehicles/:id/generate-description', { preHandler: requireAdmin }, async (req, reply) => {
  try{
    const result=await generateAndPersistVehicleDescription(req.params.id);
    return {
      ok:true,
      vehicle:result.vehicle,
      sources:result.sources
    };
  }catch(err){
    if(String(err?.message)==='vehicle_not_found')return reply.code(404).send({error:'vehicle_not_found'});
    req.log.warn({err,vehicleId:req.params.id},'Vehicle description generation failed');
    return reply.code(502).send({error:'description_generation_failed'});
  }
});

app.post('/api/v1/admin/vehicles/:id/archive', { preHandler: requireAdmin }, async (req, reply) => {
  const result = await pool.query(`UPDATE vehicles SET status='archived',updated_at=now() WHERE id=$1 RETURNING id,status`, [req.params.id]);
  if (!result.rowCount) return reply.code(404).send({ error:'not_found' });
  return result.rows[0];
});

app.get('/api/v1/admin/google-drive/status', { preHandler: requireAdmin }, async () => {
  const key=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  return {
    configured:Boolean(key),
    keyFormatValid:/^AIza[0-9A-Za-z_-]{20,}$/.test(key),
    keyLength:key.length
  };
});

app.post('/api/v1/admin/vehicles/:id/images/import-drive', { preHandler: requireAdmin }, async (req, reply) => {
  const startedAt=Date.now();
  const folderUrl=String(req.body?.folderUrl||'').trim();
  if(!folderUrl)return reply.code(400).send({error:'google_drive_folder_url_required'});

  const vehicle=await pool.query(
    'SELECT id,year,make,model FROM vehicles WHERE id=$1',
    [req.params.id]
  );
  if(!vehicle.rowCount)return reply.code(404).send({error:'vehicle_not_found'});

  let files;
  try{
    files=await listPublicGoogleDriveImages(folderUrl);
  }catch(err){
    const code=String(err?.message||'google_drive_list_failed');
    const status=code==='google_drive_not_configured'?503:
      code==='google_drive_api_key_invalid'?503:
      code==='google_drive_api_disabled'?503:
      code==='google_drive_api_key_restricted'?503:
      code==='invalid_google_drive_folder_url'?400:
      code==='google_drive_folder_not_public'?403:502;
    return reply.code(status).send({error:code});
  }
  if(!files.length)return reply.code(422).send({error:'google_drive_no_images'});

  const existing=await pool.query(
    "SELECT source_id FROM vehicle_images WHERE vehicle_id=$1 AND source_type='google_drive' AND source_id IS NOT NULL",
    [req.params.id]
  );
  const importedIds=new Set(existing.rows.map(r=>r.source_id));
  const stats=await pool.query(
    'SELECT count(*)::int AS count, coalesce(max(sort_order),-1)::int AS max_sort FROM vehicle_images WHERE vehicle_id=$1',
    [req.params.id]
  );

  let nextSort=stats.rows[0].max_sort+1;
  let coverAvailable=stats.rows[0].count>0;
  const imported=[];
  const skipped=[];
  const failed=[];
  const alt=`${vehicle.rows[0].year} ${vehicle.rows[0].make} ${vehicle.rows[0].model}`;
  const concurrency=googleDriveImportConcurrency();

  const pending=[];
  for(const file of files){
    if(importedIds.has(file.id)){
      skipped.push({id:file.id,name:file.name,reason:'already_imported'});
    }else{
      pending.push(file);
    }
  }

  for(let offset=0;offset<pending.length;offset+=concurrency){
    const batch=pending.slice(offset,offset+concurrency);

    const processed=await Promise.all(batch.map(async file=>{
      const itemStartedAt=Date.now();
      try{
        const raw=await downloadPublicGoogleDriveImage(file);
        const optimized=await sharp(raw,{failOn:'none'})
          .rotate()
          .resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true})
          .webp({quality:82,effort:3,smartSubsample:true})
          .toBuffer();

        return {
          ok:true,
          file,
          optimized,
          processingMs:Date.now()-itemStartedAt
        };
      }catch(err){
        req.log.warn({err,fileId:file.id,fileName:file.name},'Google Drive vehicle image import failed');
        return {
          ok:false,
          file,
          reason:String(err?.message||'import_failed')
        };
      }
    }));

    const successful=processed.filter(x=>x.ok);
    const batchSortStart=nextSort;

    const insertResults=await Promise.all(successful.map(async(item,index)=>{
      const imageId=crypto.randomUUID();
      const path='/api/v1/vehicle-images/'+imageId;
      const isCover=!coverAvailable&&index===0;
      const sortOrder=batchSortStart+index;

      const inserted=await pool.query(`
        INSERT INTO vehicle_images(
          id,vehicle_id,path,alt_text,sort_order,is_cover,content_type,original_name,size_bytes,image_data,
          source_type,source_id,source_url
        )
        VALUES($1,$2,$3,$4,$5,$6,'image/webp',$7,$8,$9,'google_drive',$10,$11)
        ON CONFLICT DO NOTHING
        RETURNING id,path,alt_text,sort_order,is_cover,content_type,original_name,size_bytes,created_at
      `,[
        imageId,req.params.id,path,alt,sortOrder,isCover,item.file.name||null,item.optimized.length,item.optimized,
        item.file.id,item.file.webContentLink||null
      ]);

      return {
        item,
        row:inserted.rows[0]||null
      };
    }));

    for(const result of insertResults){
      if(result.row){
        imported.push(result.row);
        importedIds.add(result.item.file.id);
      }else{
        skipped.push({
          id:result.item.file.id,
          name:result.item.file.name,
          reason:'already_imported'
        });
      }
    }

    for(const item of processed.filter(x=>!x.ok)){
      failed.push({
        id:item.file.id,
        name:item.file.name,
        reason:item.reason
      });
    }

    nextSort+=successful.length;
    if(insertResults.some(x=>x.row))coverAvailable=true;
  }

  await pool.query(
    'UPDATE vehicles SET photo_source_url=$1, photo_source_synced_at=now(), updated_at=now() WHERE id=$2',
    [folderUrl,req.params.id]
  );

  const elapsedMs=Date.now()-startedAt;
  req.log.info({
    vehicleId:req.params.id,
    found:files.length,
    imported:imported.length,
    skipped:skipped.length,
    failed:failed.length,
    concurrency,
    elapsedMs
  },'Google Drive vehicle image import completed');

  return {
    ok:true,
    found:files.length,
    importedCount:imported.length,
    skippedCount:skipped.length,
    failedCount:failed.length,
    concurrency,
    elapsedMs,
    imported,
    skipped,
    failed
  };
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

app.get('/api/v1/admin/distribution/connections', { preHandler: requireAdmin }, async req => {
  const result=await pool.query('SELECT * FROM distribution_connections ORDER BY channel');
  const apiOrigin=absoluteApiOrigin(req);
  return {
    connections:result.rows,
    canManage:req.admin.role==='owner',
    feeds:{
      google:apiOrigin+'/api/v1/feeds/google-vehicles.tsv',
      inventoryCsv:apiOrigin+'/api/v1/feeds/inventory.csv',
      inventoryJson:apiOrigin+'/api/v1/feeds/inventory.json'
    },
    publicSiteUrl:PUBLIC_SITE_URL
  };
});

app.put('/api/v1/admin/distribution/connections/:channel', { preHandler: requireOwner }, async (req, reply) => {
  const channel=String(req.params.channel||'').toLowerCase();
  if(!DISTRIBUTION_CHANNELS.has(channel))return reply.code(400).send({error:'invalid_channel'});
  if(channel==='website')return reply.code(400).send({error:'website_connection_is_internal'});

  const current=await pool.query('SELECT * FROM distribution_connections WHERE channel=$1',[channel]);
  if(!current.rowCount)return reply.code(404).send({error:'connection_not_found'});

  const previous=current.rows[0];
  const enabled=req.body?.enabled!==undefined?Boolean(req.body.enabled):previous.enabled;
  const accountLabel=req.body?.accountLabel!==undefined?String(req.body.accountLabel||'').trim():previous.account_label;
  const incomingConfig=req.body?.config&&typeof req.body.config==='object'?req.body.config:{};
  const config={...(previous.config||{}),...incomingConfig};

  const mode=channel==='google'?'scheduled_feed':channel==='facebook'?'manual':'partner_feed';
  const status=enabled?'setup':'not_connected';
  const result=await pool.query(`
    UPDATE distribution_connections
    SET enabled=$1,status=$2,mode=$3,account_label=$4,config=$5,last_error=null,updated_at=now()
    WHERE channel=$6
    RETURNING *
  `,[enabled,status,mode,accountLabel||null,JSON.stringify(config),channel]);
  return {connection:result.rows[0]};
});

app.post('/api/v1/admin/distribution/connections/:channel/test', { preHandler: requireAdmin }, async (req, reply) => {
  const channel=String(req.params.channel||'').toLowerCase();
  if(!DISTRIBUTION_CHANNELS.has(channel))return reply.code(400).send({error:'invalid_channel'});

  const connectionResult=await pool.query('SELECT * FROM distribution_connections WHERE channel=$1',[channel]);
  if(!connectionResult.rowCount)return reply.code(404).send({error:'connection_not_found'});
  const connection=connectionResult.rows[0];
  const config=connection.config||{};
  const vehicles=await getDistributionInventory();

  const issues=[];
  let eligible=vehicles.length;

  if(channel==='website'){
    if(!vehicles.length)issues.push('No publishable vehicles in inventory');
  }else if(channel==='google'){
    if(!String(config.merchantCenterId||'').trim())issues.push('Merchant Center ID is missing');
    if(!String(config.dealershipName||'').trim())issues.push('Dealership name is missing');
    if(!String(config.dealershipAddress||'').trim())issues.push('Dealership address is missing');
    if((config.fulfillment||'in_store')==='in_store'&&!String(config.storeCode||'').trim())issues.push('Google store code is missing for in-store fulfillment');

    const googleVehicles=vehicles.filter(v=>['ready_to_publish','available'].includes(v.status));
    eligible=0;
    for(const v of googleVehicles){
      const missing=[];
      if(!v.vin)missing.push('VIN');
      if(!v.make)missing.push('make');
      if(!v.model)missing.push('model');
      if(!v.year)missing.push('year');
      if(!(Number(v.price)>0))missing.push('price');
      if(!(Number(v.mileage)>=0))missing.push('mileage');
      if(!v.cover_path)missing.push('photo');
      if(!v.description)missing.push('description');
      if(missing.length)issues.push(`${v.stock_number||v.id}: missing ${missing.join(', ')}`);
      else eligible++;
    }
    if(!googleVehicles.length)issues.push('No Ready to Publish / Available vehicles');
    if(/onrender\.com/i.test(PUBLIC_SITE_URL))issues.push('Production domain is not connected yet; use phillycars.com before Google review');
  }else if(channel==='facebook'){
    issues.push('Direct dealer Marketplace automation is not configured; keep this channel manual until Meta business access is confirmed');
  }else{
    if(!String(config.dealerAccountId||'').trim())issues.push('Dealer account ID is missing');
    issues.push('Provider feed specification/onboarding confirmation is still required');
  }

  const ready=channel==='website'?issues.length===0:
    channel==='google'?issues.length===0&&eligible>0:false;
  const nextStatus=channel==='website'?'connected':ready?'ready':connection.enabled?'setup':'not_connected';
  const lastError=issues.length?issues.slice(0,20).join(' | '):null;
  const updated=await pool.query(`
    UPDATE distribution_connections
    SET status=$1,last_tested_at=now(),last_error=$2,updated_at=now()
    WHERE channel=$3
    RETURNING *
  `,[nextStatus,lastError,channel]);

  return {
    ok:issues.length===0,
    ready,
    eligibleVehicles:eligible,
    totalVehicles:vehicles.length,
    issues,
    connection:updated.rows[0]
  };
});

app.post('/api/v1/admin/distribution/connections/:channel/confirm', { preHandler: requireOwner }, async (req, reply) => {
  const channel=String(req.params.channel||'').toLowerCase();
  if(!DISTRIBUTION_CHANNELS.has(channel)||channel==='website')return reply.code(400).send({error:'invalid_channel'});
  const result=await pool.query(`
    UPDATE distribution_connections
    SET enabled=true,status='connected',last_sync_at=now(),last_error=null,updated_at=now()
    WHERE channel=$1
    RETURNING *
  `,[channel]);
  if(!result.rowCount)return reply.code(404).send({error:'connection_not_found'});
  return {connection:result.rows[0]};
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
{
  const driveKey=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  app.log.info({
    configured:Boolean(driveKey),
    keyFormatValid:/^AIza[0-9A-Za-z_-]{20,}$/.test(driveKey),
    keyLength:driveKey.length
  },'Google Drive integration diagnostics');
}
await app.listen({ port: PORT, host: '0.0.0.0' });+backfillValues.length);
  }
  if(backfillSets.length){
    backfillValues.push(vehicleId);
    const colorUpdate=await pool.query(
      `UPDATE vehicles SET ${backfillSets.join(',')},updated_at=now() WHERE id=${backfillValues.length} RETURNING *`,
      backfillValues
    );
    if(colorUpdate.rowCount)vehicle=colorUpdate.rows[0];
  }

  const detailedTransmission=carfaxSummary?.transmission||vinDecode?.transmission||'';
  const currentTransmission=String(vehicle.transmission||'').trim();
  const currentIsGeneric=/^(automatic|manual)$/i.test(currentTransmission);
  if(detailedTransmission && (!currentTransmission||currentIsGeneric) && detailedTransmission.toLowerCase()!==currentTransmission.toLowerCase()){
    const transmissionUpdate=await pool.query(
      'UPDATE vehicles SET transmission=$1,updated_at=now() WHERE id=$2 RETURNING *',
      [detailedTransmission,vehicleId]
    );
    if(transmissionUpdate.rowCount)vehicle=transmissionUpdate.rows[0];
  }

  let recalls=null;
  try{recalls=await fetchNhtsaRecalls(vehicle.year,vehicle.make,vehicle.model);}
  catch(err){app.log.warn({err,vehicleId},'Description recall enrichment unavailable');}

  const description=buildVehicleDescription(vehicle,{carfaxSummary,vinDecode,recalls});
  const generatedAt=new Date().toISOString();
  const sources={
    generator:'philly-cars-marketplace-v2',
    generatedAt,
    carfax:carfaxSummary?{
      documentId:carfaxDocument?.id||null,
      originalName:carfaxDocument?.original_name||null,
      reportDate:carfaxSummary.reportDate||null
    }:null,
    nhtsaVpic:vehicle.vin?{
      url:'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/'+encodeURIComponent(vehicle.vin)+'?format=json'
    }:null,
    nhtsaRecalls:recalls?{
      url:recalls.sourceUrl,
      count:recalls.count,
      campaigns:recalls.campaigns
    }:null
  };

  const updated=await pool.query(`
    UPDATE vehicles
    SET description=$1,description_generated_at=$2,description_sources=$3,updated_at=now()
    WHERE id=$4
    RETURNING *
  `,[description,generatedAt,JSON.stringify(sources),vehicleId]);

  return {vehicle:updated.rows[0],sources};
}

function parseGoogleDriveFolderLink(value='') {
  const raw=String(value||'').trim();
  if(!raw)return null;
  try{
    const url=new URL(raw);
    if(!/(^|\.)drive\.google\.com$/i.test(url.hostname))return null;
    const match=url.pathname.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
    if(!match)return null;
    return {
      folderId:match[1],
      resourceKey:url.searchParams.get('resourcekey')||url.searchParams.get('resourceKey')||''
    };
  }catch{
    return null;
  }
}

async function listPublicGoogleDriveImages(folderUrl) {
  const apiKey=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  if(!apiKey)throw new Error('google_drive_not_configured');
  const parsed=parseGoogleDriveFolderLink(folderUrl);
  if(!parsed)throw new Error('invalid_google_drive_folder_url');

  const queue=[parsed];
  const visited=new Set();
  const images=[];
  let foldersScanned=0;

  while(queue.length && foldersScanned<20 && images.length<100){
    const folder=queue.shift();
    if(!folder?.folderId||visited.has(folder.folderId))continue;
    visited.add(folder.folderId);
    foldersScanned++;

    let pageToken='';
    do{
      const params=new URLSearchParams({
        q:`'${folder.folderId}' in parents and trashed = false`,
        fields:'nextPageToken,files(id,name,mimeType,size,webContentLink,resourceKey,capabilities(canDownload))',
        pageSize:'1000',
        supportsAllDrives:'true',
        includeItemsFromAllDrives:'true',
        key:apiKey
      });
      if(pageToken)params.set('pageToken',pageToken);
      const headers={Accept:'application/json'};
      if(folder.resourceKey)headers['X-Goog-Drive-Resource-Keys']=folder.folderId+'/'+folder.resourceKey;

      const response=await fetch('https://www.googleapis.com/drive/v3/files?'+params.toString(),{
        headers,
        signal:AbortSignal.timeout(15000)
      });
      if(!response.ok){
        let googleError={};
        try{googleError=await response.json();}catch{}
        const message=String(googleError?.error?.message||'');
        const reason=String(googleError?.error?.errors?.[0]?.reason||'');
        app.log.warn({
          status:response.status,
          reason:reason||null,
          googleMessage:message||null,
          folderId:folder.folderId
        },'Google Drive public-folder list failed');

        if(response.status===400 && /api key not valid|invalid api key/i.test(message)){
          throw new Error('google_drive_api_key_invalid');
        }
        if(response.status===403 && /api.*not.*enabled|accessnotconfigured|service disabled/i.test(message+' '+reason)){
          throw new Error('google_drive_api_disabled');
        }
        if(response.status===403 && /referer|referrer|ip address|blocked|forbidden/i.test(message+' '+reason)){
          throw new Error('google_drive_api_key_restricted');
        }
        if(response.status===403||response.status===404)throw new Error('google_drive_folder_not_public');
        throw new Error('google_drive_list_failed');
      }
      const data=await response.json();
      for(const file of data.files||[]){
        if(file.mimeType==='application/vnd.google-apps.folder'){
          queue.push({folderId:file.id,resourceKey:file.resourceKey||''});
          continue;
        }
        if(/^image\//i.test(file.mimeType||'') && file.capabilities?.canDownload!==false){
          images.push(file);
          if(images.length>=100)break;
        }
      }
      pageToken=data.nextPageToken||'';
    }while(pageToken && images.length<100);
  }

  return images.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),undefined,{numeric:true,sensitivity:'base'}));
}

async function downloadPublicGoogleDriveImage(file) {
  const maxBytes=30*1024*1024;
  const declared=Number(file.size||0);
  if(declared>maxBytes)throw new Error('drive_image_too_large');

  const apiKey=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  let response=null;

  if(apiKey&&file.id){
    const params=new URLSearchParams({
      alt:'media',
      supportsAllDrives:'true',
      key:apiKey
    });
    const headers={
      'User-Agent':'PhillyCars/1.0',
      Accept:file.mimeType||'image/*'
    };
    if(file.resourceKey)headers['X-Goog-Drive-Resource-Keys']=file.id+'/'+file.resourceKey;

    try{
      response=await fetch(
        'https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(file.id)+'?'+params.toString(),
        {
          redirect:'follow',
          signal:AbortSignal.timeout(30000),
          headers
        }
      );
    }catch{}
  }

  if((!response||!response.ok)&&file.webContentLink){
    try{await response?.body?.cancel();}catch{}
    response=await fetch(file.webContentLink,{
      redirect:'follow',
      signal:AbortSignal.timeout(30000),
      headers:{'User-Agent':'PhillyCars/1.0'}
    });
  }

  if(!response||!response.ok)throw new Error('drive_image_download_failed');

  const contentLength=Number(response.headers.get('content-length')||0);
  if(contentLength>maxBytes)throw new Error('drive_image_too_large');
  const data=Buffer.from(await response.arrayBuffer());
  if(!data.length)throw new Error('drive_image_empty');
  if(data.length>maxBytes)throw new Error('drive_image_too_large');
  return data;
}

function googleDriveImportConcurrency(){
  const configured=Number(process.env.DRIVE_IMPORT_CONCURRENCY||3);
  if(!Number.isFinite(configured))return 3;
  return Math.max(1,Math.min(4,Math.floor(configured)));
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
    const normalizedEmail=String(extraEmail).trim().toLowerCase();
    const provisioned=await pool.query(`
      INSERT INTO admin_users(email,password_hash,role,active)
      VALUES($1,$2,$3,true)
      ON CONFLICT (email)
      DO UPDATE SET password_hash=EXCLUDED.password_hash, role=EXCLUDED.role, active=true
      RETURNING id
    `, [normalizedEmail, hash, extraRole]);
    await pool.query('DELETE FROM admin_sessions WHERE user_id=$1', [provisioned.rows[0].id]);
    app.log.info({ email: normalizedEmail, role: extraRole }, 'Extra admin account provisioned');
  }
}

async function requireAdmin(req, reply) {
  if (!pool) return reply.code(503).send({ error: 'database_not_connected' });
  const auth = String(req.headers.authorization || '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const raw = bearer || req.cookies[COOKIE];
  if (!raw) return reply.code(401).send({ error: 'unauthorized' });
  const result = await pool.query(`
    SELECT u.id, u.email, u.role
    FROM admin_sessions s JOIN admin_users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.expires_at > now() AND u.active=true
  `, [hashToken(raw)]);
  if (!result.rowCount) return reply.code(401).send({ error: 'unauthorized' });
  req.admin = result.rows[0];
  req.adminSessionToken = raw;
}

async function requireOwner(req, reply) {
  await requireAdmin(req, reply);
  if (reply.sent) return;
  if (req.admin?.role !== 'owner') {
    return reply.code(403).send({ error: 'owner_required' });
  }
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

app.get('/api/v1/feeds/inventory.json', async req => {
  const vehicles=await getDistributionInventory();
  return {
    generatedAt:new Date().toISOString(),
    source:'Philly Cars',
    vehicles:vehicles.map(v=>({
      id:v.id,
      stockNumber:v.stock_number,
      vin:v.vin,
      year:v.year,
      make:v.make,
      model:v.model,
      trim:v.trim,
      price:v.price,
      mileage:v.mileage,
      bodyStyle:v.body_style,
      exteriorColor:v.exterior_color,
      interiorColor:v.interior_color,
      drivetrain:v.drivetrain,
      transmission:v.transmission,
      engine:v.engine,
      fuelType:v.fuel_type,
      titleStatus:v.title_status,
      status:v.status,
      description:v.description,
      features:v.features,
      url:vehicleVdpUrl(v),
      imageUrl:absoluteVehicleImageUrl(req,v.cover_path)
    }))
  };
});

app.get('/api/v1/feeds/inventory.csv', async (req, reply) => {
  const vehicles=await getDistributionInventory();
  const header=['stock_number','vin','year','make','model','trim','price','mileage','body_style','exterior_color','interior_color','drivetrain','transmission','engine','fuel_type','title_status','status','description','features','url','image_url'];
  const rows=vehicles.map(v=>[
    v.stock_number,v.vin,v.year,v.make,v.model,v.trim,v.price,v.mileage,v.body_style,v.exterior_color,
    v.interior_color,v.drivetrain,v.transmission,v.engine,v.fuel_type,v.title_status,v.status,v.description,
    Array.isArray(v.features)?v.features.join(', '):'',vehicleVdpUrl(v),absoluteVehicleImageUrl(req,v.cover_path)
  ].map(csvCell).join(','));
  reply.header('Content-Type','text/csv; charset=utf-8');
  reply.header('Content-Disposition','inline; filename="philly-cars-inventory.csv"');
  reply.header('Cache-Control','public, max-age=300');
  return reply.send([header.map(csvCell).join(','),...rows].join('\n'));
});

app.get('/api/v1/feeds/google-vehicles.tsv', async (req, reply) => {
  const configResult=await pool.query("SELECT config FROM distribution_connections WHERE channel='google' LIMIT 1");
  const config=configResult.rows[0]?.config||{};
  const fulfillment=config.fulfillment==='online'?'online':'in_store';
  const storeCode=String(config.storeCode||'').trim();
  const vehicles=(await getDistributionInventory()).filter(v=>['ready_to_publish','available'].includes(v.status));

  const header=[
    'id','title','description','link','link_template','image_link','availability','price','condition','brand','model','year',
    'mileage','color','vin','vehicle_option','vehicle_fulfillment(option)','vehicle_fulfillment(store_code)'
  ];
  const rows=vehicles.map(v=>{
    const title=[v.year,v.make,v.model,v.trim].filter(Boolean).join(' ');
    const options=Array.isArray(v.features)?v.features.join(', '):'';
    return [
      v.stock_number||v.id,
      title,
      v.description||title,
      vehicleVdpUrl(v),
      fulfillment==='in_store'
        ?PUBLIC_SITE_URL+'/?store={store_code}#/vehicle/'+encodeURIComponent(v.slug)
        :'',
      absoluteVehicleImageUrl(req,v.cover_path),
      'in_stock',
      Number(v.price||0).toFixed(2)+' USD',
      'used',
      v.make,
      v.model,
      v.year,
      Number(v.mileage||0)+' miles',
      v.exterior_color||'',
      v.vin||'',
      options,
      fulfillment,
      fulfillment==='in_store'?storeCode:''
    ].map(tsvCell).join('\t');
  });

  reply.header('Content-Type','text/tab-separated-values; charset=utf-8');
  reply.header('Content-Disposition','inline; filename="philly-cars-google-vehicles.tsv"');
  reply.header('Cache-Control','public, max-age=300');
  return reply.send([header.join('\t'),...rows].join('\n'));
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
  return {
    user: { email: result.rows[0].email, role: result.rows[0].role },
    sessionToken: raw,
    expiresAt: expires.toISOString()
  };
});

app.get('/api/v1/admin/me', { preHandler: requireAdmin }, async req => ({ user: req.admin }));

app.delete('/api/v1/admin/session', { preHandler: requireAdmin }, async (req, reply) => {
  const raw = req.adminSessionToken || req.cookies[COOKIE];
  if (raw) await pool.query('DELETE FROM admin_sessions WHERE token_hash=$1', [hashToken(raw)]);
  reply.clearCookie(COOKIE, { path: '/' });
  return { ok: true };
});

app.get('/api/v1/admin/accounts', { preHandler: requireAdmin }, async req => {
  const result = await pool.query(`
    SELECT id,email,role,active,created_at,last_login_at
    FROM admin_users
    ORDER BY CASE WHEN role='owner' THEN 0 ELSE 1 END, created_at ASC
  `);
  return {
    accounts: result.rows,
    currentUserId: req.admin.id,
    currentRole: req.admin.role,
    canManage: req.admin.role === 'owner'
  };
});

app.post('/api/v1/admin/accounts', { preHandler: requireOwner }, async (req, reply) => {
  const { email, password, role='manager', active=true } = req.body || {};
  const normalizedEmail=String(email||'').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return reply.code(400).send({ error: 'valid_email_required' });
  }
  if (String(password||'').length < 12) {
    return reply.code(400).send({ error: 'password_min_12' });
  }
  if (!['owner','manager'].includes(role)) {
    return reply.code(400).send({ error: 'invalid_role' });
  }
  const hash=await bcrypt.hash(String(password),12);
  try {
    const result=await pool.query(`
      INSERT INTO admin_users(email,password_hash,role,active)
      VALUES($1,$2,$3,$4)
      RETURNING id,email,role,active,created_at,last_login_at
    `,[normalizedEmail,hash,role,Boolean(active)]);
    return reply.code(201).send({ account: result.rows[0] });
  } catch (err) {
    if (err?.code==='23505') return reply.code(409).send({ error: 'email_already_exists' });
    throw err;
  }
});

app.patch('/api/v1/admin/accounts/:id', { preHandler: requireOwner }, async (req, reply) => {
  const accountId=String(req.params.id||'');
  const existing=await pool.query(
    'SELECT id,email,role,active FROM admin_users WHERE id=$1',
    [accountId]
  );
  if(!existing.rowCount)return reply.code(404).send({error:'account_not_found'});

  const current=existing.rows[0];
  const email=req.body?.email!==undefined?String(req.body.email).trim().toLowerCase():current.email;
  const role=req.body?.role!==undefined?String(req.body.role):current.role;
  const active=req.body?.active!==undefined?Boolean(req.body.active):current.active;
  const password=req.body?.password!==undefined?String(req.body.password):'';

  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply.code(400).send({error:'valid_email_required'});
  if(!['owner','manager'].includes(role))return reply.code(400).send({error:'invalid_role'});
  if(password && password.length<12)return reply.code(400).send({error:'password_min_12'});

  const removingOwner = current.role==='owner' && current.active && (role!=='owner' || !active);
  if(removingOwner){
    const owners=await pool.query(
      "SELECT count(*)::int AS count FROM admin_users WHERE role='owner' AND active=true AND id<>$1",
      [accountId]
    );
    if(owners.rows[0].count<1)return reply.code(409).send({error:'last_owner_required'});
  }

  const values=[email,role,active,accountId];
  let passwordSql='';
  if(password){
    const hash=await bcrypt.hash(password,12);
    values.push(hash);
    passwordSql=', password_hash=$5';
  }

  try{
    const result=await pool.query(`
      UPDATE admin_users
      SET email=$1, role=$2, active=$3${passwordSql}
      WHERE id=$4
      RETURNING id,email,role,active,created_at,last_login_at
    `,values);

    const securityChanged = Boolean(password) || role!==current.role || active!==current.active;
    if(securityChanged){
      await pool.query('DELETE FROM admin_sessions WHERE user_id=$1',[accountId]);
    }

    return {
      account:result.rows[0],
      reauthRequired: securityChanged && accountId===req.admin.id
    };
  }catch(err){
    if(err?.code==='23505')return reply.code(409).send({error:'email_already_exists'});
    throw err;
  }
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

  let recalls=null;
  try{recalls=await fetchNhtsaRecalls(decoded.year,decoded.make,decoded.model);}
  catch(err){req.log.warn({err,vin:summary.vin},'CARFAX description recall enrichment unavailable');}

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

    const descriptionSeed={
      year:decoded.year,make:decoded.make,model:decoded.model,trim:decoded.trim||null,
      mileage:summary.mileage||0,body_style:decoded.bodyStyle||null,
      exterior_color:summary.exteriorColor||null,interior_color:summary.interiorColor||null,
      drivetrain:decoded.drivetrain||null,
      transmission:summary.transmission||decoded.transmission||null,engine:decoded.engine||null,fuel_type:decoded.fuelType||null,
      title_status:titleStatus,stock_number:stockNumber,vin:summary.vin
    };
    const generatedDescription=buildVehicleDescription(descriptionSeed,{
      carfaxSummary:summary,
      vinDecode:decoded,
      recalls
    });
    const descriptionGeneratedAt=new Date().toISOString();

    const vehicleResult=await client.query(`
      INSERT INTO vehicles(
        slug,stock_number,vin,year,make,model,trim,price,mileage,
        acquired_at,body_style,exterior_color,interior_color,drivetrain,transmission,engine,fuel_type,title_status,status,
        description,description_generated_at
      )
      VALUES($1,$2,$3,$4,$5,$6,$7,0,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'acquired',$18,$19)
      RETURNING *
    `,[
      slug,stockNumber,summary.vin,decoded.year,decoded.make,decoded.model,decoded.trim||null,
      summary.mileage||0,acquiredAt,decoded.bodyStyle||null,
      summary.exteriorColor||null,summary.interiorColor||null,decoded.drivetrain||null,
      summary.transmission||decoded.transmission||null,decoded.engine||null,decoded.fuelType||null,titleStatus,
      generatedDescription,descriptionGeneratedAt
    ]);
    let vehicle=vehicleResult.rows[0];

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

    const descriptionSources={
      generator:'philly-cars-marketplace-v2',
      generatedAt:descriptionGeneratedAt,
      carfax:{
        documentId:documentResult.rows[0].id,
        originalName:documentResult.rows[0].original_name,
        reportDate:summary.reportDate||null
      },
      nhtsaVpic:{
        url:'https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/'+encodeURIComponent(summary.vin)+'?format=json'
      },
      nhtsaRecalls:recalls?{
        url:recalls.sourceUrl,
        count:recalls.count,
        campaigns:recalls.campaigns
      }:null
    };
    const descriptionUpdate=await client.query(
      'UPDATE vehicles SET description_sources=$1 WHERE id=$2 RETURNING *',
      [JSON.stringify(descriptionSources),vehicle.id]
    );
    vehicle=descriptionUpdate.rows[0];

    await client.query('COMMIT');
    return reply.code(201).send({
      vehicle,
      carfax:parsedData,
      document:documentResult.rows[0],
      descriptionSources
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
    INSERT INTO vehicles(slug,stock_number,vin,year,make,model,trim,price,mileage,purchase_price,auction_fees,transport_cost,recon_cost,other_cost,acquired_at,body_style,exterior_color,interior_color,drivetrain,transmission,engine,fuel_type,mpg_combined,title_status,status,description,features)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING *
  `,[slug,b.stockNumber,b.vin||null,Number(b.year),b.make,b.model,b.trim||null,Number(b.price||0),Number(b.mileage||0),Number(b.purchasePrice||0),Number(b.auctionFees||0),Number(b.transportCost||0),Number(b.reconCost||0),Number(b.otherCost||0),b.acquiredAt||null,b.bodyStyle||null,b.exteriorColor||null,b.interiorColor||null,b.drivetrain||null,b.transmission||null,b.engine||null,b.fuelType||null,b.mpgCombined?Number(b.mpgCombined):null,b.titleStatus||null,b.status||'acquired',b.description||null,JSON.stringify(b.features||[])]);
  try{
    const generated=await generateAndPersistVehicleDescription(result.rows[0].id);
    return reply.code(201).send(generated.vehicle);
  }catch(err){
    req.log.warn({err,vehicleId:result.rows[0].id},'Automatic description generation failed');
    return reply.code(201).send(result.rows[0]);
  }
});

app.patch('/api/v1/admin/vehicles/:id', { preHandler: requireAdmin }, async (req, reply) => {
  const allowed = {
    stockNumber:'stock_number', vin:'vin', year:'year', make:'make', model:'model', trim:'trim', price:'price', mileage:'mileage', purchasePrice:'purchase_price', auctionFees:'auction_fees', transportCost:'transport_cost', reconCost:'recon_cost', otherCost:'other_cost', acquiredAt:'acquired_at',
    bodyStyle:'body_style', exteriorColor:'exterior_color', interiorColor:'interior_color', drivetrain:'drivetrain', transmission:'transmission',
    engine:'engine', fuelType:'fuel_type', mpgCombined:'mpg_combined', titleStatus:'title_status', status:'status', description:'description', features:'features', photoSourceUrl:'photo_source_url'
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

app.post('/api/v1/admin/vehicles/:id/generate-description', { preHandler: requireAdmin }, async (req, reply) => {
  try{
    const result=await generateAndPersistVehicleDescription(req.params.id);
    return {
      ok:true,
      vehicle:result.vehicle,
      sources:result.sources
    };
  }catch(err){
    if(String(err?.message)==='vehicle_not_found')return reply.code(404).send({error:'vehicle_not_found'});
    req.log.warn({err,vehicleId:req.params.id},'Vehicle description generation failed');
    return reply.code(502).send({error:'description_generation_failed'});
  }
});

app.post('/api/v1/admin/vehicles/:id/archive', { preHandler: requireAdmin }, async (req, reply) => {
  const result = await pool.query(`UPDATE vehicles SET status='archived',updated_at=now() WHERE id=$1 RETURNING id,status`, [req.params.id]);
  if (!result.rowCount) return reply.code(404).send({ error:'not_found' });
  return result.rows[0];
});

app.get('/api/v1/admin/google-drive/status', { preHandler: requireAdmin }, async () => {
  const key=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  return {
    configured:Boolean(key),
    keyFormatValid:/^AIza[0-9A-Za-z_-]{20,}$/.test(key),
    keyLength:key.length
  };
});

app.post('/api/v1/admin/vehicles/:id/images/import-drive', { preHandler: requireAdmin }, async (req, reply) => {
  const startedAt=Date.now();
  const folderUrl=String(req.body?.folderUrl||'').trim();
  if(!folderUrl)return reply.code(400).send({error:'google_drive_folder_url_required'});

  const vehicle=await pool.query(
    'SELECT id,year,make,model FROM vehicles WHERE id=$1',
    [req.params.id]
  );
  if(!vehicle.rowCount)return reply.code(404).send({error:'vehicle_not_found'});

  let files;
  try{
    files=await listPublicGoogleDriveImages(folderUrl);
  }catch(err){
    const code=String(err?.message||'google_drive_list_failed');
    const status=code==='google_drive_not_configured'?503:
      code==='google_drive_api_key_invalid'?503:
      code==='google_drive_api_disabled'?503:
      code==='google_drive_api_key_restricted'?503:
      code==='invalid_google_drive_folder_url'?400:
      code==='google_drive_folder_not_public'?403:502;
    return reply.code(status).send({error:code});
  }
  if(!files.length)return reply.code(422).send({error:'google_drive_no_images'});

  const existing=await pool.query(
    "SELECT source_id FROM vehicle_images WHERE vehicle_id=$1 AND source_type='google_drive' AND source_id IS NOT NULL",
    [req.params.id]
  );
  const importedIds=new Set(existing.rows.map(r=>r.source_id));
  const stats=await pool.query(
    'SELECT count(*)::int AS count, coalesce(max(sort_order),-1)::int AS max_sort FROM vehicle_images WHERE vehicle_id=$1',
    [req.params.id]
  );

  let nextSort=stats.rows[0].max_sort+1;
  let coverAvailable=stats.rows[0].count>0;
  const imported=[];
  const skipped=[];
  const failed=[];
  const alt=`${vehicle.rows[0].year} ${vehicle.rows[0].make} ${vehicle.rows[0].model}`;
  const concurrency=googleDriveImportConcurrency();

  const pending=[];
  for(const file of files){
    if(importedIds.has(file.id)){
      skipped.push({id:file.id,name:file.name,reason:'already_imported'});
    }else{
      pending.push(file);
    }
  }

  for(let offset=0;offset<pending.length;offset+=concurrency){
    const batch=pending.slice(offset,offset+concurrency);

    const processed=await Promise.all(batch.map(async file=>{
      const itemStartedAt=Date.now();
      try{
        const raw=await downloadPublicGoogleDriveImage(file);
        const optimized=await sharp(raw,{failOn:'none'})
          .rotate()
          .resize({width:1920,height:1920,fit:'inside',withoutEnlargement:true})
          .webp({quality:82,effort:3,smartSubsample:true})
          .toBuffer();

        return {
          ok:true,
          file,
          optimized,
          processingMs:Date.now()-itemStartedAt
        };
      }catch(err){
        req.log.warn({err,fileId:file.id,fileName:file.name},'Google Drive vehicle image import failed');
        return {
          ok:false,
          file,
          reason:String(err?.message||'import_failed')
        };
      }
    }));

    const successful=processed.filter(x=>x.ok);
    const batchSortStart=nextSort;

    const insertResults=await Promise.all(successful.map(async(item,index)=>{
      const imageId=crypto.randomUUID();
      const path='/api/v1/vehicle-images/'+imageId;
      const isCover=!coverAvailable&&index===0;
      const sortOrder=batchSortStart+index;

      const inserted=await pool.query(`
        INSERT INTO vehicle_images(
          id,vehicle_id,path,alt_text,sort_order,is_cover,content_type,original_name,size_bytes,image_data,
          source_type,source_id,source_url
        )
        VALUES($1,$2,$3,$4,$5,$6,'image/webp',$7,$8,$9,'google_drive',$10,$11)
        ON CONFLICT DO NOTHING
        RETURNING id,path,alt_text,sort_order,is_cover,content_type,original_name,size_bytes,created_at
      `,[
        imageId,req.params.id,path,alt,sortOrder,isCover,item.file.name||null,item.optimized.length,item.optimized,
        item.file.id,item.file.webContentLink||null
      ]);

      return {
        item,
        row:inserted.rows[0]||null
      };
    }));

    for(const result of insertResults){
      if(result.row){
        imported.push(result.row);
        importedIds.add(result.item.file.id);
      }else{
        skipped.push({
          id:result.item.file.id,
          name:result.item.file.name,
          reason:'already_imported'
        });
      }
    }

    for(const item of processed.filter(x=>!x.ok)){
      failed.push({
        id:item.file.id,
        name:item.file.name,
        reason:item.reason
      });
    }

    nextSort+=successful.length;
    if(insertResults.some(x=>x.row))coverAvailable=true;
  }

  await pool.query(
    'UPDATE vehicles SET photo_source_url=$1, photo_source_synced_at=now(), updated_at=now() WHERE id=$2',
    [folderUrl,req.params.id]
  );

  const elapsedMs=Date.now()-startedAt;
  req.log.info({
    vehicleId:req.params.id,
    found:files.length,
    imported:imported.length,
    skipped:skipped.length,
    failed:failed.length,
    concurrency,
    elapsedMs
  },'Google Drive vehicle image import completed');

  return {
    ok:true,
    found:files.length,
    importedCount:imported.length,
    skippedCount:skipped.length,
    failedCount:failed.length,
    concurrency,
    elapsedMs,
    imported,
    skipped,
    failed
  };
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

app.get('/api/v1/admin/distribution/connections', { preHandler: requireAdmin }, async req => {
  const result=await pool.query('SELECT * FROM distribution_connections ORDER BY channel');
  const apiOrigin=absoluteApiOrigin(req);
  return {
    connections:result.rows,
    canManage:req.admin.role==='owner',
    feeds:{
      google:apiOrigin+'/api/v1/feeds/google-vehicles.tsv',
      inventoryCsv:apiOrigin+'/api/v1/feeds/inventory.csv',
      inventoryJson:apiOrigin+'/api/v1/feeds/inventory.json'
    },
    publicSiteUrl:PUBLIC_SITE_URL
  };
});

app.put('/api/v1/admin/distribution/connections/:channel', { preHandler: requireOwner }, async (req, reply) => {
  const channel=String(req.params.channel||'').toLowerCase();
  if(!DISTRIBUTION_CHANNELS.has(channel))return reply.code(400).send({error:'invalid_channel'});
  if(channel==='website')return reply.code(400).send({error:'website_connection_is_internal'});

  const current=await pool.query('SELECT * FROM distribution_connections WHERE channel=$1',[channel]);
  if(!current.rowCount)return reply.code(404).send({error:'connection_not_found'});

  const previous=current.rows[0];
  const enabled=req.body?.enabled!==undefined?Boolean(req.body.enabled):previous.enabled;
  const accountLabel=req.body?.accountLabel!==undefined?String(req.body.accountLabel||'').trim():previous.account_label;
  const incomingConfig=req.body?.config&&typeof req.body.config==='object'?req.body.config:{};
  const config={...(previous.config||{}),...incomingConfig};

  const mode=channel==='google'?'scheduled_feed':channel==='facebook'?'manual':'partner_feed';
  const status=enabled?'setup':'not_connected';
  const result=await pool.query(`
    UPDATE distribution_connections
    SET enabled=$1,status=$2,mode=$3,account_label=$4,config=$5,last_error=null,updated_at=now()
    WHERE channel=$6
    RETURNING *
  `,[enabled,status,mode,accountLabel||null,JSON.stringify(config),channel]);
  return {connection:result.rows[0]};
});

app.post('/api/v1/admin/distribution/connections/:channel/test', { preHandler: requireAdmin }, async (req, reply) => {
  const channel=String(req.params.channel||'').toLowerCase();
  if(!DISTRIBUTION_CHANNELS.has(channel))return reply.code(400).send({error:'invalid_channel'});

  const connectionResult=await pool.query('SELECT * FROM distribution_connections WHERE channel=$1',[channel]);
  if(!connectionResult.rowCount)return reply.code(404).send({error:'connection_not_found'});
  const connection=connectionResult.rows[0];
  const config=connection.config||{};
  const vehicles=await getDistributionInventory();

  const issues=[];
  let eligible=vehicles.length;

  if(channel==='website'){
    if(!vehicles.length)issues.push('No publishable vehicles in inventory');
  }else if(channel==='google'){
    if(!String(config.merchantCenterId||'').trim())issues.push('Merchant Center ID is missing');
    if(!String(config.dealershipName||'').trim())issues.push('Dealership name is missing');
    if(!String(config.dealershipAddress||'').trim())issues.push('Dealership address is missing');
    if((config.fulfillment||'in_store')==='in_store'&&!String(config.storeCode||'').trim())issues.push('Google store code is missing for in-store fulfillment');

    const googleVehicles=vehicles.filter(v=>['ready_to_publish','available'].includes(v.status));
    eligible=0;
    for(const v of googleVehicles){
      const missing=[];
      if(!v.vin)missing.push('VIN');
      if(!v.make)missing.push('make');
      if(!v.model)missing.push('model');
      if(!v.year)missing.push('year');
      if(!(Number(v.price)>0))missing.push('price');
      if(!(Number(v.mileage)>=0))missing.push('mileage');
      if(!v.cover_path)missing.push('photo');
      if(!v.description)missing.push('description');
      if(missing.length)issues.push(`${v.stock_number||v.id}: missing ${missing.join(', ')}`);
      else eligible++;
    }
    if(!googleVehicles.length)issues.push('No Ready to Publish / Available vehicles');
    if(/onrender\.com/i.test(PUBLIC_SITE_URL))issues.push('Production domain is not connected yet; use phillycars.com before Google review');
  }else if(channel==='facebook'){
    issues.push('Direct dealer Marketplace automation is not configured; keep this channel manual until Meta business access is confirmed');
  }else{
    if(!String(config.dealerAccountId||'').trim())issues.push('Dealer account ID is missing');
    issues.push('Provider feed specification/onboarding confirmation is still required');
  }

  const ready=channel==='website'?issues.length===0:
    channel==='google'?issues.length===0&&eligible>0:false;
  const nextStatus=channel==='website'?'connected':ready?'ready':connection.enabled?'setup':'not_connected';
  const lastError=issues.length?issues.slice(0,20).join(' | '):null;
  const updated=await pool.query(`
    UPDATE distribution_connections
    SET status=$1,last_tested_at=now(),last_error=$2,updated_at=now()
    WHERE channel=$3
    RETURNING *
  `,[nextStatus,lastError,channel]);

  return {
    ok:issues.length===0,
    ready,
    eligibleVehicles:eligible,
    totalVehicles:vehicles.length,
    issues,
    connection:updated.rows[0]
  };
});

app.post('/api/v1/admin/distribution/connections/:channel/confirm', { preHandler: requireOwner }, async (req, reply) => {
  const channel=String(req.params.channel||'').toLowerCase();
  if(!DISTRIBUTION_CHANNELS.has(channel)||channel==='website')return reply.code(400).send({error:'invalid_channel'});
  const result=await pool.query(`
    UPDATE distribution_connections
    SET enabled=true,status='connected',last_sync_at=now(),last_error=null,updated_at=now()
    WHERE channel=$1
    RETURNING *
  `,[channel]);
  if(!result.rowCount)return reply.code(404).send({error:'connection_not_found'});
  return {connection:result.rows[0]};
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
{
  const driveKey=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  app.log.info({
    configured:Boolean(driveKey),
    keyFormatValid:/^AIza[0-9A-Za-z_-]{20,}$/.test(driveKey),
    keyLength:driveKey.length
  },'Google Drive integration diagnostics');
}
await app.listen({ port: PORT, host: '0.0.0.0' });