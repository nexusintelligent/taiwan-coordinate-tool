import Map from "ol/Map";
import View from "ol/View";
import Overlay from "ol/Overlay";
import Feature from "ol/Feature";
import type { FeatureLike } from "ol/Feature";
import GeoJSON from "ol/format/GeoJSON";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import type Geometry from "ol/geom/Geometry";
import Draw from "ol/interaction/Draw";
import Modify from "ol/interaction/Modify";
import Select from "ol/interaction/Select";
import Snap from "ol/interaction/Snap";
import { singleClick, platformModifierKeyOnly } from "ol/events/condition";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat, toLonLat } from "ol/proj";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import { Circle, Fill, Stroke, Style, Text } from "ol/style";
import { getArea, getLength } from "ol/sphere";
import type { Feature as GeoFeature, Geometry as GeoGeometry } from "geojson";
import type { ConvertedCoordinate } from "./coordinate";

export type EditorMode = "browse" | "select" | "modify" | "point" | "line" | "polygon";
export type FeaturePreset = "project-point" | "project-line" | "project-area" | "survey-area" | "inventory-area" | "impact-area" | "habitat-built" | "habitat-water" | "habitat-farmland" | "sensitivity-low" | "sensitivity-medium" | "sensitivity-high" | "tbn-point" | "other-point";
export interface LayerDefinition { id: string; name: string; groupId: string; visible: boolean; order: number; }

export const featurePresets: Record<FeaturePreset, { label: string; geometry: "Point" | "LineString" | "Polygon"; color: string; strokeWidth?: number; lineDash?: number[]; fillColor?: string }> = {
  "project-point": { label: "智聯工程點位", geometry: "Point", color: "#ff9e17" },
  "project-line": { label: "工程計畫範圍（橘線 0.66 mm）", geometry: "LineString", color: "#ff9800", strokeWidth: 2.5 },
  "project-area": { label: "工程範圍（橘線 0.66 mm）", geometry: "Polygon", color: "#ff9800", strokeWidth: 2.5, fillColor: "rgba(255,152,0,.06)" },
  "survey-area": { label: "調查範圍 100 m（藍線 0.46 mm）", geometry: "Polygon", color: "#123dff", strokeWidth: 1.75, fillColor: "rgba(18,61,255,.04)" },
  "inventory-area": { label: "盤點範圍 500 m（紅色虛線 0.46 mm）", geometry: "Polygon", color: "#ef2b2d", strokeWidth: 1.75, lineDash: [8, 5], fillColor: "rgba(239,43,45,.025)" },
  "impact-area": { label: "1 km 影響範圍", geometry: "Polygon", color: "#e5b636" },
  "habitat-built": { label: "棲地－建成地區", geometry: "Polygon", color: "#777777", strokeWidth: 1, fillColor: "rgba(119,119,119,.78)" },
  "habitat-water": { label: "棲地－流動水域", geometry: "Polygon", color: "#5f80e8", strokeWidth: 1, fillColor: "rgba(95,128,232,.72)" },
  "habitat-farmland": { label: "棲地－農牧用地", geometry: "Polygon", color: "#c9d86b", strokeWidth: 1, fillColor: "rgba(201,216,107,.68)" },
  "sensitivity-low": { label: "生態敏感度－低度", geometry: "Polygon", color: "#9bd27d", strokeWidth: 1, fillColor: "rgba(155,210,125,.55)" },
  "sensitivity-medium": { label: "生態敏感度－中度", geometry: "Polygon", color: "#fff59a", strokeWidth: 1, fillColor: "rgba(255,245,154,.62)" },
  "sensitivity-high": { label: "生態敏感度－高度", geometry: "Polygon", color: "#ed7777", strokeWidth: 1, fillColor: "rgba(237,119,119,.58)" },
  "tbn-point": { label: "TBN 點位", geometry: "Point", color: "#8d5a99" },
  "other-point": { label: "其他單位案件", geometry: "Point", color: "#729b6f" },
};

