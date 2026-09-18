"""Aggregate four urban-brand signals from the same 2026-06 commercial-area files."""
from pathlib import Path
import argparse, unicodedata
import numpy as np
import pandas as pd

N = lambda value: unicodedata.normalize('NFC', str(value)).strip()
ROOT = Path(__file__).resolve().parents[1]
PARENT = ROOT.parent
DEFAULT_DATA = next(
    path for path in Path('/Users/choiminseok/Desktop/MinseokChoi').iterdir()
    if N(path.name) == 'AI금융빅데이터플랫폼 소비데이터 활용 아이디어'
) / 'data'

parser = argparse.ArgumentParser()
parser.add_argument('--data-dir', type=Path, default=DEFAULT_DATA)
parser.add_argument('--features', type=Path, default=PARENT/'연령_산_바다_브랜드_군집분석'/'지역별_원시피처.csv')
args = parser.parse_args()

base = pd.read_csv(args.features)
keys = ['SIDO_NM','CCG_NM']
regions = set(map(tuple, base[keys].to_numpy()))
aliases = {
    '서울특별시':'서울특별시','부산광역시':'부산광역시','대구광역시':'대구광역시',
    '인천광역시':'인천광역시','광주광역시':'광주광역시','대전광역시':'대전광역시',
    '울산광역시':'울산광역시','세종특별자치시':'세종특별자치시','경기도':'경기도',
    '강원도':'강원특별자치도','강원특별자치도':'강원특별자치도','충청북도':'충청북도',
    '충청남도':'충청남도','전라북도':'전북특별자치도','전북특별자치도':'전북특별자치도',
    '전라남도':'전라남도','경상북도':'경상북도','경상남도':'경상남도','제주특별자치도':'제주특별자치도'
}

files = [path for path in args.data_dir.rglob('*.csv') if '상가(상권)' in N(path.name)]
assert len(files) == 16, f'Expected 16 commercial files, found {len(files)}'
columns = ['상가업소번호','상호명','지점명','시도명','시군구명','상권업종소분류명','도로명주소']
matched = []
for file in files:
    for chunk in pd.read_csv(file,usecols=columns,dtype=str,chunksize=100000):
        names = chunk.상호명.fillna('').str.normalize('NFKC').str.lower().str.replace(r'[^가-힣a-z0-9]','',regex=True)
        mcd = names.str.contains('맥도날드|mcdonald',regex=True) & ~names.str.contains('맥도날드빌딩|모트맥도날드',regex=True)
        cinema = (
            names.str.match(r'^(cgv|씨지브이)') |
            ((names.str.startswith('롯데컬처웍스') | names.str.startswith('롯데시네마')) & names.str.contains('롯데시네마')) |
            names.eq('메가박스')
        ) & ~names.str.contains('씨지브이아이앤씨',regex=False)
        selected = chunk.loc[mcd|cinema].copy()
        selected['브랜드'] = np.where(mcd[mcd|cinema],'맥도날드','영화관')
        matched.append(selected)

stores = pd.concat(matched,ignore_index=True).drop_duplicates('상가업소번호')
stores['SIDO_NM'] = stores.시도명.map(lambda value: aliases.get(N(value),N(value)))
stores['CCG_NM'] = stores.시군구명.map(N).str.split().str[0]
integrated = stores.SIDO_NM.eq('전남광주통합특별시')
stores.loc[integrated,'SIDO_NM'] = np.where(stores.loc[integrated,'CCG_NM'].isin(['동구','서구','남구','북구','광산구']),'광주광역시','전라남도')
incheon = stores.SIDO_NM.eq('인천광역시')
stores.loc[incheon,'CCG_NM'] = stores.loc[incheon,'CCG_NM'].replace({'중구':'중구·동구권','동구':'중구·동구권','제물포구':'중구·동구권','영종구':'중구·동구권','서해구':'서구','검단구':'서구'})
stores.loc[stores.SIDO_NM.eq('세종특별자치시'),'CCG_NM'] = base.loc[base.SIDO_NM.eq('세종특별자치시'),'CCG_NM'].iloc[0]
unknown = stores.loc[~stores[keys].apply(tuple,axis=1).isin(regions)]
assert unknown.empty, unknown[keys].drop_duplicates().to_dict('records')

counts = stores.groupby(keys+['브랜드']).size().unstack(fill_value=0).reset_index()
output = base[keys+['스타벅스','올리브영']].merge(counts,on=keys,how='left')
for column in ['영화관','맥도날드']:
    output[column] = output[column].fillna(0).astype(int)
output['지정브랜드_매장수'] = output[['스타벅스','올리브영','영화관','맥도날드']].sum(axis=1)
output.to_csv(ROOT/'data'/'expanded_brand_counts.csv',index=False,encoding='utf-8-sig')
print(output[['스타벅스','올리브영','영화관','맥도날드','지정브랜드_매장수']].sum().to_string())
print('영화관은 CGV·롯데시네마·메가박스 상호 식별 기록이며 맥도날드는 본사·빌딩 오탐을 제외한 상호 식별 기록입니다.')
