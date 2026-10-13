const ASSETS='';
const API_BASE='https://philly-cars-api-dev.onrender.com';
const REMOTE_IMAGES=["https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=82", "https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=82", "https://images.unsplash.com/photo-1504215680853-026ed2a45def?auto=format&fit=crop&w=1200&q=82", "https://images.unsplash.com/photo-1549317661-bd32c8ce0db2?auto=format&fit=crop&w=1200&q=82", "https://images.unsplash.com/photo-1511919884226-fd3cad34687c?auto=format&fit=crop&w=1200&q=82", "https://images.unsplash.com/photo-1494976388531-d1058494cdd8?auto=format&fit=crop&w=1200&q=82"];
const seed=[
 {id:'bmw-330i',year:2023,make:'BMW',model:'330i xDrive',trim:'M Sport Package',mileage:28421,price:39900,body:'Sedan',color:'Black',interior:'Black',drive:'AWD',trans:'Automatic',engine:'2.0L Turbo I4',fuel:'Gasoline',status:'Available',image:'car1.jpg',stock:'PC1054',title:'Clean Title',features:['Apple CarPlay','Heated Seats','Backup Camera','Blind Spot Monitoring','Sunroof','Navigation','Leather Seats','Parking Sensors']},
 {id:'mercedes-gle',year:2022,make:'Mercedes-Benz',model:'GLE 350',trim:'4MATIC',mileage:32000,price:48900,body:'SUV',color:'White',interior:'Black',drive:'AWD',trans:'Automatic',engine:'2.0L Turbo I4',fuel:'Gasoline',status:'Available',image:'car2.jpg',stock:'PC1032',title:'Clean Title',features:['Apple CarPlay','Heated Seats','Backup Camera','Blind Spot Monitoring','Panoramic Roof','Navigation']},
 {id:'audi-a6',year:2023,make:'Audi',model:'A6 Premium Plus',trim:'Premium Plus',mileage:26000,price:42900,body:'Sedan',color:'Gray',interior:'Black',drive:'AWD',trans:'Automatic',engine:'2.0L Turbo I4',fuel:'Gasoline',status:'Available',image:'car3.jpg',stock:'PC1029',title:'Clean Title',features:['Apple CarPlay','Heated Seats','360 Camera','Blind Spot Monitoring','Sunroof','Navigation']},
 {id:'porsche-macan',year:2021,make:'Porsche',model:'Macan S',trim:'AWD',mileage:37000,price:54900,body:'SUV',color:'White',interior:'Black',drive:'AWD',trans:'PDK',engine:'3.0L V6 Turbo',fuel:'Gasoline',status:'Pending',image:'car4.jpg',stock:'PC0987',title:'Clean Title',features:['Apple CarPlay','Heated Seats','Backup Camera','Blind Spot Monitoring','Panoramic Roof']},
 {id:'audi-q5',year:2023,make:'Audi',model:'Q5',trim:'Premium Plus 45 TFSI',mileage:28000,price:42900,body:'SUV',color:'Black',interior:'Black',drive:'AWD',trans:'Automatic',engine:'2.0L Turbo I4',fuel:'Gasoline',status:'Available',image:'car5.jpg',stock:'PC1018',title:'Clean Title',features:['Apple CarPlay','Heated Seats','Backup Camera','Blind Spot Monitoring']},
 {id:'bmw-x5',year:2022,make:'BMW',model:'X5 xDrive40i',trim:'xDrive40i',mileage:32000,price:48500,body:'SUV',color:'White',interior:'Black',drive:'AWD',trans:'Automatic',engine:'3.0L Turbo I6',fuel:'Gasoline',status:'Available',image:'car6.jpg',stock:'PC1011',title:'Clean Title',features:['Apple CarPlay','Heated Seats','Backup Camera','Blind Spot Monitoring','Panoramic Roof']},
 {id:'mercedes-gle2',year:2021,make:'Mercedes-Benz',model:'GLE 350',trim:'4MATIC',mileage:36000,price:45900,body:'SUV',color:'Gray',interior:'Black',drive:'AWD',trans:'Automatic',engine:'2.0L Turbo I4',fuel:'Gasoline',status:'Available',image:'car7.jpg',stock:'PC1007',title:'Clean Title',features:['Apple CarPlay','Heated Seats','Backup Camera','Blind Spot Monitoring']},
 {id:'porsche-macan2',year:2021,make:'Porsche',model:'Macan S',trim:'AWD',mileage:37000,price:54900,body:'SUV',color:'Black',interior:'Black',drive:'AWD',trans:'PDK',engine:'3.0L V6 Turbo',fuel:'Gasoline',status:'Sold',image:'car8.jpg',stock:'PC0992',title:'Clean Title',features:['Apple CarPlay','Heated Seats','Backup Camera']},
 {id:'tesla-y',year:2023,make:'Tesla',model:'Model Y',trim:'Long Range',mileage:22000,price:41900,body:'SUV',color:'White',interior:'Black',drive:'AWD',trans:'Single Speed',engine:'Dual Motor',fuel:'Electric',status:'Available',image:'car9.jpg',stock:'PC1006',title:'Clean Title',features:['Glass Roof','Heated Seats','Backup Camera','Blind Spot Monitoring','Navigation']},
 {id:'audi-q7',year:2022,make:'Audi',model:'Q7',trim:'Premium Plus',mileage:33000,price:46900,body:'SUV',color:'Black',interior:'Black',drive:'AWD',trans:'Automatic',engine:'3.0L Turbo V6',fuel:'Gasoline',status:'Coming Soon',image:'car10.jpg',stock:'PC0999',title:'Clean Title',features:['Apple CarPlay','Heated Seats','360 Camera','Blind Spot Monitoring','Panoramic Roof']},
 {id:'lexus-rx',year:2021,make:'Lexus',model:'RX 350',trim:'F Sport',mileage:41000,price:36900,body:'SUV',color:'Silver',interior:'Red',drive:'AWD',trans:'Automatic',engine:'3.5L V6',fuel:'Gasoline',status:'Available',image:'car11.jpg',stock:'PC0978',title:'Clean Title',features:['Apple CarPlay','Heated Seats','Backup Camera','Blind Spot Monitoring']},
 {id:'jeep-grand',year:2022,make:'Jeep',model:'Grand Cherokee',trim:'Overland',mileage:26000,price:38900,body:'SUV',color:'White',interior:'Black',drive:'4WD',trans:'Automatic',engine:'3.6L V6',fuel:'Gasoline',status:'Available',image:'car12.jpg',stock:'PC0965',title:'Clean Title',features:['Apple CarPlay','Heated Seats','Backup Camera','Blind Spot Monitoring','Panoramic Roof']}
];
let cars=[];
let inventoryLoaded=false;
let inventoryError=false;
let saved=new Set(JSON.parse(localStorage.getItem('phillySaved')||'[]'));
const saveCars=()=>{};
const saveSaved=()=>localStorage.setItem('phillySaved',JSON.stringify([...saved]));
const API_TO_UI_STATUS={ready_to_publish:'Ready to Publish',available:'Available',deposit:'Deposit',sold:'Sold'};
function apiToUiVehicle(v){
  return {
    id:v.slug,dbId:v.id,slug:v.slug,year:v.year,make:v.make,model:v.model,trim:v.trim||'',
    mileage:+v.mileage||0,price:+v.price||0,body:v.body_style||'',color:v.exterior_color||'',
    interior:v.interior_color||'',drive:v.drivetrain||'',trans:v.transmission||'',engine:v.engine||'',
    fuel:v.fuel_type||'',mpg:+v.mpg_combined||0,status:API_TO_UI_STATUS[v.status]||'Available',stock:v.stock_number||'',
    vin:v.vin||'',title:v.title_status||'',features:Array.isArray(v.features)?v.features:[],
    description:v.description||'',images:Array.isArray(v.images)?v.images:[]
  };
}
async function apiFetch(path,options={}){
  const res=await fetch(API_BASE+path,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});
  let body={};try{body=await res.json()}catch{}
  if(!res.ok){const e=new Error(body.error||('HTTP '+res.status));e.status=res.status;e.body=body;throw e}
  return body;
}
async function loadInventory(){
  try{
    const data=await apiFetch('/api/v1/vehicles');
    cars=(data.vehicles||[]).map(apiToUiVehicle);
    inventoryLoaded=true;inventoryError=false;
  }catch(e){
    console.error('Inventory API error',e);
    cars=[];inventoryLoaded=true;inventoryError=true;
  }
}
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(+n||0);
const miles=n=>new Intl.NumberFormat('en-US').format(+n||0)+' mi';
const PLACEHOLDER_IMAGE="data:image/svg+xml;charset=UTF-8,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="100%" height="100%" fill="#eef2f7"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#7b8797" font-family="Arial,sans-serif" font-size="42">Photo coming soon</text></svg>');
const imageUrl=path=>!path?'':path.startsWith('/')?API_BASE+path:path;
const img=v=>{const cover=v.images?.find(x=>x.is_cover)||v.images?.[0];return cover?.path?imageUrl(cover.path):(v.customImage||PLACEHOLDER_IMAGE)};
const slugStatus=s=>s==='Coming Soon'?'ComingSoon':s;
function featureSpecIcon(type){
  const common='viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  const icons={
    mileage:`<svg ${common}><path d="M8 30a16 16 0 0 1 32 0"/><path d="M24 30l8-10"/><circle cx="24" cy="30" r="3"/><path d="M13 34h22"/></svg>`,
    drivetrain:`<svg ${common}><rect x="7" y="8" width="10" height="10" rx="3"/><rect x="31" y="8" width="10" height="10" rx="3"/><rect x="7" y="30" width="10" height="10" rx="3"/><rect x="31" y="30" width="10" height="10" rx="3"/><path d="M17 13h14M17 35h14M24 13v22"/></svg>`,
    color:`<svg ${common}><path d="M24 6S13 20 13 29a11 11 0 0 0 22 0C35 20 24 6 24 6Z"/></svg>`,
    mpg:`<svg ${common}><path d="M12 8h20v32H12z"/><path d="M16 13h12v9H16z"/><path d="M32 16h5l4 5v13a4 4 0 0 1-8 0v-8"/><path d="M19 31c3-6 7-6 10 0-3 5-7 5-10 0Z"/></svg>`,
    engine:`<svg ${common}><path d="M13 17h20l5 6v14H10V22z"/><path d="M17 17v-6h12v6M38 26h4v8h-4M10 25H6v9h4"/><circle cx="24" cy="28" r="6"/></svg>`,
    fuel:`<svg ${common}><path d="M12 7h20v34H12z"/><path d="M16 12h12v10H16z"/><path d="M32 14h5l4 5v15a4 4 0 0 1-8 0v-7"/><path d="M37 14v7h4"/></svg>`,
    transmission:`<svg ${common}><circle cx="12" cy="10" r="3"/><circle cx="24" cy="10" r="3"/><circle cx="36" cy="10" r="3"/><circle cx="12" cy="38" r="3"/><circle cx="24" cy="38" r="3"/><circle cx="36" cy="38" r="3"/><path d="M12 13v22M24 13v22M36 13v22M12 24h24"/></svg>`,
    wheel:`<svg ${common}><circle cx="24" cy="24" r="17"/><circle cx="24" cy="24" r="9"/><circle cx="24" cy="24" r="2"/><path d="M24 15v5M24 28v5M15 24h5M28 24h5M18 18l4 4M26 26l4 4M30 18l-4 4M22 26l-4 4"/></svg>`,
    title:`<svg ${common}><path d="M13 7h17l6 6v28H13z"/><path d="M30 7v7h6M18 23h13M18 29h13M18 35h9"/></svg>`
  };
  return icons[type]||icons.title;
}
function vehicleFeaturePanel(v){
  const items=[
    {type:'mileage',label:'Mileage',value:new Intl.NumberFormat('en-US').format(+v.mileage||0)},
    {type:'drivetrain',label:'Drivetrain',value:v.drive||'Not listed'},
    {type:'color',label:'Exterior color',value:v.color||'Not listed'},
    {type:'color',label:'Interior color',value:v.interior||'Not listed'},
    {type:'engine',label:'Engine',value:v.engine||'Not listed'},
    {type:'fuel',label:'Fuel type',value:v.fuel||'Not listed'},
    {type:'transmission',label:'Transmission',value:v.trans||'Not listed'},
    {type:'title',label:'Title',value:v.title||'Not listed'}
  ];
  if(v.mpg)items.push({type:'mpg',label:'Combined MPG',value:v.mpg+' MPG'});
  return `<section class="vehicleFeaturePanel glass">
    <h2>Features</h2>
    <div class="vehicleFeatureGrid">
      ${items.map(item=>`<div class="vehicleFeature">
        <div class="vehicleFeatureIcon">${featureSpecIcon(item.type)}</div>
        <div class="vehicleFeatureText"><b>${item.label}</b><span>${item.value}</span></div>
      </div>`).join('')}
    </div>
  </section>`;
}

