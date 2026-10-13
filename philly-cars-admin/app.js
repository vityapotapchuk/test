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
const normalizeVehicle=v=>({vin:'',purchasePrice:0,auctionFees:0,transportCost:0,reconCost:0,otherCost:0,acquiredAt:'',channels:{website:'Ready',facebook:'Manual',google:'Not connected',cargurus:'Not connected',cars:'Not connected',autotrader:'Not connected'},...v});
let cars=(JSON.parse(localStorage.getItem('phillyAdminCarsV4')||'null')||seed).map(normalizeVehicle);
let saved=new Set(JSON.parse(localStorage.getItem('phillySaved')||'[]'));
const saveCars=()=>localStorage.setItem('phillyAdminCarsV4',JSON.stringify(cars));
const API_TO_UI_STATUS={acquired:'Acquired',reconditioning:'Reconditioning',photo_needed:'Photo Needed',ready_to_publish:'Ready to Publish',available:'Available',deposit:'Deposit',sold:'Sold',archived:'Archived'};
const UI_TO_API_STATUS=Object.fromEntries(Object.entries(API_TO_UI_STATUS).map(([k,v])=>[v,k]));
const isApiSession=()=>sessionStorage.getItem('phillyAdminApiSession')==='1';
let adminAccounts=[];
let currentAdminId='';
let canManageAccounts=false;
let distributionState={connections:[],feeds:{},canManage:false,publicSiteUrl:''};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const getAdminToken=()=>sessionStorage.getItem('phillyAdminToken')||'';
async function apiFetch(path,options={}){
  const isForm=options.body instanceof FormData;
  const token=getAdminToken();
  const headers={
    ...(isForm?{}:{'Content-Type':'application/json'}),
    ...(token?{Authorization:'Bearer '+token}:{}),
    ...(options.headers||{})
  };
  const res=await fetch(API_BASE+path,{credentials:'include',...options,headers});
  let body={}; try{body=await res.json()}catch{}
  if(!res.ok){const err=new Error(body.error||('HTTP '+res.status));err.status=res.status;err.body=body;throw err}
  return body;
}
function apiToUiVehicle(v){return normalizeVehicle({
  id:v.id,year:v.year,make:v.make,model:v.model,trim:v.trim||'',mileage:v.mileage||0,price:v.price||0,
  body:v.body_style||'SUV',color:v.exterior_color||'',interior:v.interior_color||'',drive:v.drivetrain||'',
  trans:v.transmission||'',engine:v.engine||'',fuel:v.fuel_type||'Gasoline',status:API_TO_UI_STATUS[v.status]||'Acquired',
  image:'car1.jpg',stock:v.stock_number||'',vin:v.vin||'',title:v.title_status||'Clean Title',
  purchasePrice:v.purchase_price||0,auctionFees:v.auction_fees||0,transportCost:v.transport_cost||0,reconCost:v.recon_cost||0,otherCost:v.other_cost||0,
  acquiredAt:v.acquired_at?String(v.acquired_at).slice(0,10):'',features:Array.isArray(v.features)?v.features:[],images:Array.isArray(v.images)?v.images:[],carfax:v.carfax||null,photoSourceUrl:v.photo_source_url||'',description:v.description||'',descriptionGeneratedAt:v.description_generated_at||null,descriptionSources:v.description_sources||null
})}
function uiToApiVehicle(v){return {
  stockNumber:v.stock,vin:v.vin||null,year:+v.year,make:v.make,model:v.model,trim:v.trim||null,price:+v.price||0,mileage:+v.mileage||0,
  purchasePrice:+v.purchasePrice||0,auctionFees:+v.auctionFees||0,transportCost:+v.transportCost||0,reconCost:+v.reconCost||0,otherCost:+v.otherCost||0,
  acquiredAt:v.acquiredAt||null,bodyStyle:v.body||null,exteriorColor:v.color||null,interiorColor:v.interior||null,drivetrain:v.drive||null,
  transmission:v.trans||null,engine:v.engine||null,fuelType:v.fuel||'Gasoline',mpgCombined:+v.mpg||null,titleStatus:v.title||null,status:UI_TO_API_STATUS[v.status]||'acquired',
  description:v.description||null,features:v.features||[],photoSourceUrl:v.photoSourceUrl||null
}}
async function loadCarsFromApi(){
  if(!isApiSession()) return false;
  try{const data=await apiFetch('/api/v1/admin/vehicles');cars=(data.vehicles||[]).map(apiToUiVehicle);saveCars();return true}
  catch(e){if(e.status===401){sessionStorage.removeItem('phillyAdminToken');sessionStorage.removeItem('phillyAdminApiSession');sessionStorage.removeItem('phillyAdminSession')}return false}
}
const DEMO_LEADS=[
 {kind:'Test Drive',name:'Marcus Hill',phone:'(215) 555-0198',vehicle:'2023 BMW 330i xDrive',date:'2026-09-24T13:20:00Z'},
 {kind:'Trade-In',name:'Olivia Reed',phone:'(267) 555-0114',vehicle:'2020 Audi A4',date:'2026-09-24T11:45:00Z'},
 {kind:'Sell Request',name:'Daniel Brooks',phone:'(215) 555-0162',vehicle:'2019 Mercedes C300',date:'2026-09-23T18:10:00Z'}
];
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(+n||0);
const miles=n=>new Intl.NumberFormat('en-US').format(+n||0)+' mi';
const imageUrl=path=>!path?'':path.startsWith('/')?API_BASE+path:path;
const img=v=>{const cover=v.images?.find(x=>x.is_cover)||v.images?.[0];if(cover?.path)return imageUrl(cover.path);if(v.customImage)return v.customImage;const n=parseInt(String(v.image||'1').replace(/\D/g,''),10)||1;return REMOTE_IMAGES[(n-1)%REMOTE_IMAGES.length]};
function photoManagerHtml(v){
  const list=v.images||[];
  if(!list.length)return '<div class="photoEmpty muted">No real photos uploaded yet.</div>';
  return list.map((p,i)=>`<div class="photoCard ${p.is_cover?'cover':''}">
    <div class="photoCardImage" style="background-image:url('${imageUrl(p.path)}')"></div>
    <div class="photoCardMeta"><b>${p.is_cover?'Cover':'Photo '+(i+1)}</b><span>${p.original_name||''}</span></div>
    <div class="photoCardActions">
      <button type="button" class="smallBtn" ${i===0?'disabled':''} onclick="moveVehicleImage('${v.id}','${p.id}',-1)">←</button>
      <button type="button" class="smallBtn" ${i===list.length-1?'disabled':''} onclick="moveVehicleImage('${v.id}','${p.id}',1)">→</button>
      ${p.is_cover?'':'<button type="button" class="smallBtn" onclick="setVehicleCover(\''+v.id+'\',\''+p.id+'\')">Set cover</button>'}
      <button type="button" class="smallBtn danger" onclick="deleteVehicleImage('${v.id}','${p.id}')">Remove</button>
    </div>
  </div>`).join('');
}
function carfaxSummaryHtml(v){
  const doc=v.carfax;
  const summary=doc?.parsed_data?.summary;
  if(!summary)return '';
  const accident=summary.accidentReported||summary.damageReported
    ?(summary.accidentCount!=null?summary.accidentCount+' reported':'Reported')
    :'None found';
  const usage=(summary.usage||[]).join(', ')||'—';
  return `<div class="subhead">CARFAX</div><div class="carfaxSummary">
    <div><span class="muted">Last mileage</span><b>${summary.mileage?miles(summary.mileage):'—'}</b></div>
    <div><span class="muted">Owners</span><b>${summary.owners??'—'}</b></div>
    <div><span class="muted">Accident / damage</span><b>${accident}</b></div>
    <div><span class="muted">Service records</span><b>${summary.serviceRecords??'—'}</b></div>
    <div><span class="muted">Usage</span><b>${usage}</b></div>
    <div><span class="muted">Transmission</span><b>${summary.transmission||v.trans||'—'}</b></div>
    <div><span class="muted">Exterior color</span><b>${summary.exteriorColor||v.color||'—'}</b></div>
    <div><span class="muted">Interior color</span><b>${summary.interiorColor||v.interior||'—'}</b></div>
    <div><span class="muted">Title</span><b>${summary.titleStatus||'—'}</b></div>
    <button type="button" class="btn soft full" onclick="openCarfaxDocument('${doc.document_id}')">Open original CARFAX PDF</button>
  </div>`;
}
window.openCarfaxDocument=async id=>{
  try{
    const res=await fetch(API_BASE+'/api/v1/admin/documents/'+id+'/file',{credentials:'include'});
    if(!res.ok)throw new Error('download_failed');
    const blob=await res.blob();
    const url=URL.createObjectURL(blob);
    window.open(url,'_blank','noopener');
    setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch{toast('Could not open CARFAX PDF')}
};

const slugStatus=s=>String(s||'').replace(/[^a-z0-9]/gi,'');
const totalCost=v=>(+v.purchasePrice||0)+(+v.auctionFees||0)+(+v.transportCost||0)+(+v.reconCost||0)+(+v.otherCost||0);
const gross=v=>(+v.price||0)-totalCost(v);
const ACTIVE_STATUSES=['Ready to Publish','Available','Deposit'];
const ALL_STATUSES=['Acquired','Reconditioning','Photo Needed','Ready to Publish','Available','Deposit','Sold','Archived'];
const CHANNELS=[['website','Website'],['facebook','Facebook Marketplace'],['google','Google Vehicle Ads'],['cargurus','CarGurus'],['cars','Cars.com'],['autotrader','Autotrader']];
function toast(msg){const el=document.createElement('div');el.className='toast';el.textContent=msg;document.getElementById('toast-root').appendChild(el);setTimeout(()=>el.remove(),2200)}
function isLogged(){return sessionStorage.getItem('phillyAdminSession')==='1'}
function login(){return `<main class="adminLogin"><form class="loginCard glass" onsubmit="adminLogin(event)"><div class="brand"><span class="logo"></span>Philly Cars</div><div class="eyebrow" style="margin-top:28px">Dealer administration</div><h1>Welcome back.</h1><p class="muted">Admin is connected to the Philly Cars API. Until the database link is finished, it can fall back to local dev mode.</p><div class="field"><label>Email</label><input class="fieldInput" type="email" name="email" value="manager@phillycars.com" required></div><div class="field"><label>Password</label><input class="fieldInput" type="password" name="password" placeholder="12+ character password" minlength="12" required></div><button class="btn blue">Sign In →</button></form></main>`}
window.adminLogin=async e=>{
  e.preventDefault();
  const fd=new FormData(e.target); const email=fd.get('email'); const password=fd.get('password');
  try{
    let loginData;
    try{
      loginData=await apiFetch('/api/v1/admin/session',{method:'POST',body:JSON.stringify({email,password})});
    }catch(loginErr){
      if(loginErr.status===401){
        try{
          await apiFetch('/api/v1/admin/bootstrap',{method:'POST',body:JSON.stringify({email,password})});
          loginData=await apiFetch('/api/v1/admin/session',{method:'POST',body:JSON.stringify({email,password})});
        }catch(bootstrapErr){
          if(bootstrapErr.status===409) throw loginErr;
          throw bootstrapErr;
        }
      }else throw loginErr;
    }
    if(loginData?.sessionToken)sessionStorage.setItem('phillyAdminToken',loginData.sessionToken);
    sessionStorage.setItem('phillyAdminSession','1');sessionStorage.setItem('phillyAdminApiSession','1');
    const loaded=await loadCarsFromApi();
    if(!loaded)throw Object.assign(new Error('session_not_available'),{status:401});
    location.hash='/inventory'; render(); toast('Connected to Philly Cars database');
  }catch(err){
    sessionStorage.removeItem('phillyAdminToken');
    if(err.status===503){
      sessionStorage.setItem('phillyAdminSession','1');sessionStorage.removeItem('phillyAdminApiSession');
      location.hash='/inventory';render();toast('Database link pending — local dev mode');
    }else toast(err.status===401?'Session blocked by browser or invalid login':'API connection failed');
  }
}
window.logout=async()=>{
  if(isApiSession()){try{await apiFetch('/api/v1/admin/session',{method:'DELETE'})}catch{}}
  sessionStorage.removeItem('phillyAdminToken');sessionStorage.removeItem('phillyAdminApiSession');sessionStorage.removeItem('phillyAdminSession');location.hash='/';render()
}
function sidebar(active='inventory'){return `<aside class="adminSide"><div class="brand"><span class="logo"></span>Philly Cars</div><div class="eyebrow" style="margin:24px 0 8px">Dealer OS</div><nav class="adminMenu"><a class="${active==='dashboard'?'active':''}" href="#/dashboard"><span>⌂</span> Dashboard</a><a class="${active==='inventory'?'active':''}" href="#/inventory"><span>▰</span> Inventory</a><a class="${active==='distribution'?'active':''}" href="#/distribution"><span>⇄</span> Distribution</a><a class="${active==='leads'?'active':''}" href="#/leads"><span>◎</span> Leads</a><a class="${active==='accounts'?'active':''}" href="#/accounts"><span>◉</span> Accounts</a><a class="${active==='settings'?'active':''}" href="#/settings"><span>⚙</span> Settings</a></nav><div style="margin-top:auto"><div class="adminBadge" style="margin-bottom:10px;text-align:center">${isApiSession()?'API + DB':'Local dev'}</div><button class="btn soft" style="width:100%" onclick="logout()">Sign Out</button></div></aside>`}
function mobileBar(){
  const current=(location.hash||'#/inventory').replace('#/','').split('?')[0]||'inventory';
  const item=(key,label,icon)=>`<a class="${current===key?'active':''}" href="#/${key}" onclick="closeMobileMenu()"><span>${icon}</span><b>${label}</b></a>`;
  return `<div class="adminMobileBar">
    <div class="brand"><span class="logo"></span>Philly Cars</div>
    <button class="mobileMenuButton" type="button" aria-label="Open menu" aria-expanded="false" onclick="toggleMobileMenu()">
      <span></span><span></span><span></span>
    </button>
  </div>
  <div class="mobileMenuBackdrop" id="mobileMenuBackdrop" onclick="closeMobileMenu()"></div>
  <aside class="mobileMenuDrawer" id="mobileMenuDrawer" aria-hidden="true">
    <div class="mobileMenuHead">
      <div class="brand"><span class="logo"></span>Philly Cars</div>
      <button class="mobileMenuClose" type="button" aria-label="Close menu" onclick="closeMobileMenu()">✕</button>
    </div>
    <div class="eyebrow">Dealer OS</div>
    <nav class="mobileMenuNav">
      ${item('dashboard','Dashboard','⌂')}
      ${item('inventory','Inventory','▰')}
      ${item('distribution','Distribution','⇄')}
      ${item('leads','Leads','◎')}
      ${item('accounts','Accounts','◉')}
      ${item('settings','Settings','⚙')}
    </nav>
    <div class="mobileMenuFooter">
      <div class="adminBadge">${isApiSession()?'API + DB':'Local dev'}</div>
      <button class="btn soft full" type="button" onclick="closeMobileMenu();logout()">Sign Out</button>
    </div>
  </aside>`;
}
window.toggleMobileMenu=()=>{
  const drawer=document.getElementById('mobileMenuDrawer');
  const backdrop=document.getElementById('mobileMenuBackdrop');
  const button=document.querySelector('.mobileMenuButton');
  if(!drawer||!backdrop)return;
  const open=!drawer.classList.contains('open');
  drawer.classList.toggle('open',open);
  backdrop.classList.toggle('open',open);
  drawer.setAttribute('aria-hidden',open?'false':'true');
  button?.setAttribute('aria-expanded',open?'true':'false');
  document.body.classList.toggle('mobileMenuOpen',open);
};
window.closeMobileMenu=()=>{
  document.getElementById('mobileMenuDrawer')?.classList.remove('open');
  document.getElementById('mobileMenuBackdrop')?.classList.remove('open');
  document.getElementById('mobileMenuDrawer')?.setAttribute('aria-hidden','true');
  document.querySelector('.mobileMenuButton')?.setAttribute('aria-expanded','false');
  document.body.classList.remove('mobileMenuOpen');
};
function dashboard(){
  const active=cars.filter(v=>!['Sold','Archived'].includes(v.status));
  const inventoryValue=active.reduce((n,v)=>n+(+v.price||0),0);
  const potentialGross=active.reduce((n,v)=>n+Math.max(0,gross(v)),0);
  return `<div class="adminShell">${sidebar('dashboard')}<main class="adminMain">${mobileBar()}<div class="adminHead"><div><div class="eyebrow">Philly Cars · Dealer OS</div><h1>Dashboard</h1><p class="muted">Inventory, margin and publishing overview.</p></div><div class="adminTopActions"><span class="adminBadge">v4 foundation</span><button class="btn blue" onclick="openVehicleModal()">+ Add Vehicle</button></div></div><section class="stats"><div class="stat glass"><span class="muted">Active Inventory</span><br><strong>${active.length}</strong></div><div class="stat glass"><span class="muted">Retail Value</span><br><strong>${money(inventoryValue)}</strong></div><div class="stat glass"><span class="muted">Potential Gross</span><br><strong>${money(potentialGross)}</strong></div><div class="stat glass"><span class="muted">New Leads</span><br><strong>${DEMO_LEADS.length}</strong></div></section><section class="dashboardGrid"><div class="adminPanel glass"><div class="sectionHead"><div><div class="eyebrow">Workflow</div><h2>Inventory pipeline</h2></div><a class="link" href="#/inventory">Manage →</a></div><div class="pipeline">${ALL_STATUSES.filter(x=>x!=='Archived').map(st=>`<div><b>${cars.filter(v=>v.status===st).length}</b><span>${st}</span></div>`).join('')}</div></div><div class="adminPanel glass"><div class="sectionHead"><div><div class="eyebrow">Publishing</div><h2>Channels</h2></div><a class="link" href="#/distribution">Open →</a></div><div class="channelMini">${CHANNELS.map(([key,label])=>`<div><span>${label}</span><b>${key==='website'?'Ready':'Setup'}</b></div>`).join('')}</div></div></section><section class="adminPanel glass" style="margin-top:16px"><div class="sectionHead"><div><div class="eyebrow">Recent inventory</div><h2>Latest vehicles</h2></div></div><div id="recentRows"></div></section></main></div>`}

function inventoryAdmin(){return `<div class="adminShell">${sidebar('inventory')}<main class="adminMain">${mobileBar()}<div class="adminHead"><div><div class="eyebrow">Inventory hub</div><h1>Inventory Manager</h1><p class="muted">One vehicle record for your website and every future marketplace feed.</p></div><div class="adminTopActions"><span class="adminBadge">${cars.length} vehicles</span><button class="btn soft" onclick="openCarfaxImport()">Import CARFAX</button><button class="btn blue" onclick="openVehicleModal()">+ Add Vehicle</button></div></div><section class="stats"><div class="stat glass"><span class="muted">Ready / Live</span><br><strong>${cars.filter(x=>ACTIVE_STATUSES.includes(x.status)).length}</strong></div><div class="stat glass"><span class="muted">In Recon</span><br><strong>${cars.filter(x=>['Acquired','Reconditioning','Photo Needed'].includes(x.status)).length}</strong></div><div class="stat glass"><span class="muted">Deposit</span><br><strong>${cars.filter(x=>x.status==='Deposit').length}</strong></div><div class="stat glass"><span class="muted">Sold</span><br><strong>${cars.filter(x=>x.status==='Sold').length}</strong></div></section><section class="adminPanel glass"><div class="adminToolbar"><input id="adminQ" placeholder="Search VIN, stock #, year, make or model" oninput="renderAdminRows()"><select id="adminStatus" onchange="renderAdminRows()"><option value="">All Statuses</option>${ALL_STATUSES.map(x=>`<option>${x}</option>`).join('')}</select></div><div class="tableWrap"><table class="adminTable inventoryTable"><thead><tr><th>Vehicle</th><th>Stock / VIN</th><th>Mileage</th><th>Retail</th><th>Cost</th><th>Gross</th><th>Status</th><th>Actions</th></tr></thead><tbody id="adminRows"></tbody></table></div></section></main></div>`}

window.renderAdminRows=()=>{const el=document.getElementById('adminRows');if(!el)return;const q=(document.getElementById('adminQ')?.value||'').toLowerCase();const st=document.getElementById('adminStatus')?.value||'';const list=cars.filter(v=>(!q||`${v.year} ${v.make} ${v.model} ${v.stock} ${v.vin||''}`.toLowerCase().includes(q))&&(!st||v.status===st));el.innerHTML=list.map(v=>`<tr><td><div class="vehicleCell"><div class="miniCar" style="background-image:url('${img(v)}')"></div><div><b>${v.year} ${v.make} ${v.model}</b><br><span class="muted">${v.trim||'—'}</span>${v.carfax?'<br><span class="syncPill ready">CARFAX</span>':''}</div></div></td><td><b>${v.stock}</b><br><span class="muted vinText">${v.vin||'VIN not added'}</span></td><td>${miles(v.mileage)}</td><td><b>${money(v.price)}</b></td><td>${money(totalCost(v))}</td><td><b class="${gross(v)>=0?'positive':'negative'}">${money(gross(v))}</b></td><td><span class="status ${slugStatus(v.status)}">${v.status}</span></td><td><div class="actions"><button class="smallBtn" onclick="openVehicleModal('${v.id}')">Edit</button><button class="smallBtn" onclick="duplicateVehicle('${v.id}')">Duplicate</button><button class="smallBtn danger" onclick="archiveVehicle('${v.id}')">Archive</button></div></td></tr>`).join('')}

function distribution(){
  return `<div class="adminShell">${sidebar('distribution')}<main class="adminMain">${mobileBar()}
    <div class="adminHead">
      <div>
        <div class="eyebrow">Inventory syndication</div>
        <h1>Distribution</h1>
        <p class="muted">Connect Philly Cars inventory to marketplaces and advertising channels from one place.</p>
      </div>
      <div class="adminTopActions"><span class="adminBadge">Inventory source: API + DB</span></div>
    </div>

    <section class="channelCards" id="distributionCards">
      ${CHANNELS.map(([,label])=>`<div class="channelCard glass connectionLoading"><h3>${label}</h3><p class="muted">Loading connection…</p></div>`).join('')}
    </section>

    <section class="adminPanel glass" style="margin-top:18px">
      <div class="sectionHead"><div><div class="eyebrow">Personal Facebook profile</div><h2>Marketplace listing assistant</h2></div></div>
      <p class="muted">Prepare a listing from your vehicle inventory. Copy the description, download the photos and publish manually in Facebook Marketplace. No Facebook login or automatic posting is performed.</p>
      <div class="field"><label for="facebookDraftVehicle">Choose vehicle</label><select class="fieldInput" id="facebookDraftVehicle"><option value="">Select a vehicle</option>${cars.filter(v=>v.id&&['Ready to Publish','Available','Deposit'].includes(v.status)).map(v=>`<option value="${esc(v.id)}">${esc(v.year+' '+v.make+' '+v.model+' · '+v.stock)}</option>`).join('')}</select></div>
      <button class="btn blue" onclick="prepareFacebookDraft()">Prepare Marketplace Listing</button>
      <div id="facebookDraftResult" style="margin-top:14px" aria-live="polite"></div>
    </section>

    <section class="adminPanel glass distributionFeedPanel" style="margin-top:18px">
      <div class="sectionHead">
        <div><div class="eyebrow">Feed endpoints</div><h2>Inventory feeds</h2></div>
      </div>
      <div id="distributionFeeds" class="feedRows"><div class="muted">Loading feed URLs…</div></div>
    </section>

    <section class="adminPanel glass" style="margin-top:18px">
      <div class="sectionHead"><div><div class="eyebrow">Vehicle readiness</div><h2>Publishing matrix</h2></div></div>
      <div class="tableWrap"><table class="adminTable syncTable">
        <thead><tr><th>Vehicle</th>${CHANNELS.map(x=>`<th>${x[1]}</th>`).join('')}</tr></thead>
        <tbody id="distributionMatrix"><tr><td colspan="${CHANNELS.length+1}" class="muted">Loading channel status…</td></tr></tbody>
      </table></div>
    </section>
  </main></div>`;
}

const DISTRIBUTION_META={
  website:{
    label:'Website',
    eyebrow:'Primary',
    description:'Philly Cars website publishes directly from the master inventory database.'
  },
  facebook:{
    label:'Facebook Marketplace',
    eyebrow:'Marketplace',
    description:'Manual workflow until Meta dealer/business inventory access is confirmed.'
  },
  google:{
    label:'Google Vehicle Ads',
    eyebrow:'Advertising',
    description:'Merchant Center vehicle feed with automated inventory updates.'
  },
  cargurus:{
    label:'CarGurus',
    eyebrow:'Marketplace',
    description:'Dealer partner feed. Account onboarding and provider feed specification are required.'
  },
  cars:{
    label:'Cars.com',
    eyebrow:'Marketplace',
    description:'Dealer inventory feed. Final adapter is enabled after Cars.com dealer onboarding.'
  },
  autotrader:{
    label:'Autotrader',
    eyebrow:'Marketplace',
    description:'Dealer inventory feed. Final adapter is enabled after dealer/provider onboarding.'
  }
};

function distributionConnection(key){
  return distributionState.connections.find(x=>x.channel===key)||null;
}
function connectionStateClass(status){
  return status==='connected'?'live':status==='ready'?'live':status==='error'?'error':'setup';
}
function connectionStateLabel(status){
  return ({connected:'Connected',ready:'Feed Ready',setup:'Setup required',error:'Error',not_connected:'Not connected'})[status]||'Not connected';
}
function renderDistributionConnections(){
  const cards=document.getElementById('distributionCards');
  const feeds=document.getElementById('distributionFeeds');
  const matrix=document.getElementById('distributionMatrix');
  if(!cards||!feeds||!matrix)return;

  cards.innerHTML=CHANNELS.map(([key,label])=>{
    const c=distributionConnection(key)||{channel:key,status:'not_connected',enabled:false,config:{}};
    const meta=DISTRIBUTION_META[key]||{label,eyebrow:'Channel',description:''};
    const tested=c.last_tested_at?new Date(c.last_tested_at).toLocaleString():'Not tested';
    const error=c.last_error?esc(c.last_error):'';
    const feedButton=key==='google'&&distributionState.feeds.google
      ?`<button class="smallBtn" onclick="copyDistributionFeed('google')">Copy Feed URL</button>`
      :['cargurus','cars','autotrader'].includes(key)&&distributionState.feeds.inventoryCsv
        ?`<button class="smallBtn" onclick="copyDistributionFeed('inventoryCsv')">Copy Feed URL</button>`
        :'';
    const configure=key==='website'
      ?''
      :`<button class="smallBtn" ${distributionState.canManage?'':'disabled title="Owner access required"'} onclick="openDistributionConnection('${key}')">Configure</button>`;

    return `<div class="channelCard glass connectionCard">
      <div class="connectionCardTop">
        <div><div class="eyebrow">${meta.eyebrow}</div><h3>${meta.label}</h3></div>
        <span class="channelState ${connectionStateClass(c.status)}">${connectionStateLabel(c.status)}</span>
      </div>
      <p class="muted">${meta.description}</p>
      <div class="connectionMeta">
        <span><b>Mode</b> ${esc(c.mode||'—')}</span>
        <span><b>Last test</b> ${esc(tested)}</span>
      </div>
      ${error?`<div class="connectionError">${error}</div>`:''}
      <div class="connectionActions">
        ${configure}
        <button class="smallBtn" onclick="testDistributionConnection('${key}')">Test</button>
        ${feedButton}
      </div>
    </div>`;
  }).join('');

  feeds.innerHTML=[
    ['Google Merchant Center',distributionState.feeds.google,'TSV vehicle feed'],
    ['Partner CSV',distributionState.feeds.inventoryCsv,'Normalized dealer inventory'],
    ['Inventory JSON',distributionState.feeds.inventoryJson,'API-friendly inventory']
  ].filter(x=>x[1]).map(([label,url,desc])=>`<div class="feedRow">
    <div><b>${label}</b><span class="muted">${desc}</span><code>${esc(url)}</code></div>
    <button class="smallBtn" onclick="copyText('${esc(url)}')">Copy URL</button>
  </div>`).join('');

  matrix.innerHTML=cars.filter(v=>v.status!=='Archived').map(v=>`<tr>
    <td><b>${v.year} ${v.make} ${v.model}</b><br><span class="muted">${v.stock}</span></td>
    ${CHANNELS.map(([key])=>{
      const c=distributionConnection(key);
      if(key==='website'){
        const ready=ACTIVE_STATUSES.includes(v.status);
        return `<td><span class="syncPill ${ready?'ready':'off'}">${ready?'Live-ready':'Not public'}</span></td>`;
      }
      if(key==='facebook')return '<td><span class="syncPill manual">Manual</span></td>';
      const ready=Boolean(c&&['ready','connected'].includes(c.status)&&ACTIVE_STATUSES.includes(v.status));
      return `<td><span class="syncPill ${ready?'ready':'off'}">${ready?'Feed-ready':'Not ready'}</span></td>`;
    }).join('')}
  </tr>`).join('')||`<tr><td colspan="${CHANNELS.length+1}" class="muted">No inventory yet.</td></tr>`;
}

async function loadDistributionConnections(){
  if(!isApiSession())return;
  try{
    distributionState=await apiFetch('/api/v1/admin/distribution/connections');
    renderDistributionConnections();
  }catch(err){
    const cards=document.getElementById('distributionCards');
    if(cards)cards.innerHTML='<div class="notice">Could not load distribution connections.</div>';
  }
}

window.prepareFacebookDraft=async()=>{
  const id=document.getElementById('facebookDraftVehicle')?.value;
  const output=document.getElementById('facebookDraftResult');
  if(!id||!output){toast('Choose a vehicle first');return}
  output.textContent='Preparing listing…';
  try{
    const draft=await apiFetch('/api/v1/admin/distribution/facebook-draft/'+encodeURIComponent(id));
    window.facebookDraftText=draft.description;
    output.innerHTML=`<div class="notice"><b>${esc(draft.title)}</b> · ${money(draft.price)}<p class="muted">Review all details before posting. This listing is not published yet.</p><textarea class="fieldInput" rows="12" readonly>${esc(draft.description)}</textarea><div class="connectionActions"><button class="smallBtn" onclick="copyText(window.facebookDraftText)">Copy Listing Text</button><a class="smallBtn" href="https://www.facebook.com/marketplace/create/vehicle" target="_blank" rel="noopener noreferrer">Open Facebook Marketplace ↗</a></div><div class="muted" style="margin-top:12px">Vehicle photos (open and save each image for upload):</div>${draft.photos.map((p,i)=>`<p><a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Photo ${i+1} ↗</a></p>`).join('')||'<p class="muted">No photos available. Add photos before posting.</p>'}</div>`;
  }catch(err){output.textContent='Could not prepare listing. Check API connection and try again.'}
};

window.copyText=async value=>{
  try{await navigator.clipboard.writeText(value);toast('Copied')}catch{toast('Copy failed')}
};
window.copyDistributionFeed=key=>{
  const value=distributionState.feeds?.[key];
  if(value)copyText(value);
};

window.testDistributionConnection=async key=>{
  const meta=DISTRIBUTION_META[key];
  toast('Testing '+(meta?.label||key)+'…');
  try{
    const result=await apiFetch('/api/v1/admin/distribution/connections/'+key+'/test',{method:'POST',body:JSON.stringify({})});
    await loadDistributionConnections();
    if(result.ready||result.ok)toast((meta?.label||key)+' is ready');
    else toast((result.issues||[])[0]||'Setup is incomplete');
  }catch(err){
    toast('Connection test failed');
  }
};

window.openDistributionConnection=key=>{
  if(!distributionState.canManage){toast('Owner access required');return}
  const c=distributionConnection(key)||{config:{}};
  const cfg=c.config||{};
  const meta=DISTRIBUTION_META[key]||{label:key};
  let fields='';

  if(key==='google'){
    fields=`
      <div class="field"><label>Merchant Center ID</label><input class="fieldInput" name="merchantCenterId" value="${esc(cfg.merchantCenterId||'')}" placeholder="123456789"></div>
      <div class="field"><label>Fulfillment</label><select class="fieldInput" name="fulfillment"><option value="in_store" ${cfg.fulfillment!=='online'?'selected':''}>In-store</option><option value="online" ${cfg.fulfillment==='online'?'selected':''}>Online</option></select></div>
      <div class="field"><label>Google Store Code</label><input class="fieldInput" name="storeCode" value="${esc(cfg.storeCode||'')}" placeholder="Business Profile store code"></div>
      <div class="field"><label>Dealership Name</label><input class="fieldInput" name="dealershipName" value="${esc(cfg.dealershipName||'Philly Cars')}" placeholder="Philly Cars"></div>
      <div class="field full"><label>Dealership Address</label><input class="fieldInput" name="dealershipAddress" value="${esc(cfg.dealershipAddress||'')}" placeholder="Full dealership address"></div>
    `;
  }else if(key==='facebook'){
    fields=`
      <div class="field"><label>Business / Portfolio ID</label><input class="fieldInput" name="businessId" value="${esc(cfg.businessId||'')}" placeholder="Optional"></div>
      <div class="field"><label>Facebook Page ID</label><input class="fieldInput" name="pageId" value="${esc(cfg.pageId||'')}" placeholder="Optional"></div>
      <div class="notice full">This remains a manual channel until dealer inventory access is confirmed. No Facebook password is stored here.</div>
    `;
  }else{
    fields=`
      <div class="field"><label>Dealer Account ID</label><input class="fieldInput" name="dealerAccountId" value="${esc(cfg.dealerAccountId||'')}" placeholder="Provided by ${esc(meta.label)}"></div>
      <div class="field"><label>Provider Contact</label><input class="fieldInput" name="providerContact" value="${esc(cfg.providerContact||'')}" placeholder="Account rep / onboarding email"></div>
      <div class="notice full">Use the Partner CSV URL from Distribution when your marketplace representative requests the inventory feed. Final field mapping will be adapted to the provider specification.</div>
    `;
  }

  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="distributionModal">
    <form class="modalCard connectionModalCard" onsubmit="saveDistributionConnection(event,'${key}')">
      <div class="modalHead"><div><div class="eyebrow">Distribution connection</div><h2>${esc(meta.label)}</h2></div><button type="button" class="smallBtn" onclick="distributionModal.remove()">✕</button></div>
      <div class="formGrid">
        <div class="field full"><label>Connection enabled</label><select class="fieldInput" name="enabled"><option value="true" ${c.enabled?'selected':''}>Enabled</option><option value="false" ${!c.enabled?'selected':''}>Disabled</option></select></div>
        ${fields}
        <div class="field full"><label>Notes</label><textarea class="fieldInput" name="notes" placeholder="Onboarding notes, account rep, requirements…">${esc(cfg.notes||'')}</textarea></div>
      </div>
      <button class="btn blue full">Save Connection →</button>
      <div id="distributionSaveStatus" class="muted"></div>
    </form>
  </div>`);
};

window.saveDistributionConnection=async(e,key)=>{
  e.preventDefault();
  const form=e.target;
  const fd=new FormData(form);
  const config={notes:String(fd.get('notes')||'').trim()};
  if(key==='google'){
    config.merchantCenterId=String(fd.get('merchantCenterId')||'').trim();
    config.fulfillment=String(fd.get('fulfillment')||'in_store');
    config.storeCode=String(fd.get('storeCode')||'').trim();
    config.dealershipName=String(fd.get('dealershipName')||'').trim();
    config.dealershipAddress=String(fd.get('dealershipAddress')||'').trim();
  }else if(key==='facebook'){
    config.businessId=String(fd.get('businessId')||'').trim();
    config.pageId=String(fd.get('pageId')||'').trim();
  }else{
    config.dealerAccountId=String(fd.get('dealerAccountId')||'').trim();
    config.providerContact=String(fd.get('providerContact')||'').trim();
  }

  const status=document.getElementById('distributionSaveStatus');
  if(status)status.textContent='Saving…';
  try{
    await apiFetch('/api/v1/admin/distribution/connections/'+key,{
      method:'PUT',
      body:JSON.stringify({enabled:fd.get('enabled')==='true',accountLabel:DISTRIBUTION_META[key]?.label||key,config})
    });
    document.getElementById('distributionModal')?.remove();
    await loadDistributionConnections();
    toast('Connection settings saved');
  }catch(err){
    if(status)status.textContent='Could not save connection.';
  }
};

function leads(){return `<div class="adminShell">${sidebar('leads')}<main class="adminMain">${mobileBar()}<div class="adminHead"><div><div class="eyebrow">Lead inbox</div><h1>Leads</h1><p class="muted">Test drives, trade-ins, sell requests and vehicle inquiries.</p></div></div><section class="adminPanel glass"><div class="tableWrap"><table class="adminTable"><thead><tr><th>Type</th><th>Name</th><th>Phone</th><th>Vehicle</th><th>Date</th><th>Status</th></tr></thead><tbody>${DEMO_LEADS.map(x=>`<tr><td>${x.kind}</td><td><b>${x.name}</b></td><td>${x.phone}</td><td>${x.vehicle}</td><td>${new Date(x.date).toLocaleDateString()}</td><td><span class="syncPill ready">New</span></td></tr>`).join('')}</tbody></table></div></section></main></div>`}

function accounts(){
  return `<div class="adminShell">${sidebar('accounts')}<main class="adminMain">${mobileBar()}
    <div class="adminHead">
      <div><div class="eyebrow">Access control</div><h1>Admin Accounts</h1><p class="muted">Create and manage access to Philly Cars Dealer OS.</p></div>
      <div class="adminTopActions"><button id="addAccountBtn" class="btn blue" onclick="openAccountModal()" disabled>+ Add Account</button></div>
    </div>
    <section class="adminPanel glass">
      <div id="accountsStatus" class="muted">Loading accounts…</div>
      <div class="tableWrap"><table class="adminTable accountsTable">
        <thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Last login</th><th>Created</th><th></th></tr></thead>
        <tbody id="accountRows"></tbody>
      </table></div>
    </section>
  </main></div>`;
}

async function loadAccounts(){
  const status=document.getElementById('accountsStatus');
  const rows=document.getElementById('accountRows');
  const addBtn=document.getElementById('addAccountBtn');
  if(!isApiSession()){
    if(status)status.textContent='Accounts require database connection.';
    return;
  }
  try{
    const data=await apiFetch('/api/v1/admin/accounts');
    adminAccounts=data.accounts||[];
    currentAdminId=data.currentUserId||'';
    canManageAccounts=Boolean(data.canManage);
    if(status)status.textContent=adminAccounts.length+' account'+(adminAccounts.length===1?'':'s')+(canManageAccounts?'':' · view only');
    if(addBtn){addBtn.disabled=!canManageAccounts;addBtn.title=canManageAccounts?'':'Owner access required';}
    if(rows)rows.innerHTML=adminAccounts.map(a=>{
      const last=a.last_login_at?new Date(a.last_login_at).toLocaleString():'Never';
      const created=a.created_at?new Date(a.created_at).toLocaleDateString():'—';
      return `<tr>
        <td><div class="accountIdentity"><div class="accountAvatar">${esc((a.email||'?')[0]).toUpperCase()}</div><div><b>${esc(a.email)}</b>${a.id===currentAdminId?'<br><span class="muted">Current account</span>':''}</div></div></td>
        <td><span class="accountRole ${a.role}">${esc(a.role)}</span></td>
        <td><span class="syncPill ${a.active?'ready':'off'}">${a.active?'Active':'Disabled'}</span></td>
        <td>${esc(last)}</td><td>${esc(created)}</td>
        <td><button class="smallBtn" ${canManageAccounts?'':'disabled title="Owner access required"'} onclick="openAccountModal('${a.id}')">Edit</button></td>
      </tr>`;
    }).join('');
  }catch(err){
    if(rows)rows.innerHTML='';
    if(addBtn)addBtn.disabled=true;
    if(status)status.innerHTML='<div class="notice">Could not load accounts.</div>';
  }
}

window.openAccountModal=(id='')=>{
  if(!canManageAccounts){toast('Owner access required');return}
  const account=id?adminAccounts.find(a=>a.id===id):null;
  if(id&&!account){toast('Account not found');return}
  const isEdit=Boolean(account);
  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="accountModal">
    <form class="modalCard accountModalCard" onsubmit="saveAdminAccount(event,'${id}')">
      <div class="modalHead"><div><div class="eyebrow">Access control</div><h2>${isEdit?'Edit Account':'Add Account'}</h2></div><button type="button" class="smallBtn" onclick="accountModal.remove()">✕</button></div>
      <div class="formGrid">
        <div class="field full"><label>Email</label><input class="fieldInput" name="email" type="email" autocomplete="username" value="${esc(account?.email||'')}" required></div>
        <div class="field"><label>Role</label><select class="fieldInput" name="role"><option value="manager" ${account?.role==='manager'?'selected':''}>Manager</option><option value="owner" ${account?.role==='owner'?'selected':''}>Owner</option></select></div>
        <div class="field"><label>Status</label><select class="fieldInput" name="active"><option value="true" ${account?.active!==false?'selected':''}>Active</option><option value="false" ${account?.active===false?'selected':''}>Disabled</option></select></div>
        <div class="field full"><label>${isEdit?'New password (leave blank to keep current)':'Password'}</label><input class="fieldInput" name="password" type="password" autocomplete="new-password" minlength="12" ${isEdit?'':'required'} placeholder="${isEdit?'No change unless entered':'Minimum 12 characters'}"></div>
      </div>
      ${isEdit&&account.id===currentAdminId?'<div class="notice">Changing your own password, role, or status will sign this session out for security.</div>':''}
      <button class="btn blue full">${isEdit?'Save Changes':'Create Account'}</button>
      <div id="accountSaveStatus" class="muted"></div>
    </form>
  </div>`);
};