const emap = new TileLayer({ source: new XYZ({ url: "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}", attributions: "© 內政部國土測繪中心", crossOrigin: "anonymous" }), visible: true });
const photo = new TileLayer({ source: new XYZ({ url: "https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}", attributions: "© 內政部國土測繪中心", crossOrigin: "anonymous" }), visible: false });
const resultSource = new VectorSource();
const workSource = new VectorSource();
const tbnSource = new VectorSource();
const format = new GeoJSON();
const display = { results: true, resultLabels: true, resultLine: true, work: true, workLabels: true, tbn: true };
let layerDefinitions: LayerDefinition[] = [];
let drawInteraction: Draw | undefined;
let modifyInteraction: Modify | undefined;
let snapInteraction: Snap | undefined;
let selectInteraction: Select | undefined;
let activePreset: FeaturePreset = "project-point";
let activeLayerId = "project";

function labelStyle(text: string): Text { return new Text({ text, offsetY: -18, font: "600 13px 'Noto Sans TC', sans-serif", fill: new Fill({ color: "#103b35" }), backgroundFill: new Fill({ color: "rgba(255,253,247,.94)" }), padding: [3, 6, 3, 6] }); }
function resultStyle(featureLike: FeatureLike): Style | undefined { const feature = featureLike as Feature; if (!display.results) return undefined; if (feature.get("kind") === "result-line") return display.resultLine ? new Style({ stroke: new Stroke({ color: "#e05d3d", width: 4 }) }) : undefined; return new Style({ image: new Circle({ radius: 8, fill: new Fill({ color: "#efb750" }), stroke: new Stroke({ color: "#103b35", width: 3 }) }), text: display.resultLabels ? labelStyle(feature.get("name") ?? "") : undefined }); }

function workStyle(featureLike: FeatureLike): Style | undefined {
  const feature = featureLike as Feature; if (!display.work) return undefined;
  const layer = layerDefinitions.find((item) => item.id === feature.get("layerId")); if (layer && !layer.visible) return undefined;
  const presetKey = (feature.get("preset") || "project-area") as FeaturePreset; const preset = featurePresets[presetKey] ?? featurePresets["project-area"]; const geometry = feature.getGeometry(); const text = display.workLabels ? labelStyle(feature.get("name") || preset.label) : undefined;
  const zIndex = 1000 - (layer?.order ?? 500); let style: Style;
  if (geometry instanceof Point) style = new Style({ image: new Circle({ radius: presetKey === "tbn-point" ? 6 : 8, fill: new Fill({ color: preset.color }), stroke: new Stroke({ color: "#ffffff", width: 2 }) }), text });
  else if (geometry instanceof LineString) style = new Style({ stroke: new Stroke({ color: preset.color, width: preset.strokeWidth ?? 4, lineDash: preset.lineDash }), text });
  else { const alpha = presetKey === "impact-area" ? "2b" : "45"; style = new Style({ fill: new Fill({ color: preset.fillColor ?? `${preset.color}${alpha}` }), stroke: new Stroke({ color: preset.color, width: preset.strokeWidth ?? (presetKey === "impact-area" ? 2 : 3), lineDash: preset.lineDash ?? (presetKey === "impact-area" ? [9, 6] : undefined) }), text }); }
  style.setZIndex(zIndex); return style;
}

function tbnStyle(featureLike: FeatureLike): Style | undefined { if (!display.tbn) return undefined; const feature = featureLike as Feature; const sensitive = feature.get("sensitiveCategory") && feature.get("sensitiveCategory") !== "無"; return new Style({ image: new Circle({ radius: sensitive ? 8 : 6, fill: new Fill({ color: sensitive ? "rgba(183,72,75,.78)" : "rgba(68,121,108,.78)" }), stroke: new Stroke({ color: "#fff", width: 1.5 }) }) }); }
const resultLayer = new VectorLayer({ source: resultSource, style: resultStyle, zIndex: 20 });
const workLayer = new VectorLayer({ source: workSource, style: workStyle, zIndex: 30 });
const tbnLayer = new VectorLayer({ source: tbnSource, style: tbnStyle, zIndex: 40 });

export interface MapCallbacks { cursor: (longitude: number, latitude: number) => void; selection: (features: Feature<Geometry>[]) => void; changed: () => void; committed: (label: string) => void; }

