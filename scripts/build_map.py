"""Create lightweight reference map paths from KOSTAT 2018 GeoJSON.
Input: https://raw.githubusercontent.com/southkorea/southkorea-maps/master/kostat/2018/json/skorea-municipalities-2018-geo.json
Usage: python3 scripts/build_map.py /path/to/source.json
"""
import json,sys,re,math
from pathlib import Path
root=Path(__file__).resolve().parents[1]
data=json.loads((root/'dist/data.json').read_text());source=json.loads(Path(sys.argv[1]).read_text())
provinces={'11':'서울특별시','21':'부산광역시','22':'대구광역시','23':'인천광역시','24':'광주광역시','25':'대전광역시','26':'울산광역시','29':'세종특별자치시','31':'경기도','32':'강원특별자치도','33':'충청북도','34':'충청남도','35':'전북특별자치도','36':'전라남도','37':'경상북도','38':'경상남도','39':'제주특별자치도'}
lookup={(r['province'],r['name']):r['id'] for r in data['regions']}
regions={i:{'id':i,'paths':[],'center':None} for i in range(228)}
def project(p): return [(p[0]-124.5)*75+42,(38.75-p[1])*93+20]
def simplify(points,tol=.006):
 if len(points)<3:return points
 a,b=points[0],points[-1];dx=b[0]-a[0];dy=b[1]-a[1];den=dx*dx+dy*dy
 best=-1;idx=0
 for i,p in enumerate(points[1:-1],1):
  t=max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)) if den else 0
  dist=(p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2
  if dist>best:best,idx=dist,i
 if best>tol*tol:return simplify(points[:idx+1],tol)[:-1]+simplify(points[idx:],tol)
 return [a,b]
centers={i:[] for i in regions}
for f in source['features']:
 p=f['properties'];province=provinces[p['code'][:2]];name=p['name']
 name=re.sub(r'(?<=시).+구$','',name)
 if province=='인천광역시':name={'남구':'미추홀구','중구':'중구·동구권','동구':'중구·동구권'}.get(name,name)
 if name=='세종시':name='세종특별자치시'
 if name=='군위군':province='대구광역시'
 key=(province,name)
 assert key in lookup,key
 rid=lookup[key];g=f['geometry'];polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
 for poly in polys:
  ring=poly[0];area=0;cx=0;cy=0
  for a,b in zip(ring,ring[1:]):
   cross=a[0]*b[1]-b[0]*a[1];area+=cross;cx+=(a[0]+b[0])*cross;cy+=(a[1]+b[1])*cross
  if abs(area)>1e-10:centers[rid].append((abs(area),[cx/(3*area),cy/(3*area)]))
  out=[]
  for r in poly:
   pts=simplify(r)
   if len(pts)<4:continue
   out.append('M'+'L'.join(','.join(f'{v:.1f}' for v in project(p)) for p in pts)+'Z')
  if out:regions[rid]['paths'].append(''.join(out))
for rid,r in regions.items():
 assert r['paths'] and centers[rid],rid
 # Area-weighted centroids of the largest mainland component of each source district.
 largest=sorted(centers[rid],reverse=True)[0]
 r['center']=[round(v,1) for v in project(largest[1])]
(root/'dist/map.json').write_text(json.dumps({'source':'KOSTAT 2018 / southkorea-maps','regions':list(regions.values())},ensure_ascii=False,separators=(',',':')))
print('Mapped all 228 regions; bytes:',(root/'dist/map.json').stat().st_size)
