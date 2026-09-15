"""Rebuild aggregate-only site data from the local regional analysis CSV."""
from pathlib import Path
import json,argparse
import numpy as np,pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score,adjusted_rand_score
from sklearn.decomposition import PCA
from scipy.stats import rankdata
parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,default=Path(__file__).resolve().parent.parent/'연령_산_바다_브랜드_군집분석'/'지역별_원시피처.csv');args=parser.parse_args()
d=pd.read_csv(args.input);n=len(d)
ac=['20대_이하_비중','20대_비중','30대_비중','40대_비중','50대_비중','60대_이상_비중'];cc=['자료내_산수','자료내_해수욕장수','지정브랜드_매장수']
raw=d[ac+cc].to_numpy(float);assert n==228 and np.allclose(raw[:,:6].sum(1),1)
logged=raw.copy();logged[:,6:]=np.log1p(logged[:,6:]);z=StandardScaler().fit_transform(logged)
weights=np.array([1/np.sqrt(6)]*6+[1/np.sqrt(2)]*2+[1.]);z*=weights
percentiles=np.stack([(rankdata(raw[:,j],method='average')-1)/(n-1)*100 for j in range(9)],axis=1)
regions=[]
for i,r in d.iterrows():regions.append({'id':i,'province':r.SIDO_NM,'name':r.CCG_NM,'population':int(r.인구합계),'raw':raw[i].round(7).tolist(),'percentiles':percentiles[i].round(2).tolist(),'starbucks':int(r.스타벅스),'oliveyoung':int(r.올리브영)})
models={}
for mask in range(1,8):
    active=([*range(6)] if mask&1 else [])+([6,7] if mask&2 else [])+([8] if mask&4 else [])
    X=z[:,active];rows=[];lab={}
    for k in range(2,11):
        m=KMeans(n_clusters=k,n_init=50,random_state=20260915).fit(X)
        labels=m.labels_;sizes=np.bincount(labels);stability=[];rng=np.random.default_rng(20260915)
        for seed in range(15):
            ix=rng.choice(n,int(.8*n),replace=False)
            scaler=StandardScaler().fit(logged[ix]);zz=scaler.transform(logged)*weights
            alt=KMeans(n_clusters=k,n_init=20,random_state=seed).fit(zz[ix][:,active])
            stability.append(adjusted_rand_score(labels,alt.predict(zz[:,active])))
        rows.append({'k':k,'silhouette':round(float(silhouette_score(X,labels)),4),'stability':round(float(np.mean(stability)),4),'minSize':int(sizes.min()),'sizes':sizes.tolist()});lab[str(k)]=labels.tolist()
    candidates=[r for r in rows if r['k']>=3 and r['minSize']>=8 and r['stability']>=.8]
    relaxed=not bool(candidates);candidates=candidates or [r for r in rows if r['k']>=3]
    best=max(r['silhouette'] for r in candidates)
    selected=min((r for r in candidates if r['silhouette']>=best-.02),key=lambda r:r['k'])['k']
    pca=PCA(n_components=min(2,len(active))).fit(X);xy=pca.transform(X)
    if xy.shape[1]==1:xy=np.c_[xy,np.zeros(n)]
    models[str(mask)]={'recommendedK':selected,'relaxed':relaxed,'evaluations':rows,'labels':lab,'projection':xy.round(5).tolist(),'explained':round(float(pca.explained_variance_ratio_.sum()),4)}
    print(mask,selected,rows,flush=True)
payload={'regions':regions,'vectors':z.round(8).tolist(),'models':models,'meta':{'n':n,'updated':'2026-09-15','agePeriod':'2026년 6월','beachPeriod':'2025년 목록','brandPeriod':'2026년 6월 파일','mountainPeriod':'2026-09-10 목록','seed':20260915,'stabilityRepeats':15}}
out=Path(__file__).resolve().parent/'dist'/'data.json';out.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')))