export function createMap(target: HTMLElement, tooltipElement: HTMLElement, callbacks: MapCallbacks): Map {
  const tooltip = new Overlay({ element: tooltipElement, offset: [12, 12], positioning: "bottom-left", stopEvent: false });
  const map = new Map({ target, layers: [emap, photo, resultLayer, workLayer, tbnLayer], overlays: [tooltip], view: new View({ center: fromLonLat([120.95, 23.7]), zoom: 7.5 }) });
  selectInteraction = new Select({ layers: [workLayer], multi: true, condition: singleClick, toggleCondition: platformModifierKeyOnly, style: (feature) => [workStyle(feature)!, new Style({ stroke: new Stroke({ color: "#0f5bff", width: 3, lineDash: [5, 4] }), image: new Circle({ radius: 11, stroke: new Stroke({ color: "#0f5bff", width: 3 }) }) })] });
  map.addInteraction(selectInteraction); selectInteraction.on("select", () => callbacks.selection(selectedFeatures()));
  workSource.on("change", callbacks.changed);
  map.on("pointermove", (event) => {
    const [longitude, latitude] = toLonLat(event.coordinate); callbacks.cursor(longitude, latitude);
    const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate as Feature<Geometry>); target.style.cursor = feature ? "pointer" : "";
    if (!feature) { tooltip.setPosition(undefined); return; }
    const result = feature.get("point") as ConvertedCoordinate | undefined; const geometry = feature.getGeometry(); const measurement = geometry ? measureGeometry(geometry) : "";
    if (feature.get("kind") === "tbn") tooltipElement.innerHTML = `<strong>${escapeHtml(feature.get("vernacularName") || feature.get("scientificName") || "TBN 觀測紀錄")}</strong><span>${escapeHtml(feature.get("taxonGroup") || "未分類")} · ${feature.get("year") || "日期不明"}</span><span>${escapeHtml(feature.get("county") || "")}${escapeHtml(feature.get("municipality") || "")}</span><span>${feature.get("sensitiveCategory") !== "無" ? `敏感資料：${escapeHtml(feature.get("sensitiveCategory"))}` : "公開座標"}</span>`;
    else tooltipElement.innerHTML = result ? `<strong>${escapeHtml(result.label)}</strong><span>WGS84：${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}</span><span>TWD97：X ${Math.round(result.x).toLocaleString()}、Y ${Math.round(result.y).toLocaleString()}</span>` : `<strong>${escapeHtml(feature.get("name") || featurePresets[feature.get("preset") as FeaturePreset]?.label || "工作圖徵")}</strong><span>${escapeHtml(feature.get("presetLabel") || "公司工作圖層")}</span>${measurement ? `<span>${measurement}</span>` : ""}`;
    tooltip.setPosition(event.coordinate);
  });
  const resizeObserver = new ResizeObserver(() => map.updateSize()); resizeObserver.observe(target); requestAnimationFrame(() => map.updateSize()); return map;
}

function escapeHtml(value: string): string { return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!); }
function measureGeometry(geometry: Geometry): string { if (geometry.getType().includes("LineString")) { const length = getLength(geometry); return length >= 1000 ? `長度 ${(length / 1000).toFixed(2)} km` : `長度 ${length.toFixed(1)} m`; } if (geometry.getType().includes("Polygon")) { const area = getArea(geometry); return area >= 1_000_000 ? `面積 ${(area / 1_000_000).toFixed(2)} km²` : `面積 ${area.toFixed(0)} m²`; } return ""; }
export function setBaseMap(type: "emap" | "photo"): void { emap.setVisible(type === "emap"); photo.setVisible(type === "photo"); }
export function setMapDisplay(options: Partial<typeof display>): void { Object.assign(display, options); resultLayer.changed(); workLayer.changed(); tbnLayer.changed(); }
export function configureLayers(definitions: LayerDefinition[]): void { layerDefinitions = definitions.map((item) => ({ ...item })); workLayer.changed(); }
export function setActiveLayer(id: string): void { activeLayerId = id; }

