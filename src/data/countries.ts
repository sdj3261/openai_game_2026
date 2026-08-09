import type { CountryProfile } from '../types'

export const COUNTRIES: CountryProfile[] = [
  { id: 'KOR', nameKo: '대한민국', nameEn: 'South Korea', flag: 'KR', lat: 36.5, lon: 127.8, biome: 'temperate', vulnerability: 47, baseHeatDays: 14, coastalExposure: 45, population2026: 51.7, signatureRisk: '도시 열섬과 집중호우', opportunity: '고밀도 전력망과 대중교통 전환' },
  { id: 'JPN', nameKo: '일본', nameEn: 'Japan', flag: 'JP', lat: 36.2, lon: 138.2, biome: 'coastal', vulnerability: 49, baseHeatDays: 16, coastalExposure: 67, population2026: 123, signatureRisk: '연안 침수와 고령층 폭염', opportunity: '분산형 도시 회복력' },
  { id: 'USA', nameKo: '미국', nameEn: 'United States', flag: 'US', lat: 39.5, lon: -98.4, biome: 'temperate', vulnerability: 43, baseHeatDays: 18, coastalExposure: 42, population2026: 347, signatureRisk: '산불·허리케인·물 격차', opportunity: '청정기술 확산과 대규모 전력망' },
  { id: 'BRA', nameKo: '브라질', nameEn: 'Brazil', flag: 'BR', lat: -10.3, lon: -53.2, biome: 'tropical', vulnerability: 61, baseHeatDays: 32, coastalExposure: 35, population2026: 213, signatureRisk: '아마존 건조화와 산불', opportunity: '열대림·생물다양성 회복' },
  { id: 'IND', nameKo: '인도', nameEn: 'India', flag: 'IN', lat: 22.9, lon: 79.0, biome: 'arid', vulnerability: 72, baseHeatDays: 44, coastalExposure: 52, population2026: 1460, signatureRisk: '습구온도와 몬순 변동', opportunity: '분산 태양광과 냉방 정의' },
  { id: 'NLD', nameKo: '네덜란드', nameEn: 'Netherlands', flag: 'NL', lat: 52.1, lon: 5.3, biome: 'coastal', vulnerability: 38, baseHeatDays: 8, coastalExposure: 92, population2026: 18.2, signatureRisk: '해수면 상승과 하천 범람', opportunity: '물과 함께 사는 도시 설계' },
  { id: 'EGY', nameKo: '이집트', nameEn: 'Egypt', flag: 'EG', lat: 26.8, lon: 30.8, biome: 'arid', vulnerability: 75, baseHeatDays: 55, coastalExposure: 57, population2026: 118, signatureRisk: '나일 수자원과 극한 폭염', opportunity: '태양에너지와 물 재이용' },
  { id: 'AUS', nameKo: '호주', nameEn: 'Australia', flag: 'AU', lat: -25.3, lon: 133.8, biome: 'arid', vulnerability: 58, baseHeatDays: 36, coastalExposure: 31, population2026: 27.5, signatureRisk: '대형 산불과 산호 백화', opportunity: '재생에너지 수출과 토착지식' },
  { id: 'IDN', nameKo: '인도네시아', nameEn: 'Indonesia', flag: 'ID', lat: -2.3, lon: 117.3, biome: 'tropical', vulnerability: 76, baseHeatDays: 39, coastalExposure: 84, population2026: 286, signatureRisk: '해수면 상승과 산림 손실', opportunity: '맹그로브와 섬 전력망' },
  { id: 'KEN', nameKo: '케냐', nameEn: 'Kenya', flag: 'KE', lat: 0.2, lon: 37.9, biome: 'arid', vulnerability: 69, baseHeatDays: 31, coastalExposure: 22, population2026: 58, signatureRisk: '가뭄과 식량 가격 변동', opportunity: '지열·분산망·회복농업' },
  { id: 'DEU', nameKo: '독일', nameEn: 'Germany', flag: 'DE', lat: 51.1, lon: 10.4, biome: 'temperate', vulnerability: 34, baseHeatDays: 7, coastalExposure: 19, population2026: 84, signatureRisk: '하천 범람과 산업 전환', opportunity: '순환 제조와 유럽 전력망' },
  { id: 'CAN', nameKo: '캐나다', nameEn: 'Canada', flag: 'CA', lat: 56.1, lon: -106.3, biome: 'arctic', vulnerability: 45, baseHeatDays: 5, coastalExposure: 34, population2026: 41, signatureRisk: '북극 증폭과 산불 연기', opportunity: '광대한 탄소 흡수원 보호' },
]