window.saveAdminAccount=async(e,id='')=>{
  e.preventDefault();
  const form=e.target;
  const fd=new FormData(form);
  const body={
    email:String(fd.get('email')||'').trim(),
    role:String(fd.get('role')||'manager'),
    active:fd.get('active')==='true'
  };
  const password=String(fd.get('password')||'');
  if(password)body.password=password;
  const status=document.getElementById('accountSaveStatus');
  const btn=form.querySelector('button.btn.blue');
  btn.disabled=true;
  if(status)status.textContent='Saving…';
  try{
    const result=await apiFetch(id?'/api/v1/admin/accounts/'+id:'/api/v1/admin/accounts',{
      method:id?'PATCH':'POST',
      body:JSON.stringify(body)
    });
    if(result.reauthRequired){
      document.getElementById('accountModal')?.remove();
      toast('Account updated. Sign in again.');
      setTimeout(()=>logout(),500);
      return;
    }
    document.getElementById('accountModal')?.remove();
    await loadAccounts();
    toast(id?'Account updated':'Account created');
  }catch(err){
    const messages={
      owner_required:'Owner access required',
      valid_email_required:'Enter a valid email',
      password_min_12:'Password must be at least 12 characters',
      email_already_exists:'An account with this email already exists',
      last_owner_required:'At least one active owner must remain',
      account_not_found:'Account not found'
    };
    if(status)status.textContent=messages[err.body?.error]||('Save failed: '+(err.body?.error||err.message));
    btn.disabled=false;
  }
};

