// Map registry (§13.2 오픈월드, §13.3 테스트 그라운드): every map is generated from code with a fixed seed.
import type { Localized } from '../../ui/i18n';
import type { MapData } from '../builder';
import type { MapAssets } from '../dem';
import { buildHanbit } from './hanbit';
import { buildProving } from './proving';
import { buildSeorak, SEORAK_DEM, SEORAK_OSM, SEORAK_ROADS } from './seorak';

export interface MapInfo {
  id: string;
  label: Localized;
  desc: Localized;
  areaKm2: number;
  kind: 'open' | 'test';
  /** Start points offered by the map selection (POI ids of the built map). */
  spawns: Array<{ id: string; label: Localized }>;
  /** Data to load before building (a real-terrain DEM: path relative to the page, without extension; precomputed
   *  road alignments: a JSON file). */
  assets?: { dem?: string; roads?: string; osm?: string };
  /** Attribution of external data the map is made from (shown with the map). */
  credit?: Localized;
  build(onStage?: (stage: string) => void, assets?: MapAssets): MapData;
}

export const MAPS: MapInfo[] = [
  {
    id: 'hanbit',
    label: { ko: '한빛시 (오픈월드)', en: 'Hanbit (open world)' },
    desc: { ko: '강이 가로지르는 대도시(지하차도·단지 내 방지턱), 고속도로와 IC, 터널, 산악 고갯길, 호수, 농촌 마을', en: 'River city (underpass, estate speed humps), expressway and interchange, tunnels, mountain pass, lake, farming town' },
    areaKm2: 36,
    kind: 'open',
    spawns: [
      { id: 'cityhall', label: { ko: '한빛시청 앞', en: 'City Hall' } },
      { id: 'expressway', label: { ko: '고속도로', en: 'Expressway' } },
      { id: 'bridge', label: { ko: '한빛대교', en: 'Hanbit Bridge' } },
      { id: 'oldtown', label: { ko: '구도심 언덕길', en: 'Old-town hill' } },
      { id: 'underpass', label: { ko: '누리지하차도', en: 'Nuri Underpass' } },
      { id: 'estate', label: { ko: '아파트 단지 (방지턱)', en: 'Apartment estate (humps)' } },
      { id: 'pass', label: { ko: '한빛재 고갯길', en: 'Hanbit Pass' } },
      { id: 'lake', label: { ko: '은빛호', en: 'Eunbit Lake' } },
      { id: 'town', label: { ko: '솔내읍', en: 'Sollae' } },
      { id: 'trail', label: { ko: '숲길 (비포장)', en: 'Forest trail' } },
    ],
    build: buildHanbit,
  },
  {
    id: 'seorak',
    label: { ko: '한계령 (실제 지형·도로)', en: 'Hangyeryeong (real terrain & roads)' },
    desc: { ko: '설악산 한계령 일대 8 × 8 km — 실제 표고(공개 DEM)와 실제 지도(오버추어/오픈스트리트맵): 44번 국도 설악로의 고갯길과 헤어핀, 필례로, 오색, 계곡의 개울', en: 'Hangyeryeong, Seoraksan, 8 × 8 km — real elevation (public DEM) and real map data (Overture / OpenStreetMap): Route 44 Seorak-ro over the pass and its hairpins, Pillye-ro, Osaek, the valley streams' },
    areaKm2: 64,
    kind: 'open',
    spawns: [
      { id: 'east', label: { ko: '오색 (양양 방향)', en: 'Osaek (east)' } },
      { id: 'hairpins', label: { ko: '헤어핀 구간', en: 'Hairpins' } },
      { id: 'summit', label: { ko: '한계령 정상', en: 'Pass summit' } },
      { id: 'pillye', label: { ko: '필례로', en: 'Pillye-ro' } },
      { id: 'west', label: { ko: '설악로 서쪽 (인제 방향)', en: 'Seorak-ro west' } },
    ],
    assets: { dem: SEORAK_DEM, roads: SEORAK_ROADS, osm: SEORAK_OSM },
    credit: { ko: '지형: Terrain Tiles (Mapzen, AWS Open Data; SRTM 등) · 지도: Overture Maps, © OpenStreetMap 기여자 (ODbL)', en: 'Terrain: Terrain Tiles (Mapzen, AWS Open Data; SRTM and others) · Map: Overture Maps, © OpenStreetMap contributors (ODbL)' },
    build: buildSeorak,
  },
  {
    id: 'proving',
    label: { ko: '종합 주행시험장', en: 'Proving ground' },
    desc: { ko: '고속 주회로(뱅크), 다이나믹 패드, 제동 시험로(µ-split), 핸들링 서킷, 경사로, 방지턱, 오프로드', en: 'Banked high-speed oval, dynamic pad, µ-split braking lanes, handling circuit, grades, bumps, off-road' },
    areaKm2: 25,
    kind: 'test',
    spawns: [
      { id: 'gate', label: { ko: '정문', en: 'Main gate' } },
      { id: 'oval', label: { ko: '고속 주회로', en: 'High-speed oval' } },
      { id: 'pad', label: { ko: '다이나믹 패드', en: 'Dynamic pad' } },
      { id: 'brake', label: { ko: '제동 시험로', en: 'Braking lanes' } },
      { id: 'handling', label: { ko: '핸들링 서킷', en: 'Handling circuit' } },
      { id: 'grades', label: { ko: '경사로', en: 'Grades' } },
      { id: 'street', label: { ko: '방지턱 시험로', en: 'Bump street' } },
      { id: 'offroad', label: { ko: '오프로드', en: 'Off-road' } },
    ],
    build: buildProving,
  },
];

export function mapInfo(id: string | null): MapInfo {
  return MAPS.find((m) => m.id === id) ?? MAPS[0];
}
