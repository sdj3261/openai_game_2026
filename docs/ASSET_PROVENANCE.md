# 에셋 출처와 Vision 검수

## 제작 원칙

- Imagegen은 키아트와 텍스처 같은 래스터 **소스 에셋 제작**에 사용한다.
- Vision은 생성물 단독이 아니라 React HUD와 Babylon.js가 합성된 **실제 브라우저 화면**을 판단한다.
- 정책 아이콘, 상태 마커, 수치와 그래프는 해상도 독립성과 작은 용량을 위해 SVG/CSS/3D 객체로 유지한다.
- 프로젝트에 들어가는 래스터는 WebP로 변환하고 PNG 원본은 빌드에 포함하지 않는다.

## 프로젝트 에셋

| 최종 파일 | 용도 | 제작/최적화 |
|---|---|---|
| `public/assets/gaia-key-art.webp` | 시작 화면 키아트 | Imagegen 원본을 WebP로 변환 |
| `public/assets/earth-surface-tile.webp` | 국가 복셀 디오라마 반복 지표면 | `seamless tileable`, `top-down orthogonal view`, `no shadows` 조건으로 생성 후 WebP 변환 |
| `public/assets/earth-game-albedo-v2.webp` | 3D 지구 코어 알베도 | Imagegen 원본을 2048×1024 WebP, quality 84로 변환 |

## 3D 지구 알베도 최종 프롬프트

```text
Use case: stylized-concept
Asset type: source albedo texture for a Babylon.js interactive 3D Earth globe
Input image: style and palette reference only; do not reproduce its spherical composition
Primary request: create a clean 2:1 equirectangular flat world-surface texture showing all continents in recognizable positions, with a premium strategy-game visual language that combines low-poly terrain, subtle hexagonal civilization cells, forests, deserts, snow and deep oceans
Scene/backdrop: full rectangular map coverage from edge to edge, longitude wraps seamlessly at left and right
Style/medium: sophisticated handcrafted AAA strategy-game albedo map, crisp miniature terrain, restrained detail, not photorealistic satellite imagery
Composition/framing: exact equirectangular world map projection, flat orthographic cartographic view, north at top, Antarctica along bottom, no globe, no perspective
Lighting/mood: neutral baked color only, no directional lighting, no highlights, no atmosphere, no shadows
Color palette: deep teal oceans; emerald and lime healthy biomes; ochre arid regions; limited charcoal and ember accents in stressed regions; balanced enough for dynamic heat overlays
Constraints: seamless horizontal wrap; flat albedo; no labels; no borders; no text; no UI; no routes; no markers; no clouds; no storms; no city icons; no watermark; no logos; no spherical shading; no cast shadows; no vignette
```

## Vision 반복 기록

### 1차: 라이브 배포 기준선

- 시작 화면 키아트와 제목 계층은 명확했다.
- 실제 플레이 화면의 3D 지구는 강한 청록 블룸 때문에 단색 구체처럼 보였다.
- 대륙, 셀 상태와 정책 결과가 중심 시선에서 충분히 읽히지 않았다.

### 2차: 알베도 최초 통합

- 대륙과 육각 지형 정보는 추가됐지만 보이는 반구가 지나치게 어두웠다.
- 원인은 카메라가 바라보는 반구 반대 방향의 주광과 어두운 코어 재질이었다.

### 3차: 실제 플레이 재검수

- 주광 방향, 코어 자발광, 대기 두께, 블룸 제외 대상을 조정했다.
- 2026 화면에서 아시아·아프리카, 해양, 사막, 산악과 위험 지역이 구분됐다.
- `태양 도시`와 `이주 도시 협약`, 사건 대응을 선택해 2031년으로 진행했다.
- 결과 화면에서 `10.8M` 이동, 성장 도시 `2`, 밝은 대표 이주 호와 정책 이후 수치 변화를 동시에 확인했다.

## 웹 용량 판단

`earth-game-albedo-v2.webp`는 2048×1024 RGB WebP, 414,840 bytes다. PBF는 벡터 지도 경계/타일 전송용이므로 현재의 로컬 TypedArray 지구와 래스터 알베도에는 사용하지 않는다. 향후 실제 행정경계 줌 레벨이나 스트리밍 지도 데이터를 도입할 때 별도 검토한다.
