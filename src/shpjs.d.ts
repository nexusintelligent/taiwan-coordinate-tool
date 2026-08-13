declare module "shpjs" {
  import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";
  export function parseZip(data: ArrayBuffer): Promise<FeatureCollection | FeatureCollection[]>;
  export function parseShp(data: ArrayBuffer, projection?: string): Geometry[];
  export function parseDbf(data: ArrayBuffer, encoding?: string): GeoJsonProperties[];
  export function combine(parts: [Geometry[], GeoJsonProperties[]]): FeatureCollection;
}
