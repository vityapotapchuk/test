import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Static defense against accidentally reintroducing SELECT v.* in public routes.
// Database integration tests should also verify the deployed API responses.
const source=readFileSync(new URL('../src/server.js',import.meta.url),'utf8');
const publicFieldsBlock=source.match(/const PUBLIC_VEHICLE_COLUMNS=Object\.freeze\(\[([\s\S]*?)\]\)/);
assert.ok(publicFieldsBlock,'Public vehicle allowlist must be present');
const allowedColumns=[...publicFieldsBlock[1].matchAll(/'([a-z_]+)'/g)].map(m=>m[1]);
const privateColumns=[
  'purchase_price','auction_fees','transport_cost','recon_cost','other_cost',
  'acquired_at','photo_source_url','photo_source_synced_at',
  'description_sources','description_generated_at'
];

function routeSource(start,end){
  const first=source.indexOf(start);
  assert.ok(first>=0,'Missing route: '+start);
  const last=source.indexOf(end,first+start.length);
  assert.ok(last>first,'Cannot isolate route: '+start);
  return source.slice(first,last);
}

test('public vehicle allowlist excludes dealer costs and internal metadata',()=>{
  for(const col of privateColumns)assert.ok(!allowedColumns.includes(col),'Private field exposed: '+col);
  for(const col of ['id','slug','price','mileage','stock_number','vin','features','status','description','mpg_combined']){
    assert.ok(allowedColumns.includes(col),'Client field missing: '+col);
  }
  assert.equal(allowedColumns.length,new Set(allowedColumns).size,'Duplicate public column');
});

test('all public vehicle SQL queries explicitly select allowed columns',()=>{
  const routes=[
    routeSource('async function getDistributionInventory() {','const VIN_PATTERN'),
    routeSource("app.get('/api/v1/vehicles',","app.get('/api/v1/vehicles/:slug'"),
    routeSource("app.get('/api/v1/vehicles/:slug',","app.get('/api/v1/feeds/inventory.json'")
  ];
  for(const sql of routes){
    assert.ok(sql.includes('SELECT ${PUBLIC_VEHICLE_SELECT},'),'Public query missing allowlist');
    assert.doesNotMatch(sql,/SELECT\s+v\.\*/i,'Public query must not use SELECT v.*');
  }
});

test('admin inventory remains behind authentication',()=>{
  const admin=routeSource("app.get('/api/v1/admin/vehicles',","app.post('/api/v1/admin/vehicles'");
  assert.match(admin,/preHandler:\s*requireAdmin/);
  assert.match(admin,/SELECT\s+v\.\*/);
});
