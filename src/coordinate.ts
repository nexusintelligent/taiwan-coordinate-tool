import proj4 from "proj4";

export const WGS84 = "EPSG:4326";
export const TWD97_121 = "EPSG:3826";

proj4.defs(
  TWD97_121,
  "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs",
);

export interface CoordinatePair {
  first: number;
  second: number;
  label?: string;
  sourceText?: string;
}

export interface ConvertedCoordinate {
  latitude: number;
  longitude: number;
  x: number;
  y: number;
  label: string;
  sourceText?: string;
}

export type CoordinateSystem = "auto" | "wgs84-latlon" | "wgs84-lonlat" | "twd97";

export function looksLikeTaiwanWgs84(first: number, second: number): boolean {
  return first >= 20 && first <= 27 && second >= 118 && second <= 123;
}

export function looksLikeTaiwanLonLat(first: number, second: number): boolean {
  return first >= 118 && first <= 123 && second >= 20 && second <= 27;
}

export function looksLikeTwd97(first: number, second: number): boolean {
  return first >= 10000 && first <= 500000 && second >= 2200000 && second <= 3100000;
}

export function detectSystem(pair: CoordinatePair): Exclude<CoordinateSystem, "auto"> | null {
  if (looksLikeTaiwanWgs84(pair.first, pair.second)) return "wgs84-latlon";
  if (looksLikeTaiwanLonLat(pair.first, pair.second)) return "wgs84-lonlat";
  if (looksLikeTwd97(pair.first, pair.second)) return "twd97";
  return null;
}

export function convertPair(
  pair: CoordinatePair,
  requestedSystem: CoordinateSystem = "auto",
  index = 0,
): ConvertedCoordinate {
  const system = requestedSystem === "auto" ? detectSystem(pair) : requestedSystem;
  if (!system) {
    throw new Error("數值不像臺灣地區的 WGS84 或 TWD97 座標");
  }

  let longitude: number;
  let latitude: number;
  let x: number;
  let y: number;

  if (system === "twd97") {
    [longitude, latitude] = proj4(TWD97_121, WGS84, [pair.first, pair.second]);
    x = pair.first;
    y = pair.second;
  } else {
    latitude = system === "wgs84-latlon" ? pair.first : pair.second;
    longitude = system === "wgs84-latlon" ? pair.second : pair.first;
    if (!looksLikeTaiwanWgs84(latitude, longitude)) {
      throw new Error("經緯度不在臺灣及周邊的合理範圍");
    }
    [x, y] = proj4(WGS84, TWD97_121, [longitude, latitude]);
  }

  return {
    latitude,
    longitude,
    x,
    y,
    label: pair.label || `點位 ${index + 1}`,
    sourceText: pair.sourceText,
  };
}
