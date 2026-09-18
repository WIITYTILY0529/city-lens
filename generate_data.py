"""Rebuild aggregate-only site data from local regional feature and consumption CSVs."""
from pathlib import Path
import argparse, json
import numpy as np
import pandas as pd
from scipy.stats import rankdata, wilcoxon
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import adjusted_rand_score, silhouette_score
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).resolve().parent
PARENT = ROOT.parent
parser = argparse.ArgumentParser()
parser.add_argument('--input', type=Path, default=PARENT/'연령_산_바다_브랜드_군집분석'/'지역별_원시피처.csv')
parser.add_argument('--profile', type=Path, default=PARENT/'지역별_상권분석'/'255개_시군구_상권프로필.csv')
parser.add_argument('--industry', type=Path, default=PARENT/'지역별_상권분석'/'시군구별_업종비중_특화지수.csv')
parser.add_argument('--brands', type=Path, default=ROOT/'data'/'expanded_brand_counts.csv')
args = parser.parse_args()

d = pd.read_csv(args.input)
brand_counts = pd.read_csv(args.brands)
d = d.drop(columns=['지정브랜드_매장수','스타벅스','올리브영']).merge(brand_counts,on=['SIDO_NM','CCG_NM'],validate='one_to_one')
n = len(d)
age_cols = ['20대_이하_비중','20대_비중','30대_비중','40대_비중','50대_비중','60대_이상_비중']
count_cols = ['자료내_산수','자료내_해수욕장수','지정브랜드_매장수']
heritage = json.loads((ROOT/'data'/'heritage_regions.json').read_text())
heritage_by_region = {}
for prop in heritage['properties']:
    for key in map(tuple, prop['regions']):
        heritage_by_region.setdefault(key, []).append(prop['name'])

base_keys = list(zip(d.SIDO_NM, d.CCG_NM))
unknown_heritage = set(heritage_by_region).difference(base_keys)
assert not unknown_heritage, f'Unknown heritage regions: {unknown_heritage}'
heritage_flag = np.array([int(key in heritage_by_region) for key in base_keys], dtype=float)
raw = np.c_[d[age_cols+count_cols].to_numpy(float), heritage_flag]
assert n == 228 and np.allclose(raw[:,:6].sum(1), 1)

logged = raw.copy()
logged[:,6:9] = np.log1p(logged[:,6:9])
z = StandardScaler().fit_transform(logged)
# Each selected feature group contributes unit total variance.
weights = np.array([1/np.sqrt(6)]*6 + [1/np.sqrt(2)]*2 + [1.,1.])
z *= weights
percentiles = np.stack([(rankdata(raw[:,j],method='average')-1)/(n-1)*100 for j in range(10)], axis=1)

def target_key(sido, ccg):
    if sido == '인천광역시' and ccg in {'중구','동구'}:
        return sido, '중구·동구권'
    if '시 ' in ccg:
        return sido, ccg.split(' ',1)[0]
    return sido, ccg

profile = pd.read_csv(args.profile)
industry = pd.read_csv(args.industry)
profile['target'] = [target_key(s,g) for s,g in zip(profile.SIDO_NM,profile.CCG_NM)]
industry['target'] = [target_key(s,g) for s,g in zip(industry.SIDO_NM,industry.CCG_NM)]

consumer = {}
for key, sub in profile.groupby('target'):
    amt = sub.AMT.sum(); cnt = sub.CNT.sum()
    q1 = sub['1분기일평균금액원'].sum(); q2 = sub['2분기일평균금액원'].sum()
    consumer[key] = {
        'ticket': round(float(amt/cnt)),
        'foreignPct': round(float((sub.AMT*sub['외국인금액비중pct']/100).sum()/amt*100),2),
        'corporatePct': round(float((sub.AMT*sub['법인금액비중pct']/100).sum()/amt*100),2),
        'trendPct': round(float((q2/q1-1)*100),2),
    }
industry_agg = industry.groupby(['target','업종'],as_index=False)[['AMT','CNT']].sum()
industry_agg['share'] = industry_agg.AMT/industry_agg.groupby('target').AMT.transform('sum')*100
sector_names = sorted(industry_agg['업종'].unique())
for key, sub in industry_agg.groupby('target'):
    shares = sub.set_index('업종').share.reindex(sector_names,fill_value=0)
    top = shares.sort_values(ascending=False).head(3)
    consumer[key]['sectors'] = [round(float(v),3) for v in shares]
    consumer[key]['top'] = [{'name':name,'share':round(float(value),1)} for name,value in top.items()]