export function showPoints(map: Map, points: ConvertedCoordinate[]): void { resultSource.clear(); const projected = points.map((point) => fromLonLat([point.longitude, point.latitude])); projected.forEach((coordinate, index) => { const feature = new Feature(new Point(coordinate)); feature.setProperties({ kind: "result-point", name: points[index].label, point: points[index] }); resultSource.addFeature(feature); }); if (projected.length > 1) { const line = new Feature(new LineString(projected)); line.set("kind", "result-line"); resultSource.addFeature(line); } if (projected.length) { const extent = resultSource.getExtent(); if (extent) map.getView().fit(extent, { padding: [70, 70, 70, 70], maxZoom: 18, duration: 350 }); } }

export function setEditorMode(map: Map, mode: EditorMode, preset: FeaturePreset, callbacks: { created: (feature: Feature<Geometry>) => void; modified: () => void }): void {
  cancelEditorMode(map); activePreset = preset;
  if (mode === "modify") { modifyInteraction = new Modify({ source: workSource }); modifyInteraction.on("modifyend", () => callbacks.modified()); map.addInteraction(modifyInteraction); snapInteraction = new Snap({ source: workSource }); map.addInteraction(snapInteraction); return; }
  if (["point", "line", "polygon"].includes(mode)) { const geometryType = mode === "point" ? "Point" : mode === "line" ? "LineString" : "Polygon"; drawInteraction = new Draw({ source: workSource, type: geometryType }); drawInteraction.on("drawend", (event) => { const feature = event.feature as Feature<Geometry>; const presetInfo = featurePresets[activePreset]; feature.setProperties({ preset: activePreset, presetLabel: presetInfo.label, name: `${presetInfo.label} ${workSource.getFeatures().length + 1}`, note: "", layerId: activeLayerId }); callbacks.created(feature); }); map.addInteraction(drawInteraction); snapInteraction = new Snap({ source: workSource }); map.addInteraction(snapInteraction); }
}
export function cancelEditorMode(map: Map): void { if (drawInteraction) { drawInteraction.abortDrawing(); map.removeInteraction(drawInteraction); } if (modifyInteraction) map.removeInteraction(modifyInteraction); if (snapInteraction) map.removeInteraction(snapInteraction); drawInteraction = undefined; modifyInteraction = undefined; snapInteraction = undefined; }
export function removeLastDrawPoint(): boolean { if (!drawInteraction) return false; drawInteraction.removeLastPoint(); return true; }
export function finishDrawing(): boolean { if (!drawInteraction) return false; drawInteraction.finishDrawing(); return true; }
export function selectedFeatures(): Feature<Geometry>[] { return selectInteraction?.getFeatures().getArray() as Feature<Geometry>[] ?? []; }
export function selectedFeature(): Feature<Geometry> | null { return selectedFeatures()[0] ?? null; }
export function selectFeature(feature: Feature<Geometry> | null): void { selectInteraction?.getFeatures().clear(); if (feature) selectInteraction?.getFeatures().push(feature); }
export function toggleFeatureSelection(feature: Feature<Geometry>): void { const collection = selectInteraction?.getFeatures(); if (!collection) return; if (collection.getArray().includes(feature)) collection.remove(feature); else collection.push(feature); }
export function selectAllFeatures(): void { selectInteraction?.getFeatures().clear(); selectInteraction?.getFeatures().extend(getWorkFeatures()); }
export function updateSelected(properties: { name: string; note: string; preset: FeaturePreset; layerId?: string }): void { selectedFeatures().forEach((feature, index) => feature.setProperties({ ...properties, name: index ? `${properties.name} ${index + 1}` : properties.name, presetLabel: featurePresets[properties.preset].label, layerId: properties.layerId || feature.get("layerId") || activeLayerId })); workLayer.changed(); }
export function deleteSelected(): number { const selected = selectedFeatures(); selectInteraction?.getFeatures().clear(); selected.forEach((feature) => workSource.removeFeature(feature)); return selected.length; }
export function duplicateSelected(): number { const clones = selectedFeatures().map((feature) => { const clone = feature.clone() as Feature<Geometry>; clone.getGeometry()?.translate(8, -8); clone.set("name", `${feature.get("name") || "圖徵"} 複本`); workSource.addFeature(clone); return clone; }); selectInteraction?.getFeatures().clear(); selectInteraction?.getFeatures().extend(clones); return clones.length; }
export function clearWorkFeatures(): void { selectInteraction?.getFeatures().clear(); workSource.clear(); }
export function getWorkFeatures(): Feature<Geometry>[] { return workSource.getFeatures() as Feature<Geometry>[]; }
export function fitWorkFeatures(map: Map): void { if (workSource.getFeatures().length) { const extent = workSource.getExtent(); if (extent) map.getView().fit(extent, { padding: [70, 70, 70, 70], maxZoom: 18, duration: 350 }); } }
export function fitFeatures(map: Map, features: Feature<Geometry>[]): void { if (!features.length) return; const source = new VectorSource({ features }); const extent = source.getExtent(); if (extent) map.getView().fit(extent, { padding: [70, 70, 70, 70], maxZoom: 18, duration: 350 }); }
export function layerFeatures(layerId: string): Feature<Geometry>[] { return getWorkFeatures().filter((feature) => feature.get("layerId") === layerId); }
export function selectLayerFeatures(layerId: string): void { selectInteraction?.getFeatures().clear(); selectInteraction?.getFeatures().extend(layerFeatures(layerId)); }
export function exportGeoJson(features: Feature<Geometry>[] = getWorkFeatures()): string { return format.writeFeatures(features, { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326", decimals: 7 }); }
export function selectedGeoFeatures(): GeoFeature<GeoGeometry>[] { return JSON.parse(exportGeoJson(selectedFeatures())).features; }
export function replaceWorkGeoJson(text: string): void { clearWorkFeatures(); importGeoJson(undefined, text); }
export function addGeoFeature(feature: GeoFeature<GeoGeometry>, properties: Record<string, unknown>): Feature<Geometry> { const created = format.readFeature({ ...feature, properties: { ...feature.properties, ...properties } }, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }) as Feature<Geometry>; if (!created.get("layerId")) created.set("layerId", activeLayerId); workSource.addFeature(created); selectFeature(created); return created; }
export function importGeoJson(map: Map | undefined, text: string): number { const features = format.readFeatures(text, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }) as Feature<Geometry>[]; features.forEach((feature, index) => { const preset = (feature.get("preset") as FeaturePreset) || inferPreset(feature.getGeometry()); feature.setProperties({ preset, presetLabel: featurePresets[preset].label, name: feature.get("name") || `${featurePresets[preset].label} ${index + 1}`, note: feature.get("note") || "", layerId: feature.get("layerId") || activeLayerId }); }); workSource.addFeatures(features); if (map) fitWorkFeatures(map); return features.length; }
function inferPreset(geometry: Geometry | undefined): FeaturePreset { if (geometry instanceof Point) return "project-point"; if (geometry instanceof LineString) return "project-line"; return "project-area"; }
export function featureSummary(feature: Feature<Geometry>): { type: string; measurement: string } { return { type: feature.getGeometry()?.getType() ?? "—", measurement: feature.getGeometry() ? measureGeometry(feature.getGeometry()!) : "" }; }

export interface TbnRecord { [key: string]: unknown; occurrenceID?: string; decimalLatitude?: string | number; decimalLongitude?: string | number; vernacularName?: string; simplifiedScientificName?: string; scientificName?: string; taxonGroup?: string; year?: number; county?: string; municipality?: string; sensitiveCategory?: string; protectedStatusTW?: string; categoryRedlistTW?: string; datasetName?: string; license?: string; }
export function showTbnRecords(records: TbnRecord[]): number { tbnSource.clear(); const features = records.flatMap((record) => { const latitude = Number(record.decimalLatitude); const longitude = Number(record.decimalLongitude); if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return []; const feature = new Feature(new Point(fromLonLat([longitude, latitude]))); feature.setProperties({ ...record, kind: "tbn", scientificName: record.simplifiedScientificName || record.scientificName }); return [feature]; }); tbnSource.addFeatures(features); return features.length; }
export function clearTbnRecords(): void { tbnSource.clear(); }