function settings(){return `<div class="adminShell">${sidebar('settings')}<main class="adminMain">${mobileBar()}<div class="adminHead"><div><div class="eyebrow">Dealer settings</div><h1>Settings</h1><p class="muted">Contact information and API configuration used by the client website.</p></div></div><section class="formCard glass"><div class="formGrid"><div class="field"><label>Dealership name</label><input class="fieldInput" value="Philly Cars"></div><div class="field"><label>Phone</label><input class="fieldInput" placeholder="Add real dealership phone"></div><div class="field full"><label>Public website</label><input class="fieldInput" value="https://phillycars.com"></div><div class="field full"><label>API endpoint</label><input class="fieldInput" value="https://philly-cars-api-dev.onrender.com" disabled></div><div class="field full"><label>Inventory architecture</label><div class="notice">Admin → PostgreSQL → Website + marketplace feeds. Facebook starts as a manual workflow; other channels get connectors after onboarding.</div></div><button class="btn blue full" onclick="event.preventDefault();toast('Settings UI ready; backend save comes with API deployment')">Save Settings</button></div></section></main></div>`}

window.openCarfaxImport=()=>{
  if(!isApiSession()){toast('CARFAX import requires database connection');return}
  document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="carfaxModal">
    <form class="modalCard carfaxImportCard" onsubmit="importCarfax(event)">
      <div class="modalHead"><div><div class="eyebrow">Automatic vehicle intake</div><h2>Import CARFAX</h2></div><button type="button" class="smallBtn" onclick="carfaxModal.remove()">✕</button></div>
      <div class="carfaxDrop">
        <div class="carfaxIcon">PDF</div>
        <h3>Upload CARFAX report</h3>
        <p class="muted">The server will read the report, extract the VIN and vehicle history, decode the vehicle, create the inventory record, and set status to Acquired.</p>
        <input class="fieldInput" type="file" name="carfax" accept="application/pdf,.pdf" required>
      </div>
      <div class="notice">Photos are not required now. Add them later from the vehicle record.</div>
      <button id="carfaxImportBtn" class="btn blue full">Import & Create Vehicle →</button>
      <div id="carfaxImportStatus" class="muted"></div>
    </form>
  </div>`);
};
window.importCarfax=async e=>{
  e.preventDefault();
  const form=e.target;
  const file=form.querySelector('[name=carfax]')?.files?.[0];
  if(!file){toast('Choose a CARFAX PDF');return}
  if(file.size>20*1024*1024){toast('CARFAX PDF must be under 20 MB');return}
  const btn=document.getElementById('carfaxImportBtn');
  const status=document.getElementById('carfaxImportStatus');
  btn.disabled=true;btn.textContent='Reading CARFAX…';
  status.textContent='Uploading and extracting vehicle history…';
  try{
    const fd=new FormData();fd.append('file',file,file.name);
    const result=await apiFetch('/api/v1/admin/import/carfax',{method:'POST',body:fd});
    status.textContent='Vehicle created. Refreshing inventory…';
    await loadCarsFromApi();saveCars();
    document.getElementById('carfaxModal')?.remove();
    render();
    const v=apiToUiVehicle(result.vehicle);
    const summary=result.carfax?.summary||{};
    toast(`${v.year} ${v.make} ${v.model} imported as Acquired`);
    setTimeout(()=>openVehicleModal(v.id),100);
  }catch(err){
    const messages={
      carfax_already_imported:'This CARFAX file was already imported',
      vehicle_vin_already_exists:'A vehicle with this VIN already exists',
      carfax_pdf_unreadable:'Could not read this PDF',
      carfax_text_not_found:'No readable text found in the PDF',
      not_carfax_report:'This file does not look like a CARFAX report',
      vin_not_found_in_carfax:'VIN was not found in this CARFAX report',
      vin_service_unavailable:'VIN decoder is temporarily unavailable',
      vin_not_decoded:'VIN could not be decoded'
    };
    const key=err.body?.error||err.message;
    status.textContent=messages[key]||('Import failed: '+key);
    btn.disabled=false;btn.textContent='Import & Create Vehicle →';
  }
};

window.openVehicleModal=(id='')=>{const v=normalizeVehicle(cars.find(x=>x.id===id)||{year:new Date().getFullYear(),make:'',model:'',trim:'',mileage:0,price:0,body:'SUV',color:'Black',interior:'Black',drive:'AWD',trans:'Automatic',engine:'',fuel:'Gasoline',mpg:0,status:'Acquired',stock:'PC'+String(1060+cars.length),title:'Clean Title',features:[]});document.body.insertAdjacentHTML('beforeend',`<div class="modal" id="vehicleModal"><form class="modalCard" onsubmit="saveVehicle(event,'${id}')"><div class="modalHead"><div><div class="eyebrow">Master vehicle record</div><h2>${id?'Edit Vehicle':'Add Vehicle'}</h2></div><button type="button" class="smallBtn" onclick="vehicleModal.remove()">✕</button></div><div class="subhead">Vehicle identity</div><div class="formGrid">${[['year','Year',v.year],['make','Make',v.make],['model','Model',v.model],['trim','Trim',v.trim],['stock','Stock Number',v.stock],['vin','VIN',v.vin],['price','Retail Price',v.price],['mileage','Mileage',v.mileage],['engine','Engine',v.engine],['trans','Transmission',v.trans],['fuel','Fuel Type',v.fuel],['mpg','Combined MPG',v.mpg||''],['color','Exterior Color',v.color],['interior','Interior Color',v.interior],['acquiredAt','Acquired Date',v.acquiredAt]].map(([n,l,val])=>`<div class="field"><label>${l}</label><input class="fieldInput" name="${n}" value="${val??''}" ${['make','model','price','stock'].includes(n)?'required':''} ${n==='vin'?'maxlength="17"':''} ${n==='acquiredAt'?'type="date"':''}></div>`).join('')}<div class="field"><label>Body Style</label><select class="fieldInput" name="body">${['SUV','Sedan','Coupe','Truck','Hatchback','EV','Wagon','Convertible'].map(x=>`<option ${v.body===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Drivetrain</label><select class="fieldInput" name="drive">${['AWD','RWD','FWD','4WD'].map(x=>`<option ${v.drive===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Title Status</label><select class="fieldInput" name="title">${['Clean Title','Rebuilt Title','Salvage Title','Other'].map(x=>`<option ${v.title===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>VIN Decoder</label><button type="button" class="btn soft" id="decodeVinBtn" onclick="decodeVehicleVin()">Decode VIN →</button></div><div class="field"><label>Workflow Status</label><select class="fieldInput" name="status">${ALL_STATUSES.map(x=>`<option ${v.status===x?'selected':''}>${x}</option>`).join('')}</select></div></div>${id?carfaxSummaryHtml(v):''}<div class="subhead">Listing description</div><div class="descriptionEditor"><div class="descriptionEditorHead"><div><b>Auto-generated vehicle description</b><div class="muted">Built from CARFAX plus official NHTSA VIN and recall data. You can edit the text before publishing.</div></div><button type="button" id="descriptionGenerateBtn" class="btn soft" onclick="regenerateDescription('${id}')" ${id?'':'disabled'}>Regenerate Description</button></div><textarea id="vehicleDescription" class="fieldInput descriptionTextarea" name="description" placeholder="Description will be generated automatically after the vehicle is created.">${esc(v.description||'')}</textarea><div id="descriptionStatus" class="muted">${v.descriptionGeneratedAt?'Generated '+new Date(v.descriptionGeneratedAt).toLocaleString():(id?'No generated description yet.':'A description will be generated automatically after Create Vehicle.')}</div></div><div class="subhead">Cost & margin</div><div class="formGrid">${[['purchasePrice','Purchase Price',v.purchasePrice],['auctionFees','Auction / Buyer Fees',v.auctionFees],['transportCost','Transport',v.transportCost],['reconCost','Reconditioning',v.reconCost],['otherCost','Other Cost',v.otherCost]].map(([n,l,val])=>`<div class="field"><label>${l}</label><input class="fieldInput" name="${n}" inputmode="numeric" value="${val||0}"></div>`).join('')}<div class="field marginPreview"><label>Current Gross</label><div class="fieldValue">${money(gross(v))}</div></div><div class="field full"><label>Features (comma separated)</label><input class="fieldInput" name="features" value="${(v.features||[]).join(', ')}"></div><div class="field full"><label>Vehicle Photos</label><div class="photoDrop">
  <div class="photoSourceBlock">
    <div class="photoSourceTitle"><b>Google Drive folder</b><span class="muted">Import every image from one shared folder</span></div>
    <div class="driveImportRow">
      <input id="driveFolderUrl" class="fieldInput" name="photoSourceUrl" type="url" inputmode="url" placeholder="https://drive.google.com/drive/folders/..." value="${esc(v.photoSourceUrl||'')}" ${id?'':'disabled'}>
      <button type="button" id="driveImportBtn" class="btn soft" onclick="importDrivePhotos('${id}')" ${id?'':'disabled'}>Import from Drive</button>
    </div>
    <div id="driveImportStatus" class="muted">${id?'Folder must be shared as “Anyone with the link”. Re-import later to add new photos; existing Drive photos are skipped.':'Save the vehicle first, then add the Drive folder link.'}</div>
  </div>
  <div class="photoSourceDivider"><span>or upload files</span></div>
  <input id="vehiclePhotos" name="photos" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple onchange="previewPendingPhotos(event)">
  <div class="muted">JPG, PNG, WebP or AVIF · up to 20 MB each. Photos are automatically resized and compressed for web. The first uploaded photo becomes cover automatically.</div>
  <div id="pendingPhotoList" class="pendingPhotoList"></div>
  <div id="existingPhotoGrid" class="photoManager">${id?photoManagerHtml(v):'<div class="photoEmpty muted">Save the vehicle to attach photos.</div>'}</div>
</div></div><button class="btn blue full">${id?'Save Changes':'Create Vehicle'} →</button></div></form></div>`)}

window.regenerateDescription=async vehicleId=>{
  if(!vehicleId){toast('Create the vehicle first');return}
  const btn=document.getElementById('descriptionGenerateBtn');
  const status=document.getElementById('descriptionStatus');
  const textarea=document.getElementById('vehicleDescription');
  if(btn){btn.disabled=true;btn.textContent='Generating…'}
  if(status)status.textContent='Reading CARFAX and official NHTSA data…';
  try{
    const result=await apiFetch('/api/v1/admin/vehicles/'+vehicleId+'/generate-description',{method:'POST',body:JSON.stringify({})});
    const updated=apiToUiVehicle(result.vehicle);
    cars=cars.map(v=>v.id===vehicleId?{...v,...updated}:v);
    saveCars();
    if(textarea)textarea.value=updated.description||'';
    if(status)status.textContent='Generated '+new Date(updated.descriptionGeneratedAt||Date.now()).toLocaleString()+' · CARFAX + NHTSA';
    toast('Vehicle description regenerated');
  }catch(err){
    if(status)status.textContent='Could not generate description.';
    toast('Description generation failed');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Regenerate Description'}
  }
};

window.decodeVehicleVin=async()=>{
  const modal=document.getElementById('vehicleModal');
  const vin=(modal?.querySelector('[name=vin]')?.value||'').trim().toUpperCase();
  if(vin.length!==17){toast('Enter a 17-character VIN');return}
  const btn=document.getElementById('decodeVinBtn');
  if(btn){btn.disabled=true;btn.textContent='Decoding…'}
  try{
    const v=await apiFetch('/api/v1/admin/vin/'+encodeURIComponent(vin));
    const set=(name,val)=>{const el=modal.querySelector('[name='+name+']');if(el&&val!==undefined&&val!==null&&val!=='')el.value=val};
    set('vin',v.vin);set('year',v.year);set('make',v.make);set('model',v.model);set('trim',v.trim);
    set('body',v.bodyStyle);set('drive',v.drivetrain);set('trans',v.transmission);set('engine',v.engine);set('fuel',v.fuelType);
    toast('VIN decoded');
  }catch(err){
    toast(err.status===400?'Invalid VIN':err.status===422?'VIN could not be decoded':'VIN service unavailable');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Decode VIN →'}
  }
}
window.importDrivePhotos=async vehicleId=>{
  if(!vehicleId){toast('Save the vehicle first');return}
  const input=document.getElementById('driveFolderUrl');
  const button=document.getElementById('driveImportBtn');
  const status=document.getElementById('driveImportStatus');
  const folderUrl=String(input?.value||'').trim();
  if(!folderUrl){toast('Paste a Google Drive folder link');return}
  button.disabled=true;
  button.textContent='Importing…';
  if(status)status.textContent='Reading Google Drive folder and processing photos in parallel…';
  try{
    const result=await apiFetch('/api/v1/admin/vehicles/'+vehicleId+'/images/import-drive',{
      method:'POST',
      body:JSON.stringify({folderUrl})
    });
    await refreshVehiclePhotos(vehicleId);
    if(status){
      const seconds=((result.elapsedMs||0)/1000).toFixed(1);status.textContent=`Found ${result.found}. Imported ${result.importedCount}, skipped ${result.skippedCount}, failed ${result.failedCount} · ${seconds}s · ${result.concurrency||1} parallel.`;
    }
    toast(result.importedCount
      ?`Imported ${result.importedCount} photo${result.importedCount===1?'':'s'} from Google Drive`
      :result.skippedCount
        ?'All Google Drive photos were already imported'
        :'No photos imported');
  }catch(err){
    const messages={
      google_drive_not_configured:'Google Drive integration is not configured on the server yet',
      google_drive_api_key_invalid:'Google Drive API key is invalid',
      google_drive_api_disabled:'Google Drive API is not enabled for this key/project',
      google_drive_api_key_restricted:'Google Drive API key restrictions are blocking the server',
      invalid_google_drive_folder_url:'Paste a valid Google Drive folder URL',
      google_drive_folder_not_public:'Folder is not public. Set sharing to “Anyone with the link”',
      google_drive_no_images:'No image files found in this Drive folder',
      google_drive_list_failed:'Could not read the Google Drive folder'
    };
    const key=err.body?.error||err.message;
    if(status)status.textContent=messages[key]||('Import failed: '+key);
    toast(messages[key]||'Google Drive import failed');
  }finally{
    button.disabled=false;
    button.textContent='Import from Drive';
  }
};

window.previewPendingPhotos=e=>{
  const files=[...(e.target.files||[])];
  const el=document.getElementById('pendingPhotoList');if(!el)return;
  el.innerHTML=files.map((f,i)=>`<div class="pendingPhoto"><div class="pendingThumb" style="background-image:url('${URL.createObjectURL(f)}')"></div><span>${i+1}. ${f.name}</span></div>`).join('');
}
async function optimizePhotoForUpload(file){
  if(!file.type.startsWith('image/'))return file;
  try{
    const bitmap=await createImageBitmap(file);
    const maxSide=1920;
    const scale=Math.min(1,maxSide/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));
    canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext('2d',{alpha:false});
    ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    bitmap.close?.();
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.82));
    if(!blob)return file;
    const base=file.name.replace(/\.[^.]+$/,'')||'vehicle-photo';
    return new File([blob],base+'.webp',{type:'image/webp',lastModified:Date.now()});
  }catch{
    return file;
  }
}
async function uploadVehiclePhotos(vehicleId,files){
  const allowed=new Set(['image/jpeg','image/png','image/webp','image/avif']);
  for(let i=0;i<files.length;i++){
    const original=files[i];
    if(!allowed.has(original.type))throw new Error('Use JPG, PNG, WebP or AVIF photos');
    if(original.size>20*1024*1024)throw new Error(original.name+' is larger than 20 MB');
    toast(`Optimizing photo ${i+1} of ${files.length}…`);
    const file=await optimizePhotoForUpload(original);
    const fd=new FormData();fd.append('file',file,file.name);
    toast(`Uploading photo ${i+1} of ${files.length}…`);
    await apiFetch('/api/v1/admin/vehicles/'+vehicleId+'/images',{method:'POST',body:fd});
  }
}
async function refreshVehiclePhotos(vehicleId){
  await loadCarsFromApi();
  const v=cars.find(x=>x.id===vehicleId);
  const grid=document.getElementById('existingPhotoGrid');
  if(grid&&v)grid.innerHTML=photoManagerHtml(v);
  renderAdminRows();
}
window.setVehicleCover=async(vehicleId,imageId)=>{
  try{
    await apiFetch('/api/v1/admin/vehicles/'+vehicleId+'/images/'+imageId,{method:'PATCH',body:JSON.stringify({isCover:true})});
    await refreshVehiclePhotos(vehicleId);toast('Cover photo updated');
  }catch(err){toast('Could not set cover photo')}
}
window.deleteVehicleImage=async(vehicleId,imageId)=>{
  if(!confirm('Remove this photo?'))return;
  try{
    await apiFetch('/api/v1/admin/vehicles/'+vehicleId+'/images/'+imageId,{method:'DELETE'});
    await refreshVehiclePhotos(vehicleId);toast('Photo removed');
  }catch(err){toast('Could not remove photo')}
}
window.moveVehicleImage=async(vehicleId,imageId,dir)=>{
  const v=cars.find(x=>x.id===vehicleId);if(!v)return;
  const list=[...(v.images||[])];const i=list.findIndex(x=>x.id===imageId);const j=i+dir;
  if(i<0||j<0||j>=list.length)return;
  [list[i],list[j]]=[list[j],list[i]];
  try{
    await apiFetch('/api/v1/admin/vehicles/'+vehicleId+'/images/order',{method:'PUT',body:JSON.stringify({imageIds:list.map(x=>x.id)})});
    await refreshVehiclePhotos(vehicleId);toast('Photo order updated');
  }catch(err){toast('Could not reorder photos')}
}
window.saveVehicle=async(e,id)=>{
  e.preventDefault();
  const photoFiles=[...(e.target.querySelector('[name=photos]')?.files||[])];
  const d=Object.fromEntries(new FormData(e.target));delete d.photos;
  ['year','price','mileage','mpg','purchasePrice','auctionFees','transportCost','reconCost','otherCost'].forEach(k=>d[k]=+d[k]||0);
  d.vin=(d.vin||'').trim().toUpperCase();d.features=(d.features||'').split(',').map(x=>x.trim()).filter(Boolean);
  const current=id?cars.find(x=>x.id===id):{};const next=normalizeVehicle({...current,...d,fuel:current?.fuel||'Gasoline'});
  if(isApiSession()){
    try{
      const saved=await apiFetch(id?'/api/v1/admin/vehicles/'+id:'/api/v1/admin/vehicles',{method:id?'PATCH':'POST',body:JSON.stringify(uiToApiVehicle(next))});
      let photoError=null;
      if(photoFiles.length){
        try{await uploadVehiclePhotos(saved.id,photoFiles)}catch(err){photoError=err}
      }
      await loadCarsFromApi();saveCars();vehicleModal.remove();render();
      toast(photoError?'Vehicle saved, but photo upload failed: '+photoError.message:(photoFiles.length?'Vehicle and photos saved':'Vehicle saved to database'));
      return;
    }catch(err){toast('Database save failed: '+(err.body?.error||err.message));return}
  }
  if(id){cars=cars.map(x=>x.id===id?next:x)}else{next.id=`${d.make}-${d.model}-${Date.now()}`.toLowerCase().replace(/[^a-z0-9]+/g,'-');next.image='car1.jpg';next.channels={website:'Ready',facebook:'Manual',google:'Not connected',cargurus:'Not connected',cars:'Not connected',autotrader:'Not connected'};cars.unshift(next)}
  saveCars();vehicleModal.remove();render();toast('Vehicle saved locally')
}
window.duplicateVehicle=async id=>{
  const v=cars.find(x=>x.id===id);if(!v)return;
  const copy=normalizeVehicle({...v,id:'',vin:'',stock:'PC'+String(1060+cars.length),status:'Acquired',customImage:''});
  if(isApiSession()){
    try{const saved=await apiFetch('/api/v1/admin/vehicles',{method:'POST',body:JSON.stringify(uiToApiVehicle(copy))});cars.unshift(apiToUiVehicle(saved));saveCars();render();toast('Vehicle duplicated in database');return}catch(err){toast('Duplicate failed')}
  }
  copy.id=v.id+'-'+Date.now();cars.unshift(copy);saveCars();render();toast('Vehicle duplicated locally')
}
window.archiveVehicle=async id=>{
  const v=cars.find(x=>x.id===id);if(!v||!confirm('Archive this vehicle?'))return;
  if(isApiSession()){try{await apiFetch('/api/v1/admin/vehicles/'+id+'/archive',{method:'POST'});v.status='Archived';saveCars();render();toast('Vehicle archived in database');return}catch(err){toast('Archive failed');return}}
  v.status='Archived';saveCars();render();toast('Vehicle archived locally')
}
function render(){if(!isLogged()){document.getElementById('app').innerHTML=login();return}const path=(location.hash.slice(1)||'/inventory').split('?')[0];let html=path==='/dashboard'?dashboard():path==='/distribution'?distribution():path==='/leads'?leads():path==='/accounts'?accounts():path==='/settings'?settings():inventoryAdmin();document.getElementById('app').innerHTML=html;if(path==='/inventory'||path==='/'){setTimeout(renderAdminRows,0)}if(path==='/accounts'){setTimeout(loadAccounts,0)}if(path==='/distribution'){setTimeout(loadDistributionConnections,0)}if(path==='/dashboard'){setTimeout(()=>{const e=document.getElementById('recentRows');if(e)e.innerHTML=cars.slice(0,5).map(v=>`<div class="vehicleCell recentLine"><div class="miniCar" style="background-image:url('${img(v)}')"></div><div style="flex:1"><b>${v.year} ${v.make} ${v.model}</b><br><span class="muted">${v.stock} · ${money(v.price)} · cost ${money(totalCost(v))}</span></div><span class="status ${slugStatus(v.status)}">${v.status}</span></div>`).join('')},0)}}
window.addEventListener('hashchange',render);render();