declare module "@mapbox/shp-write" {
  import type { FeatureCollection } from "geojson";
  export function zip(data: FeatureCollection, options?: { folder?: string; types?: Record<string, string> }): ArrayBuffer;
}
