# 에셋 출처와 Vision 검수

## 제작 원칙

- 실제 지리·기후를 표현하는 래스터는 공식 과학기관 또는 명확한 공공 데이터만 사용한다.
- Imagegen은 실제 지리로 오인될 수 없는 비지도형 궤도 배경에만 사용한다.
- Vision은 생성물 단독이 아니라 React HUD와 Babylon.js가 합성된 **실제 브라우저 화면**을 판단한다.
- 정책 아이콘, 상태 마커, 수치와 그래프는 해상도 독립성과 작은 용량을 위해 SVG/CSS/3D 객체로 유지한다.
- 프로젝트에 들어가는 래스터는 WebP로 변환하고 PNG 원본은 빌드에 포함하지 않는다.

## 프로젝트 에셋

| 최종 파일 | 용도 | 제작/최적화 |
|---|---|---|
| `public/assets/earth-blue-marble-nasa.webp` | 시작 화면 지구와 Babylon.js 3D 지구 코어 알베도 | NASA SVS의 2048×1024 PNG를 동일 해상도 RGB WebP quality 86으로 변환 |
| `public/assets/orbit-observation-bg.webp` | 시작·플레이·랭킹 화면의 절제된 우주 배경 | Imagegen으로 만든 비지리적 배경을 WebP로 최적화 |

## NASA Blue Marble 지구 텍스처

- NASA 공식 레코드: [Blue Marble - A Seamless Image Mosaic of the Earth (WMS), SVS ID 2915](https://svs.gsfc.nasa.gov/2915)
- 원본 URL: [bluemarble-2048.png](https://svs.gsfc.nasa.gov/vis/a000000/a002900/a002915/bluemarble-2048.png)
- 원본 규격: 2048×1024 PNG, 1,511,379 bytes
- 원본 SHA-256: `AE6214B078ED0864C96F74BCB10AE3021F6EB116F8059797EFE0FA9EA8B89D35`
- 최종 규격: 2048×1024 RGB WebP, quality 86, method 6, 192,302 bytes
- 최종 SHA-256: `A34235CF2D9017D9AB179419252C99D3AC66D3B0B7291DE8244880165913B409`
- 내려받은 날짜: 2026-08-10
- 크레딧: NASA/Goddard Space Flight Center Scientific Visualization Studio. Blue Marble Next Generation data courtesy of Reto Stockli (NASA/GSFC) and NASA Earth Observatory.

NASA는 해당 페이지에서 위 크레딧 문구를 요청한다. NASA 콘텐츠는 미국에서 일반적으로 저작권의 대상이 아니며 교육·정보·컴퓨터 시뮬레이션에 사용할 수 있지만, NASA의 보증을 암시해서는 안 되고 출처를 밝혀야 한다. 자세한 조건은 [NASA Images and Media Usage Guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/)를 따른다.

## 제거한 생성형 지리 에셋

- `earth-game-albedo-v2.webp`: 생성형 대륙 형상이 실제 지리보다 먼저 보이므로 NASA 텍스처로 대체하고 빌드에서 제거했다.
- `earth-surface-tile.webp`: 반복 균열과 중앙 얼룩이 국가 디오라마를 인공적으로 보이게 해 제거했다. `CountryDiorama`는 biome별 중립 재질과 조명만 사용한다.
- `gaia-key-art.webp`: 생성형 지구가 NASA 기반 실제 지리와 경쟁해 보일 수 있어 현행 UI 참조와 `public/assets`에서 제거했다. 시작 화면은 NASA Blue Marble와 비지리적 궤도 배경만 사용한다.
- `earth-hero-nasa.webp` 후보: SVS의 `bluemarble-east-4096.png`는 원형 full-disk가 아닌 180°×180° WMS 지도이므로 hero로 오인하지 않도록 프로젝트에 포함하지 않았다.

## Vision 반복 기록

### 1차: 라이브 배포 기준선

- 시작 화면 키아트와 제목 계층은 명확했다.
- 실제 플레이 화면의 3D 지구는 강한 청록 블룸 때문에 단색 구체처럼 보였다.
- 대륙, 셀 상태와 정책 결과가 중심 시선에서 충분히 읽히지 않았다.

### 2차: 생성형 알베도 실험과 기각

- 생성형 2:1 알베도에서 대륙과 육각 지형 정보는 추가됐지만 실제 지리보다 가짜 지형이 먼저 읽혔고 보이는 반구도 지나치게 어두웠다.
- 원인은 카메라가 바라보는 반구 반대 방향의 주광과 어두운 코어 재질이었다.

### 3차: 실제 플레이 재검수

- 주광 방향, 코어 자발광, 대기 두께, 블룸 제외 대상을 조정했다.
- 2026 화면에서 아시아·아프리카, 해양, 사막, 산악과 위험 지역이 구분됐다.
- `태양 도시`와 `이주 도시 협약`, 사건 대응을 선택해 2031년으로 진행했다.
- 결과 화면에서 `10.8M` 이동, 성장 도시 `2`, 밝은 대표 이주 호와 정책 이후 수치 변화를 동시에 확인했다.

### 4차: 실제 지리 우선 재설계

- 생성형 대륙 알베도를 NASA의 2:1 equirectangular Blue Marble로 교체했다.
- 5,000개 불투명 입체 셀을 해양에서는 숨기고 육지 위의 작은 반투명 기후 점으로 축소했다.
- 도시는 상위 220개 신호만 가느다란 기둥으로 표시하고, 이주 튜브·이동 점·선택 마커를 축소하고 블룸을 제거했다.
- 대기권과 조명을 낮춰 대륙·해양·빙권이 시뮬레이션 오버레이보다 먼저 읽히게 했다.
- Babylon 구체의 `U = longitude / 360`과 NASA 래스터의 `U = (longitude + 180) / 360`을 맞춰 `uScale = 1`, `uOffset = 0.5`로 국가 마커와 지리를 정합했다.
- 실제 브라우저에서 기본 WebGPU와 `?renderer=webgl` WebGL2 QA 경로를 모두 렌더링해 빈 장면과 셰이더 오류가 없음을 확인했다.

### 5차: 실제 게임 UI·반응형 Vision 검수

- 1280×720에서 정책 280px, 국가 전망 300px 안팎의 운영실 레이아웃과 더 큰 중앙 지구가 동시에 읽히는지 확인했다.
- 첫 턴 가이드를 압축된 단계 레일로 만들고, 정책 설명·효과·사건·진행 CTA를 11–13px 중심으로 올려 첫 선택의 시선 경로를 분리했다.
- Windows에서 국기 이모지가 `KR` 문자로 보이는 경우를 오류처럼 숨기지 않고 의도적인 ISO 배지로 정리했다.
- 390px과 430px 모바일에서 `지구 → 정책 → 사건/진행 → 국가 정보` 순서, 상단 핵심 지표, 세로 터치 스크롤, 결과 배너와 safe-area를 확인했다.
- 데스크톱 랭킹 제목의 단어 중간 분리를 수정하고 모바일 랭킹의 열 축약과 제목 가독성을 재확인했다.

## 웹 용량 판단

NASA 원본 1,511,379 bytes를 동일한 2048×1024 해상도의 192,302-byte WebP로 줄여 약 87%를 절감했다. PBF는 벡터 지도 경계/타일 전송용이므로 현재의 로컬 TypedArray 지구와 래스터 알베도에는 사용하지 않는다. 향후 실제 행정경계 줌 레벨이나 스트리밍 지도 데이터를 도입할 때 별도 검토한다.
