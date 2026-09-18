const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const data = JSON.parse(fs.readFileSync('dist/data.json', 'utf8'));
const nodes = new Map();
const document = {querySelectorAll(){return []},getElementById(id) {
  if (!nodes.has(id)) nodes.set(id, {value:'',checked:true,events:{},attributes:{},
    addEventListener(type,fn){this.events[type]=fn},
    setAttribute(key,value){this.attributes[key]=value}});
  return nodes.get(id);
}};
const context = {document,window:{},console,Intl,fetch:async(url)=>({ok:true,json:async()=>url==='map.json'?JSON.parse(fs.readFileSync('dist/map.json','utf8')):data})};
vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/app.js','utf8'),context);
setImmediate(()=>{
  const api=context.window.cityLens;
  for(const base of data.regions){
    for(let mask=1;mask<16;mask++){
      api.configure({cityId:base.id,age:!!(mask&1),nature:!!(mask&2),brand:!!(mask&4),heritage:!!(mask&8)});
      const before=api.getState();
      document.getElementById('exclude-metro').events.click();
      const after=api.getState();
      assert.equal(after.base,base.id); assert.equal(after.k,before.k);
      assert.equal(after.nearest.length,10);
      for(const r of after.nearest){
        assert.notEqual(r.id,base.id);
        assert(!['서울특별시','인천광역시'].includes(data.regions[r.id].province));
        const old=before.nearest.find(x=>x.id===r.id);
        if(old) assert.equal(old.score,r.score);
      }
      document.getElementById('exclude-metro').events.click();
      assert.equal(JSON.stringify(api.getState().nearest),JSON.stringify(before.nearest));
      document.getElementById('exclude-same').events.click();
      const outside=api.getState();
      assert.equal(outside.nearest.length,10);
      for(const r of outside.nearest) assert.notEqual(data.regions[r.id].province,base.province);
      document.getElementById('exclude-same').events.click();
      assert.equal(JSON.stringify(api.getState().nearest),JSON.stringify(before.nearest));
    }
  }
  api.configure({cityId:12,age:true,nature:true,brand:true,heritage:true});
  document.getElementById('view-space').events.click();
  assert.equal(document.getElementById('map-view').hidden,true);
  assert.equal(document.getElementById('space-view').hidden,false);
  document.getElementById('view-map').events.click();
  assert.equal(document.getElementById('map-view').hidden,false);
  const next=api.getState().nearest[1].id;
  document.getElementById('geography').events.click({target:{closest:()=>({dataset:{region:String(next)}})}});
  assert.equal(api.getState().base,12);
  assert.equal(api.getState().compare,next);
  document.getElementById('geography').events.keydown({key:'Enter',preventDefault(){},target:{closest:()=>({dataset:{region:'0'}})}});
  assert.equal(api.getState().base,0);
  assert.equal((document.getElementById('geography').innerHTML.match(/data-region=/g)||[]).length,228);
  assert.equal((document.getElementById('geography').innerHTML.match(/class="map-rank"/g)||[]).length,10);
  assert(document.getElementById('consumption-cards').innerHTML.includes('객단가'));
  api.configure({cityId:0,age:false,nature:false,brand:false,heritage:false});
  document.getElementById('exclude-metro').events.click();
  assert.equal(document.getElementById('active-results').hidden,true);
  console.log('Passed 228 cities × 15 criteria: both exclusions, ranked map, consumption cards, restoration and empty state');
});
