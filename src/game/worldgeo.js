// 세계 지도 찍기: 밀러 도법 (세계 지도에서 흔히 보는 모양). 그림 좌표 0~1000 × 0~WORLD_H
// 위도 84°N ~ 57°S 만 그림 (남극 빼고). 거리는 경위도로 되돌려 하버사인으로 재서 도법과 상관없음
export const WORLD_W = 1000
const LAT_TOP = 84
const LAT_BOT = -57
const S = WORLD_W / (2 * Math.PI)
const rad = (d) => (d * Math.PI) / 180
const miller = (lat) => 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * rad(lat)))
const Y_TOP = miller(LAT_TOP)
export const WORLD_H = Math.round((Y_TOP - miller(LAT_BOT)) * S)
export const WORLD_LAT = [LAT_BOT, LAT_TOP]
export const toWorldXY = (lat, lon) => [((lon + 180) / 360) * WORLD_W, (Y_TOP - miller(Math.max(LAT_BOT - 3, Math.min(LAT_TOP + 3, lat)))) * S]
export function worldToLatLon(x, y) {
  const m = Y_TOP - y / S
  const lat = (2.5 * (Math.atan(Math.exp(m / 1.25)) - Math.PI / 4) * 180) / Math.PI
  return [lat, (x / WORLD_W) * 360 - 180]
}
