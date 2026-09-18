'use strict';
const $=id=>document.getElementById(id);
const labels=['20대_이하','20대','30대','40대','50대','60대 이상','산 수','해수욕장 수','브랜드 매장','세계유산'];
const shortProvince=s=>s.replace('특별자치도','').replace('특별자치시','').replace('특별시','').replace('광역시','');
const fmt=n=>new Intl.NumberFormat('ko-KR').format(n);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let G=null,mapMode=true,D,base=0,compare=0,mask=15,nearest=[],excludeSame=false;
const activeDims=()=>[...((mask&1)?[0,1,2,3,4,5]:[]),...((mask&2)?[6,7]:[]),...((mask&4)?[8]:[]),...((mask&8)?[9]:[])];
const selectedGroups=()=>Number(!!(mask&1))+Number(!!(mask&2))+Number(!!(mask&4))+Number(!!(mask&8));

function populate(){
 const query=$('search').value.trim();
 const cities=D.regions.filter(r=>(r.province+' '+r.name).includes(query));
 $('city').innerHTML=cities.map(r=>`<option value="${r.id}" ${r.id===base?'selected':''}>${esc(shortProvince(r.province))} ${esc(r.name)}</option>`).join('');
 $('search-status').textContent=query?`${cities.length}개 지역 검색됨`:'';
 if(!cities.length){$('city').innerHTML='<option value="">검색 결과가 없습니다</option>';return;}
 if(!cities.some(r=>r.id===base))$('city').value=String(cities[0].id);
}
function rank(){
 const ids=activeDims(),groups=selectedGroups(),b=D.regions[base];
 nearest=D.regions.filter(r=>r.id!==base)
  .filter(r=>!excludeSame||r.province!==b.province)
  .map(r=>{const distance=Math.sqrt(ids.reduce((s,i)=>s+(D.vectors[r.id][i]-D.vectors[base][i])**2,0)/groups);return {...r,distance,score:100/(1+distance)};})
  .sort((a,b)=>a.distance-b.distance||a.id-b.id).slice(0,10);
}
function render(reset=true){
 const b=D.regions[base];
 $('province').textContent=b.province;$('city-name').textContent=b.name;$('population').textContent=fmt(b.population)+'명';
 $('empty').hidden=!!mask;$('active-results').hidden=!mask;
 $('exclude-same').setAttribute('aria-pressed',String(excludeSame));
 $('candidate-note').textContent=excludeSame?`같은 시·도(${shortProvince(b.province)})를 유사 도시 후보에서 제외했습니다. 군집 모델은 그대로입니다.`:'전국 모든 지역을 유사 도시 후보로 봅니다.';
 if(!mask)return;
 rank();if(reset||!nearest.some(r=>r.id===compare))compare=nearest[0].id;
 const model=D.models[mask];
 $('target-title').textContent=b.name;
 $('active-label').textContent=[mask&1?'연령대':null,mask&2?'자연경관':null,mask&4?'브랜드 매장':null,mask&8?'세계유산':null].filter(Boolean).join(' + ');
 $('optimal-k').textContent=model.recommendedK;
 $('ranking').innerHTML=nearest.map((r,i)=>`<button class="rank-card ${r.id===compare?'active':''}" data-city="${r.id}" aria-pressed="${r.id===compare}"><span class="rank-number">${String(i+1).padStart(2,'0')}</span><span class="rank-city"><strong>${esc(r.name)}</strong><small>${esc(r.province)}${model.labels[model.recommendedK][r.id]===model.labels[model.recommendedK][base]?' · 같은 군집':''}</small></span><span class="rank-score">${r.score.toFixed(1)}<small>점</small><span class="score-track"><span style="width:${r.score}%"></span></span></span></button>`).join('');
 drawMap();drawSpace();drawRadar();drawK();renderTable();renderConsumption();
}
function selectCompare(id){if(!nearest.some(r=>r.id===id))return;compare=id;render(false);}
function setView(isMap){mapMode=isMap;$('map-view').hidden=!isMap;$('space-view').hidden=isMap;$('view-map').setAttribute('aria-pressed',String(isMap));$('view-space').setAttribute('aria-pressed',String(!isMap));}
function onMapPick(event){const node=event.target.closest('[data-region]');if(!node)return;const id=Number(node.dataset.region);if(id===base)return;if(nearest.some(r=>r.id===id)){selectCompare(id);return;}base=id;$('search').value='';populate();render();}