function vehicleOverview(v){
  const description=String(v.description||'').trim();
  if(!description)return 'Vehicle details and history are available from Philly Cars. Contact us to schedule a viewing or test drive.';

  const fullName=`${v.year} ${v.make} ${v.model}`.trim().toLowerCase();
  const exactSpecs=new Set([
    v.drive,v.engine,v.trans,v.fuel,v.color,v.interior,v.title,
    ...(Array.isArray(v.features)?v.features:[])
  ].filter(Boolean).map(x=>String(x).trim().toLowerCase()));

  const lines=description.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  const kept=lines.filter(line=>{
    const lower=line.toLowerCase();
    if(lower.startsWith(fullName+' –')||lower.startsWith(fullName+' -'))return false;
    if(exactSpecs.has(lower))return false;
    if(/^asking\s+\$/i.test(line))return false;
    if(/^located in philadelphia/i.test(line))return false;
    if(/^message us to schedule/i.test(line))return false;
    if(/^\d+(?:\.\d+)?\s*hp$/i.test(line))return false;
    if(/^\d+(?:st|nd|rd|th)[- ]row seating$/i.test(line))return false;
    return true;
  });

  return kept.join('\n\n')||'Contact Philly Cars for full vehicle details and history.';
}
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.getElementById('toast-root').appendChild(el);setTimeout(()=>el.remove(),2200)}
function icon(n){return {'home':'⌂','car':'▰','heart':'♡','menu':'☰','trade':'↔','sell':'◇','about':'◌','contact':'✉','admin':'⌘'}[n]||'•'}
function header(){return `<header class="nav"><div class="container navin"><a class="brand" href="#/"><span class="logo"></span>Philly Cars</a><nav class="links"><a href="#/inventory">Inventory</a><a href="#/trade-in">Trade-In</a><a href="#/sell">Sell Your Car</a><a href="#/about">About</a><a href="#/contact">Contact</a></nav><div class="navActions"><a class="btn soft" href="#/saved">♡ Saved <span id="savedCount">${saved.size}</span></a><a class="btn blue" href="#/inventory">Browse Inventory →</a><button class="btn soft iconBtn mobileMenu" onclick="openMobileNav()">☰</button></div></div></header>`}
function mobileBottom(){return `<nav class="mobileBottom glass"><a href="#/"><b>⌂</b>Home</a><a href="#/inventory"><b>▰</b>Cars</a><a href="#/saved"><b>♡</b>Saved</a><a href="#/contact"><b>✉</b>Contact</a></nav>`}
function footer(){return `<footer class="footer"><div class="container footerGrid"><div><div class="brand"><span class="logo"></span>Philly Cars</div><p>Quality cars. Transparent pricing.<br>Built for Philadelphia.</p></div><div><b>Shop</b><p><a href="#/inventory">Inventory</a><br><a href="#/saved">Saved Cars</a></p></div><div><b>Sell</b><p><a href="#/trade-in">Trade-In</a><br><a href="#/sell">Sell Your Car</a></p></div><div><b>Company</b><p><a href="#/about">About</a><br><a href="#/contact">Contact</a></p></div></div></footer>`}
function carCard(v){const stat=v.status==='Pending'?'pending':v.status==='Sold'?'sold':v.status==='Coming Soon'?'coming':'';return `<article class="carCard"><div class="carImage" style="background-image:url('${img(v)}')"><button class="heart ${saved.has(v.id)?'saved':''}" onclick="event.stopPropagation();toggleSaved('${v.id}',this)">${saved.has(v.id)?'♥':'♡'}</button></div><div class="carBody" onclick="location.hash='/car/${v.id}'" style="cursor:pointer"><div class="carTitle">${v.year} ${v.make} ${v.model}</div><div class="carMeta">${v.trim} · ${miles(v.mileage)} · ${v.drive}</div><div class="stockLine">Stock #${v.stock} · ${v.title}</div><div class="priceRow"><span class="price">${money(v.price)}</span><span class="pill ${stat}">${v.status}</span></div></div></article>`}
window.toggleSaved=(id,btn)=>{saved.has(id)?saved.delete(id):saved.add(id);saveSaved();btn.classList.toggle('saved');btn.textContent=saved.has(id)?'♥':'♡';document.querySelector('#savedCount')&&(document.querySelector('#savedCount').textContent=saved.size);toast(saved.has(id)?'Saved vehicle':'Removed from saved')}
window.openMobileNav=()=>{document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="navModal" onclick="if(event.target===this)this.remove()"><div class="modalCard" style="max-width:420px"><div class="modalHead"><div class="brand"><span class="logo"></span>Philly Cars</div><button class="smallBtn" onclick="navModal.remove()">✕</button></div>${['Inventory','Trade-In','Sell Your Car','About','Contact','Saved'].map((x,i)=>`<a class="btn soft" style="width:100%;margin:5px 0" href="#/${['inventory','trade-in','sell','about','contact','saved'][i]}" onclick="navModal.remove()">${x}</a>`).join('')}</div></div>`)}
function home(){const featured=cars.filter(v=>v.status!=='Sold').slice(0,4);return `${header()}<main class="page"><section class="hero"><div class="container"><div class="heroWrap"><div class="heroPhoto"></div><div class="heroContent"><div class="eyebrow">Premium cars · Philadelphia</div><h1>Find your next car <span class="accent">in Philadelphia.</span></h1><p>Handpicked pre-owned vehicles, transparent pricing, and a cleaner way to shop.</p><a class="btn blue" href="#/inventory">Browse Inventory →</a></div><div class="searchPanel glass"><div class="filterCell"><label>Make</label><select id="homeMake"><option value="">Any Make</option>${unique('make').map(x=>`<option>${x}</option>`).join('')}</select></div><div class="filterCell"><label>Body Style</label><select id="homeBody"><option value="">Any Style</option>${unique('body').map(x=>`<option>${x}</option>`).join('')}</select></div><div class="filterCell"><label>Max Price</label><select id="homePrice"><option value="">Any Price</option><option value="30000">$30,000</option><option value="40000">$40,000</option><option value="50000">$50,000</option></select></div><div class="filterCell"><label>Year</label><select id="homeYear"><option value="">Any Year</option>${unique('year').sort((a,b)=>b-a).map(x=>`<option>${x}</option>`).join('')}</select></div><button class="btn blue" onclick="homeSearch()">Search Cars →</button></div></div></div></section><section class="section"><div class="container"><div class="sectionHead"><div><div class="eyebrow">Featured cars</div><h2>Handpicked for Philly drivers.</h2></div><a class="link" href="#/inventory">View all inventory →</a></div><div class="cards">${featured.length?featured.map(carCard).join(''):`<div class="empty glass" style="grid-column:1/-1"><h3>${inventoryError?'Inventory temporarily unavailable':'Inventory is being prepared'}</h3><p class="muted">${inventoryError?'Please try again shortly.':'Published vehicles will appear here automatically from the Philly Cars inventory system.'}</p></div>`}</div></div></section><section class="section"><div class="container"><div class="sectionHead"><div><div class="eyebrow">Shop by body style</div><h2>Find the right fit.</h2></div></div><div class="bodyStyles">${[['SUV','🚙'],['Sedan','🚗'],['Truck','🛻'],['Coupe','🏎️'],['Hatchback','🚘'],['EV','⚡']].map(([n,e])=>`<div class="bodyBox glass" onclick="location.hash='/inventory?body=${n}'"><div class="bodyIcon">${e}</div><b>${n}</b></div>`).join('')}</div></div></section><section class="section"><div class="container why"><div><div class="eyebrow">Why Philly Cars</div><h2>A better car buying experience.</h2><p class="muted">Everything important, without the dealership clutter.</p></div>${[['✓','Quality Inventory','Carefully selected and presented clearly.'],['$','Transparent Pricing','Simple pricing with no visual noise.'],['↔','Easy Trade-In','Send vehicle details in a few minutes.']].map(x=>`<div class="glass"><div class="iconBubble">${x[0]}</div><h3>${x[1]}</h3><p class="muted">${x[2]}</p></div>`).join('')}</div></section><section class="section"><div class="container cityBanner"><div><div class="eyebrow">Philadelphia · Pennsylvania</div><h2>A local dealership built for you.</h2><p class="muted" style="max-width:470px">Browse online, save vehicles, send trade-in details, or contact the Philly Cars team.</p><a class="btn blue" href="#/about">Our Story →</a></div></div></section></main>${footer()}${mobileBottom()}`}
window.homeSearch=()=>{const p=new URLSearchParams();[['make','homeMake'],['body','homeBody'],['max','homePrice'],['year','homeYear']].forEach(([k,id])=>{const v=document.getElementById(id)?.value;if(v)p.set(k,v)});location.hash='/inventory'+(p.toString()?'?'+p:'')}
function unique(k){return [...new Set(cars.map(x=>x[k]).filter(Boolean))]}
function parseRoute(){const raw=location.hash.slice(1)||'/';const [path,qs='']=raw.split('?');return {path,params:new URLSearchParams(qs)}}
function inventory(params=new URLSearchParams()){return `${header()}<main class="page"><div class="container"><section class="pageHero"><div class="eyebrow">Premium inventory · Philadelphia</div><h1>Browse Inventory</h1><p class="muted">Browse current Philly Cars inventory by make, body style, year and price.</p></section><section class="inventoryTop glass"><input id="q" placeholder="Search make, model or trim" value="${params.get('q')||''}" oninput="applyFilters()"><select id="make" onchange="applyFilters()"><option value="">Any Make</option>${unique('make').sort().map(x=>`<option ${params.get('make')===x?'selected':''}>${x}</option>`).join('')}</select><select id="body" onchange="applyFilters()"><option value="">Any Body</option>${unique('body').sort().map(x=>`<option ${params.get('body')===x?'selected':''}>${x}</option>`).join('')}</select><select id="year" onchange="applyFilters()"><option value="">Any Year</option>${unique('year').sort((a,b)=>b-a).map(x=>`<option ${params.get('year')==x?'selected':''}>${x}</option>`).join('')}</select><select id="max" onchange="applyFilters()"><option value="">Any Price</option><option value="30000" ${params.get('max')==='30000'?'selected':''}>Under $30k</option><option value="40000" ${params.get('max')==='40000'?'selected':''}>Under $40k</option><option value="50000" ${params.get('max')==='50000'?'selected':''}>Under $50k</option></select><button class="btn blue" onclick="clearFilters()">Clear</button></section><section class="inventoryLayout"><aside class="filterSidebar glass"><div class="filterGroup"><b>Drivetrain</b>${unique('drive').sort().map(x=>`<label class="check"><input type="checkbox" name="drive" value="${x}" onchange="applyFilters()"> ${x}</label>`).join('')}</div><div class="filterGroup"><b>Exterior color</b>${unique('color').sort().map(x=>`<label class="check"><input type="checkbox" name="color" value="${x}" onchange="applyFilters()"> ${x}</label>`).join('')}</div><div class="filterGroup"><b>Status</b><label class="check"><input type="checkbox" name="status" value="Available" checked onchange="applyFilters()"> Available</label><label class="check"><input type="checkbox" name="status" value="Pending" checked onchange="applyFilters()"> Pending</label><label class="check"><input type="checkbox" name="status" value="Coming Soon" checked onchange="applyFilters()"> Coming Soon</label></div></aside><div><div class="inventoryBar"><b id="resultCount"></b><select id="sort" class="fieldInput" onchange="applyFilters()"><option value="featured">Featured</option><option value="priceAsc">Price: Low to High</option><option value="priceDesc">Price: High to Low</option><option value="yearDesc">Newest Year</option><option value="milesAsc">Lowest Mileage</option></select></div><div id="inventoryGrid" class="vehicleGrid"></div></div></section></div></main>${footer()}${mobileBottom()}`}
window.applyFilters=()=>{const q=(document.getElementById('q')?.value||'').toLowerCase();const make=document.getElementById('make')?.value||'';const body=document.getElementById('body')?.value||'';const year=document.getElementById('year')?.value||'';const max=+(document.getElementById('max')?.value||0);const drives=[...document.querySelectorAll('input[name=drive]:checked')].map(x=>x.value);const colors=[...document.querySelectorAll('input[name=color]:checked')].map(x=>x.value);const statuses=[...document.querySelectorAll('input[name=status]:checked')].map(x=>x.value);let list=cars.filter(v=>(!q||`${v.year} ${v.make} ${v.model} ${v.trim}`.toLowerCase().includes(q))&&(!make||v.make===make)&&(!body||v.body===body)&&(!year||String(v.year)===year)&&(!max||v.price<=max)&&(!drives.length||drives.includes(v.drive))&&(!colors.length||colors.includes(v.color))&&(!statuses.length||statuses.includes(v.status)));const sort=document.getElementById('sort')?.value; if(sort==='priceAsc')list.sort((a,b)=>a.price-b.price);if(sort==='priceDesc')list.sort((a,b)=>b.price-a.price);if(sort==='yearDesc')list.sort((a,b)=>b.year-a.year);if(sort==='milesAsc')list.sort((a,b)=>a.mileage-b.mileage);document.getElementById('resultCount').textContent=`${list.length} vehicles`;document.getElementById('inventoryGrid').innerHTML=list.length?list.map(carCard).join(''):`<div class="empty glass"><h3>${inventoryError?'Inventory temporarily unavailable':cars.length?'No vehicles found':'No published vehicles yet'}</h3><p class="muted">${inventoryError?'Please try again shortly.':cars.length?'Try changing your filters.':'Vehicles marked Ready to Publish or Available in the dealer admin will appear here automatically.'}</p></div>`}
window.clearFilters=()=>{location.hash='/inventory';setTimeout(applyFilters,0)}
function detail(id){
  const v=cars.find(x=>x.id===id);if(!v)return notFound();
  const gallery=(v.images||[]).length?(v.images||[]):[{path:img(v),is_cover:true}];
  const galleryUrls=gallery.map(p=>imageUrl(p.path)||img(v));
  const coverIndex=Math.max(0,gallery.findIndex(x=>x.is_cover));
  window.vehicleGalleryState={images:galleryUrls,index:coverIndex};

  return `${header()}<main class="page">
    <div class="container">
      <section class="detailHero">
        <div class="eyebrow">Inventory / ${v.make}</div>
        <h1 style="font-size:clamp(40px,5vw,64px);margin:8px 0 8px">${v.year} ${v.make} ${v.model}</h1>
        <p class="muted">${[v.trim,`Stock #${v.stock}`].filter(Boolean).join(' · ')}</p>
      </section>

      <section class="vehicleSliderFullBleed">
        <div class="vehicleSlider" id="vehicleSlider" ontouchstart="galleryTouchStart(event)" ontouchend="galleryTouchEnd(event)">
          <div class="vehicleSliderStage">
            <img id="galleryMainImage" class="vehicleSliderImage" src="${galleryUrls[coverIndex]}" alt="${v.year} ${v.make} ${v.model}">
            ${galleryUrls.length>1?`
              <button class="vehicleSliderArrow prev" aria-label="Previous photo" onclick="galleryPrev()">‹</button>
              <button class="vehicleSliderArrow next" aria-label="Next photo" onclick="galleryNext()">›</button>
            `:''}
            <div class="vehicleSliderCounter" id="galleryCounter">${coverIndex+1} / ${galleryUrls.length}</div>
          </div>
          ${galleryUrls.length>1?`
            <div class="vehicleSliderThumbs" id="galleryThumbs">
              ${galleryUrls.map((url,i)=>`<button class="vehicleSliderThumb ${i===coverIndex?'active':''}" aria-label="View photo ${i+1}" onclick="setGalleryIndex(${i})"><img src="${url}" alt=""></button>`).join('')}
            </div>
          `:''}
        </div>
      </section>

      <section class="detailTop detailTopAfterGallery">
        <div>
          ${vehicleFeaturePanel(v)}
          <div class="detailSections simplifiedDetails">
            <div class="detailBox glass"><div class="eyebrow">Overview</div><h2>About this vehicle</h2><p class="muted vehicleDescription">${vehicleOverview(v)}</p></div>
            <div class="detailBox glass"><div class="eyebrow">Equipment</div><h2>Highlights</h2><div class="featureList">${v.features.length?v.features.map(f=>`<div class="featureItem">${f}</div>`).join(''):'<div class="muted">Equipment details coming soon.</div>'}</div></div>
            <div class="detailBox glass"><div class="eyebrow">Interested?</div><h2>Ask about this vehicle.</h2><p class="muted">Reference stock #${v.stock} when you contact us.</p><button class="btn blue" onclick="quickInquiry('${v.id}')">Send Inquiry →</button></div>
          </div>
        </div>
        <aside class="stickyCard glass">
          <span class="pill ${v.status==='Pending'?'pending':v.status==='Coming Soon'?'coming':''}">${v.status}</span>
          <div class="price" style="margin-top:12px">${money(v.price)}</div>
          <button class="btn blue" onclick="quickInquiry('${v.id}')">Ask About This Car</button>
          <button class="btn soft" onclick="quickInquiry('${v.id}','test-drive')">Schedule Test Drive</button>
          <button class="btn ghost" onclick="toggleSaved('${v.id}',this)">${saved.has(v.id)?'♥ Saved':'♡ Save Vehicle'}</button>
        </aside>
      </section>
    </div>
  </main>${footer()}${mobileBottom()}`;
}

let galleryTouchX=0;
window.galleryTouchStart=e=>{galleryTouchX=e.changedTouches?.[0]?.clientX||0};
window.galleryTouchEnd=e=>{
  const end=e.changedTouches?.[0]?.clientX||0;
  const delta=end-galleryTouchX;
  if(Math.abs(delta)<45)return;
  delta<0?galleryNext():galleryPrev();
};
window.setGalleryIndex=index=>{
  const state=window.vehicleGalleryState;
  if(!state?.images?.length)return;
  const count=state.images.length;
  state.index=(Number(index)+count)%count;
  const image=document.getElementById('galleryMainImage');
  const counter=document.getElementById('galleryCounter');
  if(image){
    image.classList.add('changing');
    image.src=state.images[state.index];
    requestAnimationFrame(()=>requestAnimationFrame(()=>image.classList.remove('changing')));
  }
  if(counter)counter.textContent=`${state.index+1} / ${count}`;
  document.querySelectorAll('.vehicleSliderThumb').forEach((thumb,i)=>{
    thumb.classList.toggle('active',i===state.index);
    if(i===state.index)thumb.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
  });
};
window.galleryPrev=()=>setGalleryIndex((window.vehicleGalleryState?.index||0)-1);
window.galleryNext=()=>setGalleryIndex((window.vehicleGalleryState?.index||0)+1);
window.quickInquiry=(id,type='inquiry')=>{const v=cars.find(x=>x.id===id);openLeadModal(type,`${v.year} ${v.make} ${v.model}`,v.stock)}
function genericForm(kind,title,sub,button){return `${header()}<main class="page"><div class="container"><section class="pageHero"><div class="eyebrow">Philly Cars · Philadelphia</div><h1>${title}</h1><p class="muted">${sub}</p></section><section class="formCard glass"><form onsubmit="submitLead(event,'${kind}')"><div class="formGrid"><div class="field"><label>Full Name</label><input class="fieldInput" name="name" required placeholder="Your name"></div><div class="field"><label>Phone</label><input class="fieldInput" name="phone" type="tel" autocomplete="tel" placeholder="(215) 555-0123"></div><div class="field"><label>Email</label><input class="fieldInput" name="email" type="email" placeholder="you@email.com"></div><div class="field"><label>VIN</label><input class="fieldInput" name="vin" placeholder="17-character VIN"></div><div class="field"><label>Year</label><input class="fieldInput" name="year" inputmode="numeric" placeholder="2022"></div><div class="field"><label>Make / Model</label><input class="fieldInput" name="vehicle" placeholder="BMW 330i"></div><div class="field"><label>Mileage</label><input class="fieldInput" name="mileage" inputmode="numeric" placeholder="32,000"></div><div class="field"><label>Condition</label><select class="fieldInput" name="condition"><option>Excellent</option><option>Good</option><option>Fair</option></select></div><div class="field full"><label>Notes</label><textarea class="fieldInput" name="notes" placeholder="Tell us anything useful about the vehicle."></textarea></div><button class="btn blue full">${button} →</button></div></form></section></div></main>${footer()}${mobileBottom()}`}
function validateLeadContact(form){
  const data=Object.fromEntries(new FormData(form));
  const name=String(data.name||'').trim(),phone=String(data.phone||'').trim(),email=String(data.email||'').trim();
  const fail=(message,field)=>{toast(message);form.querySelector('[name="'+field+'"]')?.focus();return false};
  if(name.length<2||name.length>120)return fail('Please enter your full name.','name');
  if(!phone&&!email)return fail('Enter a phone number or email.','phone');
  if(phone&&(!/^[+()\d\s.-]+$/.test(phone)||phone.replace(/\D/g,'').length<10||phone.replace(/\D/g,'').length>15))return fail('Please enter a valid phone number.','phone');
  if(email&&(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return fail('Please enter a valid email.','email');
  if(data.vin&&!/^[A-HJ-NPR-Z0-9]{17}$/i.test(String(data.vin).trim()))return fail('VIN must contain 17 valid characters.','vin');
  return true;
}
window.submitLead=async(e,kind)=>{
  e.preventDefault();if(!validateLeadContact(e.target))return;const data=Object.fromEntries(new FormData(e.target));
  try{
    await apiFetch('/api/v1/leads',{method:'POST',body:JSON.stringify({
      type:kind,name:data.name,phone:data.phone||null,email:data.email||null,vin:data.vin||null,
      message:data.notes||null,payload:data
    })});
    e.target.reset();toast('Request received. Philly Cars will follow up shortly.');
  }catch(err){toast('Could not send request. Please try again.')}
}
function about(){return `${header()}<main class="page"><div class="container"><section class="pageHero"><div class="eyebrow">About Philly Cars</div><h1>A Philadelphia dealership <span class="accent">built for drivers.</span></h1><p class="muted">A cleaner, more transparent way to browse and buy pre-owned vehicles.</p></section><section class="split"><div class="visual"></div><div><div class="eyebrow">Our story</div><h2>Browse vehicles with confidence.</h2><p class="muted">Philly Cars helps drivers explore available pre-owned vehicles in Philadelphia. Browse current inventory, review vehicle photos and specifications, and send an inquiry about a car that interests you.</p></div></section><section class="section"><div class="why"><div><div class="eyebrow">Our values</div><h2>People first. Always.</h2></div>${[['◎','Integrity'],['☆','Quality Vehicles'],['♡','Local & Trusted']].map(x=>`<div class="glass"><div class="iconBubble">${x[0]}</div><h3>${x[1]}</h3><p class="muted">Built into the experience from inventory to contact.</p></div>`).join('')}</div></section></div></main>${footer()}${mobileBottom()}`}
function contact(){return `${header()}<main class="page"><div class="container"><section class="pageHero"><div class="eyebrow">Get in touch</div><h1>Contact <span class="accent">Philly Cars.</span></h1><p class="muted">Questions, test drives, trade-ins, or general inquiries? Send us a message and include the vehicle stock number if applicable.</p></section><section class="formCard glass"><div class="eyebrow">Send a message</div><h2>Ask our team</h2><form onsubmit="submitLead(event,'contact')"><div class="formGrid"><div class="field"><label>Name</label><input class="fieldInput" name="name" autocomplete="name" required></div><div class="field"><label>Phone</label><input class="fieldInput" name="phone" type="tel" autocomplete="tel"></div><div class="field full"><label>Email</label><input class="fieldInput" name="email" type="email" autocomplete="email"></div><div class="field full"><label>Message</label><textarea class="fieldInput" name="notes" required></textarea></div><button class="btn blue full">Send Message →</button></div></form></section></div></main>${footer()}${mobileBottom()}`}
function savedPage(){const list=cars.filter(x=>saved.has(x.id));return `${header()}<main class="page"><div class="container"><section class="pageHero"><div class="eyebrow">Saved vehicles</div><h1>Your shortlist.</h1><p class="muted">Vehicles you saved on this device.</p></section><div class="vehicleGrid">${list.length?list.map(carCard).join(''):`<div class="empty glass"><h3>No saved vehicles yet</h3><p class="muted">Tap the heart on any vehicle to save it here.</p><a class="btn blue" href="#/inventory">Browse Inventory →</a></div>`}</div></div></main>${footer()}${mobileBottom()}`}
window.openLeadModal=(kind,vehicle,stock)=>document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="leadModal"><form class="modalCard" style="max-width:560px" onsubmit="submitModalLead(event,'${kind}','${vehicle}','${stock}')"><div class="modalHead"><div><div class="eyebrow">${stock}</div><h2>${kind==='test-drive'?'Schedule Test Drive':'Vehicle Inquiry'}</h2></div><button class="smallBtn" type="button" onclick="leadModal.remove()">✕</button></div><p class="muted">${vehicle}</p><div class="formGrid"><div class="field full"><label>Name</label><input class="fieldInput" name="name" required></div><div class="field"><label>Phone</label><input class="fieldInput" name="phone" type="tel" autocomplete="tel"></div><div class="field"><label>Email</label><input class="fieldInput" name="email" type="email"></div><div class="field full"><label>Message</label><textarea class="fieldInput" name="notes"></textarea></div><button class="btn blue full">Send Request →</button></div></form></div>`)
window.submitModalLead=async(e,kind,vehicle,stock)=>{
  e.preventDefault();if(!validateLeadContact(e.target))return;const data=Object.fromEntries(new FormData(e.target));
  const v=cars.find(x=>x.stock===stock);
  try{
    await apiFetch('/api/v1/leads',{method:'POST',body:JSON.stringify({
      type:kind,vehicleId:v?.dbId||null,name:data.name,phone:data.phone||null,email:data.email||null,
      message:data.notes||null,payload:{vehicle,stock,...data}
    })});
    leadModal.remove();toast('Request received. Philly Cars will follow up shortly.');
  }catch(err){toast('Could not send request. Please try again.')}
}
function notFound(){return `${header()}<main class="container page"><section class="pageHero"><h1>Page not found.</h1><a class="btn blue" href="#/">Back Home</a></section></main>${footer()}`}
function render(){const {path,params}=parseRoute();let html;if(path==='/')html=home();else if(path==='/inventory')html=inventory(params);else if(path.startsWith('/car/'))html=detail(path.split('/').pop());else if(path==='/trade-in')html=genericForm('trade-in','Value Your Trade in Philadelphia.','Send your vehicle details for a quick review.','Get My Estimate');else if(path==='/sell')html=genericForm('sell','Sell your car to Philly Cars.','Request a straightforward offer with no obligation.','Request an Offer');else if(path==='/about')html=about();else if(path==='/contact')html=contact();else if(path==='/saved')html=savedPage();else html=notFound();document.getElementById('app').innerHTML=html;if(path==='/inventory')setTimeout(applyFilters,0);window.scrollTo(0,0)}
window.addEventListener('hashchange',render);
document.getElementById('app').innerHTML='<main class="page"><div class="container"><section class="pageHero"><div class="eyebrow">Philly Cars</div><h1>Loading inventory…</h1><p class="muted">Connecting to the dealership inventory system.</p></section></div></main>';
loadInventory().finally(render);