assert set(base_keys) == set(consumer), f'Consumption key mismatch: {set(base_keys)^set(consumer)}'

regions = []
for i,r in d.iterrows():
    key = (r.SIDO_NM,r.CCG_NM)
    regions.append({
        'id':i,'province':r.SIDO_NM,'name':r.CCG_NM,'population':int(r.인구합계),
        'raw':raw[i].round(7).tolist(),'percentiles':percentiles[i].round(2).tolist(),
        'starbucks':int(r.스타벅스),'oliveyoung':int(r.올리브영),'cinema':int(r.영화관),'mcdonalds':int(r.맥도날드),
        'heritageNames':heritage_by_region.get(key,[]),'consumption':consumer[key]
    })

groups = {1:list(range(6)),2:[6,7],4:[8],8:[9]}
models = {}
for mask in range(1,16):
    active = sum((dims for bit,dims in groups.items() if mask&bit),[])
    X = z[:,active]
    k_values = [2] if mask == 8 else list(range(2,11))
    rows=[]; labels_by_k={}
    for k in k_values:
        model=KMeans(n_clusters=k,n_init=50,random_state=20260915).fit(X)
        labels=model.labels_; sizes=np.bincount(labels); stability=[]; rng=np.random.default_rng(20260915)
        for seed in range(15):
            ix=rng.choice(n,int(.8*n),replace=False)
            scaler=StandardScaler().fit(logged[ix]); zz=scaler.transform(logged)*weights
            alt=KMeans(n_clusters=k,n_init=20,random_state=seed).fit(zz[ix][:,active])
            stability.append(adjusted_rand_score(labels,alt.predict(zz[:,active])))
        rows.append({'k':k,'silhouette':round(float(silhouette_score(X,labels)),4),'stability':round(float(np.mean(stability)),4),'minSize':int(sizes.min()),'sizes':sizes.tolist()})
        labels_by_k[str(k)]=labels.tolist()
    if mask == 8:
        selected=2; relaxed=False
    else:
        candidates=[r for r in rows if r['k']>=3 and r['minSize']>=8 and r['stability']>=.8]
        relaxed=not bool(candidates); candidates=candidates or [r for r in rows if r['k']>=3]
        best=max(r['silhouette'] for r in candidates)
        selected=min((r for r in candidates if r['silhouette']>=best-.02),key=lambda r:r['k'])['k']
    pca=PCA(n_components=min(2,len(active))).fit(X); xy=pca.transform(X)
    if xy.shape[1]==1: xy=np.c_[xy,np.zeros(n)]
    models[str(mask)]={'recommendedK':selected,'relaxed':relaxed,'evaluations':rows,'labels':labels_by_k,'projection':xy.round(5).tolist(),'explained':round(float(pca.explained_variance_ratio_.sum()),4)}
    print('mask',mask,'K',selected,flush=True)

# Consumption is held out of similarity; evaluate it only after neighbors are selected.
X=z
sector=np.array([r['consumption']['sectors'] for r in regions])/100
near_means=[]; other_means=[]
for i in range(n):
    dist=np.sqrt(((X-X[i])**2).sum(1)/4); order=np.argsort(dist); top=order[order!=i][:10]; rest=order[order!=i][10:]
    cdist=np.sqrt(((sector-sector[i])**2).sum(1))*100
    near_means.append(cdist[top].mean()); other_means.append(cdist[rest].mean())
stat=wilcoxon(np.array(near_means),np.array(other_means),alternative='less')
validation={
    'metric':'11개 업종 금액비중 벡터의 유클리드 거리(퍼센트포인트)',
    'top10Mean':round(float(np.mean(near_means)),2),
    'otherMean':round(float(np.mean(other_means)),2),
    'reductionPct':round(float((1-np.mean(near_means)/np.mean(other_means))*100),1),
    'wilcoxonP':float(stat.pvalue)
}

payload={'regions':regions,'vectors':z.round(8).tolist(),'models':models,'sectorNames':sector_names,
 'meta':{'n':n,'updated':'2026-09-18','agePeriod':'2026년 6월','consumptionPeriod':'2026년 1~6월',
 'beachPeriod':'2025년 목록','brandPeriod':'2026년 6월 파일','mountainPeriod':'2026-09-10 목록',
 'heritageCount':len(heritage['properties']),'heritageSource':heritage['source'],'seed':20260915,
 'stabilityRepeats':15,'consumptionValidation':validation}}
(ROOT/'dist'/'data.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')))
print('consumption validation',validation)
