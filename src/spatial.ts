import turfBuffer from "@turf/buffer";
import turfUnion from "@turf/union";
import turfIntersect from "@turf/intersect";
import turfDifference from "@turf/difference";
import { featureCollection } from "@turf/helpers";
import type { Feature, GeoJsonProperties, Geometry, Polygon, MultiPolygon } from "geojson";

export type BooleanOperation = "union" | "intersect" | "difference";
export type PolygonFeature = Feature<Polygon | MultiPolygon, GeoJsonProperties>;

export function bufferGeometry(feature: Feature<Geometry, GeoJsonProperties>, distanceMeters: number): PolygonFeature {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) throw new Error("環域距離必須大於 0 公尺。");
  const result = turfBuffer(feature, distanceMeters, { units: "meters", steps: 32 });
  if (!result) throw new Error("無法建立環域，請檢查圖徵幾何。");
  return result as PolygonFeature;
}

export function booleanGeometry(features: Feature<Geometry, GeoJsonProperties>[], operation: BooleanOperation): PolygonFeature {
  if (features.length < 2) throw new Error("布林運算至少需要選取 2 個面圖徵。");
  const polygons = features.filter((feature): feature is PolygonFeature => feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon");
  if (polygons.length !== features.length) throw new Error("聯集、交集與差集目前只支援面圖徵。");
  const collection = featureCollection<Polygon | MultiPolygon>(polygons);
  const result = operation === "union" ? turfUnion(collection) : operation === "intersect" ? turfIntersect(collection) : turfDifference(collection);
  if (!result) throw new Error(operation === "intersect" ? "選取圖徵沒有重疊範圍。" : "運算沒有產生有效幾何。");
  return result as PolygonFeature;
}

export function polygonQueryValue(feature: PolygonFeature): string {
  const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const bodies = polygons.map((polygon) => `(${polygon.map((ring) => `(${ring.map(([lon, lat]) => `${lon.toFixed(7)} ${lat.toFixed(7)}`).join(",")})`).join(",")})`);
  return `(${bodies.join(",")})`;
}
