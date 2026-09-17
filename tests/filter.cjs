const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const data = JSON.parse(fs.readFileSync('dist/data.json', 'utf8'));
const nodes = new Map();
const document = {getElementById(id) {
  if (!nodes.has(id)) nodes.set(id, {value:'',checked:true,events:{},attributes:{},
    addEventListener(type,fn){this.events[type]=fn},
    setAttribute(key,value){this.attributes[key]=value}});
  return nodes.get(id);
}};
const context = {document,window:{},console,Intl,fetch:async()=>({ok:true,json:async()=>data})};
vm.createContext(context);
vm.runInContext(fs.readFileSync('dist/app.js','utf8'),context);
setImmediate(()=>{
  const api=context.window.cityLens;
  for(const base of data.regions){
    for(let mask=1;mask<8;mask++){
      api.configure({cityId:base.id,age:!!(mask&1),nature:!!(mask&2),brand:!!(mask&4)});
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
    }
  }
  api.configure({cityId:0,age:false,nature:false,brand:false});
  document.getElementById('exclude-metro').events.click();
  assert.equal(document.getElementById('active-results').hidden,true);
  console.log('Passed 228 cities × 7 criteria: exclusion, base preservation, unchanged K/scores, restoration and empty state');
});