function drawMap(){
 if(!G?.regions){$('geography').innerHTML='<text x="320" y="240" text-anchor="middle" fill="#6a7e78">지도를 불러오지 못했습니다.</text>';return;}
 const near=new Map(nearest.map((r,i)=>[r.id,{...r,order:i+1}]));
 let svg='<defs><filter id="map-shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#183631" flood-opacity=".22"/></filter></defs><text x="112" y="285" fill="#a3b8ad" font-size="13" letter-spacing="5">서해</text><text x="473" y="240" fill="#a3b8ad" font-size="13" letter-spacing="5">동해</text>';
 const ordered=[...G.regions.filter(g=>!near.has(g.id)),...G.regions.filter(g=>near.has(g.id)).sort((a,b)=>near.get(b.id).order-near.get(a.id).order)];
 for(const region of ordered){
  const r=D.regions[region.id],n=near.get(r.id),[cx,cy]=region.center;
  const scale=n?1.04+(11-n.order)*.012:1;
  const transform=n?`translate(${cx} ${cy}) scale(${scale.toFixed(3)}) translate(${-cx} ${-cy})`:'';
  const action=r.id===base?'기준 도시':n?'비교 도시로 선택':'기준 도시로 선택';
  const cls=['map-region',n?'map-similar':'',r.id===base?'map-base':'',r.id===compare?'map-compare':''].filter(Boolean).join(' ');
  svg+=`<g class="${cls}" transform="${transform}" role="button" tabindex="0" data-region="${r.id}" aria-label="${esc(r.province+' '+r.name)}, ${action}"><title>${esc(r.province+' '+r.name)}${n?' · '+n.order+'위 · 유사도 '+n.score.toFixed(1)+'점':''}</title>${region.paths.map(path=>`<path d="${path}"/>`).join('')}</g>`;
 }
 for(const r of nearest){const region=G.regions.find(g=>g.id===r.id);if(!region)continue;const [x,y]=region.center,order=nearest.findIndex(n=>n.id===r.id)+1;svg+=`<g class="map-rank" pointer-events="none"><circle cx="${x}" cy="${y}" r="8"/><text x="${x}" y="${y+3.5}" text-anchor="middle">${order}</text></g>`;}
 for(const [id,color,dy] of [[base,'#067a68',-18],[compare,'#d36b35',25]]){const region=G.regions.find(r=>r.id===id);if(!region)continue;const [x,y]=region.center;svg+=`<g pointer-events="none"><circle cx="${x}" cy="${y}" r="5" fill="${color}" stroke="white" stroke-width="2"/><text class="map-label" x="${x}" y="${y+dy}" text-anchor="middle" fill="${color}">${esc(D.regions[id].name)}</text></g>`;}
 $('geography').innerHTML=svg;
}
function drawSpace(){
 const model=D.models[mask],points=model.projection,mins=[0,1].map(i=>Math.min(...points.map(p=>p[i]))),maxs=[0,1].map(i=>Math.max(...points.map(p=>p[i]))),xy=i=>[40+(points[i][0]-mins[0])/(maxs[0]-mins[0]||1)*590,320-(points[i][1]-mins[1])/(maxs[1]-mins[1]||1)*270];
 let s='<defs><radialGradient id="glow"><stop stop-color="#067a68" stop-opacity=".24"/><stop offset="1" stop-color="#067a68" stop-opacity="0"/></radialGradient></defs>';
 for(let x=60;x<=650;x+=70)s+=`<line x1="${x}" y1="25" x2="${x}" y2="340" stroke="#cddcd3" stroke-dasharray="2 7"/>`;
 for(let y=40;y<=340;y+=60)s+=`<line x1="25" y1="${y}" x2="650" y2="${y}" stroke="#cddcd3" stroke-dasharray="2 7"/>`;
 const [bx,by]=xy(base);s+=`<circle cx="${bx}" cy="${by}" r="85" fill="url(#glow)"/>`;
 for(const r of nearest){const [x,y]=xy(r.id);s+=`<line x1="${bx}" y1="${by}" x2="${x}" y2="${y}" stroke="#d36b35" stroke-opacity="${r.id===compare?.65:.18}" stroke-width="${r.id===compare?2:1}"/>`;}
 const focus=new Set(nearest.map(r=>r.id));D.regions.forEach(r=>{if(r.id===base||focus.has(r.id))return;const [x,y]=xy(r.id);s+=`<circle cx="${x}" cy="${y}" r="3.2" fill="#a9bfb0" opacity=".48"><title>${esc(r.province+' '+r.name)}</title></circle>`;});
 nearest.slice().reverse().forEach(r=>{const [x,y]=xy(r.id);s+=`<g class="node" role="button" tabindex="0" data-node="${r.id}"><circle cx="${x}" cy="${y}" r="${r.id===compare?9:6}" fill="#d36b35" stroke="#f5f7f5" stroke-width="2"/><title>${esc(r.name)} · ${r.score.toFixed(1)}점</title></g>`;});
 s+=`<circle cx="${bx}" cy="${by}" r="10" fill="#067a68" stroke="#f5f7f5" stroke-width="3"/><text x="${Math.min(600,Math.max(50,bx))}" y="${Math.max(17,by-27)}" text-anchor="middle" fill="#067a68" font-weight="700" font-size="15" paint-order="stroke" stroke="#f5f7f5" stroke-width="5">${esc(D.regions[base].name)}</text>`;
 $('constellation').innerHTML=s;$('projection-note').textContent=`특성 공간을 PCA로 펼친 그림입니다. 2차원 설명분산 ${(model.explained*100).toFixed(1)}%. 정확한 순위는 원래 특성 전체로 계산합니다.`;
}
function drawRadar(){
 const b=D.regions[base],c=D.regions[compare],ids=new Set(activeDims()),cx=190,cy=171,R=112,N=labels.length,pos=(i,value)=>{const a=-Math.PI/2+i*Math.PI*2/N;return [cx+Math.cos(a)*R*value,cy+Math.sin(a)*R*value]};let s='';
 for(const level of [.25,.5,.75,1])s+=`<polygon points="${labels.map((_,i)=>pos(i,level).join(',')).join(' ')}" fill="none" stroke="#d7e2db" stroke-width=".8"/>`;
 labels.forEach((label,i)=>{const [x,y]=pos(i,1),[lx,ly]=pos(i,1.25);s+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#d7e2db"/><text x="${lx}" y="${ly+5}" text-anchor="${Math.abs(lx-cx)<20?'middle':lx>cx?'start':'end'}" fill="${ids.has(i)?'#3f6557':'#a2afa7'}" font-size="11">${label}</text>`;});
 for(const [r,color] of [[c,'#d36b35'],[b,'#067a68']]){s+=`<polygon points="${r.percentiles.map((v,i)=>pos(i,v/100).join(',')).join(' ')}" fill="${color}" fill-opacity=".1" stroke="${color}" stroke-width="2"/>`;r.percentiles.forEach((v,i)=>{const [x,y]=pos(i,v/100);s+=`<circle cx="${x}" cy="${y}" r="${ids.has(i)?3:1.5}" fill="${color}" opacity="${ids.has(i)?1:.3}"/>`;});}
 $('radar').innerHTML=s;$('compare-title').textContent=`${b.name}와 ${c.name}`;$('radar-base').textContent=b.name;$('radar-compare').textContent=c.name;
}
function renderTable(){
 const b=D.regions[base],c=D.regions[compare],ids=new Set(activeDims());$('table-base').textContent=b.name;$('table-compare').textContent=c.name;
 const value=(r,i)=>i<6?(r.raw[i]*100).toFixed(1)+'%':i<9?fmt(r.raw[i])+'개':r.raw[i]?'소재':'없음';
 $('comparison').innerHTML=labels.map((label,i)=>`<tr class="${ids.has(i)?'':'off'}"><td>${label}${ids.has(i)?'':' <small>비교 제외</small>'}</td><td>${value(b,i)}</td><td>${value(c,i)}</td></tr>`).join('')+`<tr><td>세계유산 명칭</td><td>${esc(b.heritageNames.join(' · ')||'해당 없음')}</td><td>${esc(c.heritageNames.join(' · ')||'해당 없음')}</td></tr><tr><td>매장 수 구성</td><td>스타벅스 ${b.starbucks} · 올리브영 ${b.oliveyoung} · 영화관 ${b.cinema} · 맥도날드 ${b.mcdonalds}</td><td>스타벅스 ${c.starbucks} · 올리브영 ${c.oliveyoung} · 영화관 ${c.cinema} · 맥도날드 ${c.mcdonalds}</td></tr>`;
}
function renderConsumption(){
 const means=D.sectorNames.map((_,i)=>nearest.reduce((s,r)=>s+r.consumption.sectors[i],0)/nearest.length);
 const nationwide=D.sectorNames.map((_,i)=>D.regions.reduce((s,r)=>s+r.consumption.sectors[i],0)/D.regions.length);
 const order=means.map((v,i)=>({i,v,d:v-nationwide[i]})).sort((a,b)=>b.v-a.v).slice(0,5),max=Math.max(...order.map(x=>Math.max(x.v,nationwide[x.i])));
 $('consumption-bars').innerHTML=order.map(x=>`<div class="bar-row"><div><strong>${esc(D.sectorNames[x.i])}</strong><span>${x.v.toFixed(1)}%</span></div><div class="bar-track"><i style="width:${x.v/max*100}%"></i><b style="left:${nationwide[x.i]/max*100}%" title="전국 지역 평균 ${nationwide[x.i].toFixed(1)}%"></b></div><small>전국 지역 평균 ${nationwide[x.i].toFixed(1)}%</small></div>`).join('');
 const diffs=means.map((v,i)=>({name:D.sectorNames[i],d:v-nationwide[i]})).sort((a,b)=>b.d-a.d);
 $('consumption-insight').textContent=`전국 지역 평균보다 ${diffs[0].name} ${diffs[0].d>=0?'+':''}${diffs[0].d.toFixed(1)}%p, ${diffs[1].name} ${diffs[1].d>=0?'+':''}${diffs[1].d.toFixed(1)}%p로 가장 큰 차이를 보입니다.`;
 $('consumption-cards').innerHTML=nearest.map((r,i)=>`<button class="consumption-card ${r.id===compare?'active':''}" data-city="${r.id}"><span>${i+1}</span><div><strong>${esc(r.name)}</strong><small>${r.consumption.top.map(x=>`${esc(x.name)} ${x.share.toFixed(1)}%`).join(' · ')}</small><em>객단가 ${fmt(r.consumption.ticket)}원 · 2분기 ${r.consumption.trendPct>=0?'+':''}${r.consumption.trendPct.toFixed(1)}%</em></div></button>`).join('');
 const v=D.meta.consumptionValidation;
 $('validation-note').innerHTML=`<strong>전국 검증</strong> 네 기준을 모두 썼을 때, 각 도시의 TOP 10은 나머지 지역보다 소비 업종 구성이 평균 <b>${v.reductionPct}%</b> 더 가까웠습니다. 업종 비중 거리 ${v.top10Mean} 대 ${v.otherMean}%p · Wilcoxon p&lt;0.001. 연관성 검증이며 인과관계는 아닙니다.`;
}
function drawK(){
 const model=D.models[mask],k=model.recommendedK,rows=model.evaluations,chosen=rows.find(r=>r.k===k),step=rows.length>1?530/(rows.length-1):0,xy=(i,v)=>[75+i*step,187-v*150];let s='';
 for(const v of [0,.25,.5,.75,1]){const y=xy(0,v)[1];s+=`<line x1="45" y1="${y}" x2="615" y2="${y}" stroke="#e0e8e2"/><text x="32" y="${y+4}" text-anchor="end" fill="#6a7e78" font-size="12">${v}</text>`;}
 const chosenIndex=rows.findIndex(r=>r.k===k),kx=xy(chosenIndex,0)[0];s+=`<rect x="${kx-19}" y="24" width="38" height="170" rx="6" fill="#067a68" fill-opacity=".07"/><text x="${kx}" y="16" text-anchor="middle" fill="#067a68" font-size="12">추천</text>`;
 for(const [key,color]of[['silhouette','#067a68'],['stability','#d36b35']]){if(rows.length>1)s+=`<polyline points="${rows.map((r,i)=>xy(i,r[key]).join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;rows.forEach((r,i)=>{const [x,y]=xy(i,r[key]);s+=`<circle cx="${x}" cy="${y}" r="4" fill="${color}"><title>K=${r.k} ${key}: ${r[key]}</title></circle>`;});}
 rows.forEach((r,i)=>s+=`<text x="${xy(i,0)[0]}" y="213" fill="#6a7e78" text-anchor="middle" font-size="12">${r.k}</text>`);$('k-chart').innerHTML=s;
 $('model-summary').textContent=`K=${k} · 최소 군집 ${chosen.minSize}곳`;
 $('k-explanation').textContent=mask===8?'세계유산 소재 여부는 0과 1 두 값뿐이므로 두 집단으로만 구분합니다.':`현재 기준의 추천은 ${k}개 군집입니다. 실루엣 ${chosen.silhouette.toFixed(3)}, 재표집 안정성 ${chosen.stability.toFixed(3)}입니다. ${model.relaxed?'안정성·최소 크기 조건을 만족하는 후보가 없어 전체 후보에서 선택했습니다.':'안정성과 최소 크기 조건을 통과한 후보 중 분리도가 높은 간결한 구분을 선택했습니다.'}`;
}
async function init(){
 try{
  const response=await fetch('data.json');if(!response.ok)throw new Error('데이터 요청 실패');D=await response.json();
  try{const mapResponse=await fetch('map.json');if(mapResponse.ok)G=await mapResponse.json();}catch(e){console.warn('참고 지도를 불러오지 못했습니다.');}
  base=D.regions.find(r=>r.name==='춘천시')?.id??0;populate();$('load-status').hidden=true;$('app').hidden=false;render();
  $('search').addEventListener('input',()=>{populate();if($('city').value!==''){base=Number($('city').value);render();}});
  document.querySelectorAll('a[href="#model"],a[href="#method"]').forEach(a=>a.addEventListener('click',()=>{document.querySelector(a.getAttribute('href')).open=true;}));
  $('city').addEventListener('change',e=>{if(e.target.value==='')return;base=Number(e.target.value);render();});
  for(const [id,bit] of [['age',1],['nature',2],['brand',4],['heritage',8]])$(id).addEventListener('change',()=>{mask=($('age').checked?1:0)|($('nature').checked?2:0)|($('brand').checked?4:0)|($('heritage').checked?8:0);render();});
  $('view-map').addEventListener('click',()=>setView(true));$('view-space').addEventListener('click',()=>setView(false));
  $('geography').addEventListener('click',onMapPick);$('geography').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onMapPick(e);}});
  $('exclude-same').addEventListener('click',()=>{excludeSame=!excludeSame;render();});
  for(const id of ['ranking','consumption-cards'])$(id).addEventListener('click',e=>{const button=e.target.closest('[data-city]');if(button)selectCompare(Number(button.dataset.city));});
  $('constellation').addEventListener('click',e=>{const g=e.target.closest('[data-node]');if(g)selectCompare(Number(g.dataset.node));});
  $('constellation').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const g=e.target.closest('[data-node]');if(g){e.preventDefault();selectCompare(Number(g.dataset.node));}}});
  const configure=input=>{if(!input||typeof input!=='object')throw new Error('설정 객체가 필요합니다.');if(!Number.isInteger(input.cityId)||!D.regions[input.cityId])throw new Error('유효한 도시 ID가 필요합니다.');for(const key of ['age','nature','brand','heritage'])if(typeof input[key]!=='boolean')throw new Error('기준은 true 또는 false여야 합니다.');base=input.cityId;mask=(input.age?1:0)|(input.nature?2:0)|(input.brand?4:0)|(input.heritage?8:0);$('search').value='';populate();for(const id of ['age','nature','brand','heritage'])$(id).checked=input[id];render();return {city:D.regions[base].name,recommendedK:mask?D.models[mask].recommendedK:null,similar:mask?nearest.map(r=>({id:r.id,name:r.name,score:Number(r.score.toFixed(1))})):[]};};
  window.cityLens={configure,getState:()=>({base,compare,mask,excludeSame,nearest:nearest.map(r=>({id:r.id,score:r.score})),k:mask?D.models[mask].recommendedK:null})};
  if(document.modelContext?.registerTool)try{await document.modelContext.registerTool({name:'configure_city_comparison',description:'기준 도시와 연령·자연·브랜드·세계유산 선택을 변경하고 유사 도시를 반환합니다.',inputSchema:{type:'object',properties:{cityId:{type:'integer'},age:{type:'boolean'},nature:{type:'boolean'},brand:{type:'boolean'},heritage:{type:'boolean'}},required:['cityId','age','nature','brand','heritage'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:configure});}catch(e){console.warn('도시 비교 도구 등록을 지원하지 않는 환경입니다.');}
 }catch(error){$('load-status').textContent='지역 데이터를 불러오지 못했습니다. 잠시 후 새로고침해주세요.';console.error(error);}
}
init();
