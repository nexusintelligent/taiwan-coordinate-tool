import KML from "ol/format/KML";
import GeoJSON from "ol/format/GeoJSON";
import type { FeatureCollection } from "geojson";
import { combine, parseDbf, parseShp, parseZip } from "shpjs";

export interface ImportedDataset { name: string; geojson: string; warnings: string[]; }
const geojsonFormat = new GeoJSON();
const kmlFormat = new KML({ extractStyles: false });
const stem = (name: string) => name.replace(/\.[^.]+$/, "");
const extension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

function collections(value: FeatureCollection | FeatureCollection[]): FeatureCollection[] {
  return Array.isArray(value) ? value : [value];
}

async function readZip(file: File): Promise<ImportedDataset[]> {
  const parsed = await parseZip(await file.arrayBuffer());
  return collections(parsed).map((collection, index) => ({
    name: String((collection as FeatureCollection & { fileName?: string }).fileName || (collections(parsed).length > 1 ? `${stem(file.name)} ${index + 1}` : stem(file.name))),
    geojson: JSON.stringify(collection), warnings: [],
  }));
}

async function readLooseShape(files: File[]): Promise<ImportedDataset> {
  const byExtension = new Map(files.map((file) => [extension(file.name), file]));
  const shp = byExtension.get("shp");
  if (!shp) throw new Error("Shapefile 缺少 .shp 幾何檔。");
  const dbf = byExtension.get("dbf");
  const prj = byExtension.get("prj");
  const cpg = byExtension.get("cpg");
  const warnings: string[] = [];
  if (!dbf) warnings.push("缺少 .dbf，僅匯入幾何，沒有屬性欄位。");
  let projection = prj ? await prj.text() : "";
  if (!projection) {
    const choice = prompt("Shapefile 缺少 .prj。請輸入資料座標系統：4326（WGS84）或 3826（TWD97 TM2 121）", "3826");
    if (choice === "3826") projection = "+proj=tmerc +lat_0=0 +lon_0=121 +k=0.9999 +x_0=250000 +y_0=0 +ellps=GRS80 +units=m +no_defs";
    else if (choice !== "4326") throw new Error("未指定可辨識的座標系統，已取消匯入。");
    warnings.push(`原檔缺少 .prj，本次依 EPSG:${choice} 解析。`);
  }
  const geometries = parseShp(await shp.arrayBuffer(), projection || undefined);
  const properties = dbf ? parseDbf(await dbf.arrayBuffer(), cpg ? (await cpg.text()).trim() : "utf-8") : geometries.map(() => ({}));
  return { name: stem(shp.name), geojson: JSON.stringify(combine([geometries, properties])), warnings };
}

export async function readSpatialFiles(input: FileList | File[]): Promise<ImportedDataset[]> {
  const files = Array.from(input); if (!files.length) return [];
  const results: ImportedDataset[] = [];
  const looseShapes = new Map<string, File[]>();
  for (const file of files) {
    const ext = extension(file.name); const base = stem(file.name).toLowerCase();
    if (["shp", "shx", "dbf", "prj", "cpg"].includes(ext)) { looseShapes.set(base, [...(looseShapes.get(base) ?? []), file]); continue; }
    if (ext === "zip") { try { results.push(...await readZip(file)); } catch { throw new Error(`${file.name} 不是有效的 ZIP Shapefile；請確認壓縮檔內含同名 .shp、.shx、.dbf，且不是把 7z／RAR 改副檔名為 ZIP。`); } continue; }
    if (["7z", "rar"].includes(ext)) throw new Error(`${file.name} 使用 ${ext.toUpperCase()} 壓縮。瀏覽器離線版目前無法可靠解壓此格式，請先解壓後一次拖入 .shp/.shx/.dbf/.prj，或重新壓縮為標準 ZIP。`);
    if (ext === "kmz") throw new Error(`${file.name} 是 KMZ；請先在 QGIS 或 Google Earth 另存為 KML 後匯入。`);
    if (ext === "kml") {
      const features = kmlFormat.readFeatures(await file.text(), { dataProjection: "EPSG:4326", featureProjection: "EPSG:4326" });
      results.push({ name: stem(file.name), geojson: geojsonFormat.writeFeatures(features, { dataProjection: "EPSG:4326", featureProjection: "EPSG:4326" }), warnings: [] }); continue;
    }
    if (["geojson", "json"].includes(ext)) { const text = await file.text(); JSON.parse(text); results.push({ name: stem(file.name), geojson: text, warnings: [] }); continue; }
    throw new Error(`不支援 ${file.name}；請使用 GeoJSON、KML、標準 ZIP 或散檔 Shapefile。`);
  }
  for (const shapeFiles of looseShapes.values()) results.push(await readLooseShape(shapeFiles));
  return results;
}
