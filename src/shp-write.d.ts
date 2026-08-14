declare module "@mapbox/shp-write" {
  import type { FeatureCollection } from "geojson";
  export function zip(data: FeatureCollection, options?: { folder?: string; outputType?: "blob" | "arraybuffer" | "uint8array"; compression?: "STORE" | "DEFLATE"; types?: Record<string, string>; prj?: string }): Promise<Blob>;
}
