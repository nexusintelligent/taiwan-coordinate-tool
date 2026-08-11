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
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import { fromLonLat, toLonLat } from "ol/proj";
import VectorSource from "ol/source/Vector";
import XYZ from "ol/source/XYZ";
import { Circle, Fill, Stroke, Style, Text } from "ol/style";
import { getArea, getLength } from "ol/sphere";
import type { ConvertedCoordinate } from "./coordinate";

export type EditorMode = "browse" | "select" | "modify" | "point" | "line" | "polygon";
export type FeaturePreset = "project-point" | "project-line" | "project-area" | "survey-area" | "impact-area" | "tbn-point" | "other-point";

export const featurePresets: Record<FeaturePreset, { label: string; geometry: "Point" | "LineString" | "Polygon"; color: string }> = {
  "project-point": { label: "智聯工程點位", geometry: "Point", color: "#ff9e17" },
  "project-line": { label: "工程線位", geometry: "LineString", color: "#becf50" },
  "project-area": { label: "工程範圍", geometry: "Polygon", color: "#e77148" },
  "survey-area": { label: "生態調查範圍", geometry: "Polygon", color: "#85b66f" },
  "impact-area": { label: "1 km 影響範圍", geometry: "Polygon", color: "#e5b636" },
  "tbn-point": { label: "TBN 點位", geometry: "Point", color: "#8d5a99" },
  "other-point": { label: "其他單位案件", geometry: "Point", color: "#729b6f" },
};

const emap = new TileLayer({
  source: new XYZ({ url: "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}", attributions: "© 內政部國土測繪中心", crossOrigin: "anonymous" }),
  visible: true,
});
const photo = new TileLayer({
  source: new XYZ({ url: "https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}", attributions: "© 內政部國土測繪中心", crossOrigin: "anonymous" }),
  visible: false,
});

const resultSource = new VectorSource();
const workSource = new VectorSource();
const display = { results: true, resultLabels: true, resultLine: true, work: true, workLabels: true };
let drawInteraction: Draw | undefined;
let modifyInteraction: Modify | undefined;
let snapInteraction: Snap | undefined;
let selectInteraction: Select | undefined;
let activePreset: FeaturePreset = "project-point";

function resultStyle(featureLike: FeatureLike): Style | undefined {
  const feature = featureLike as Feature;
  if (!display.results) return undefined;
  if (feature.get("kind") === "result-line") return display.resultLine ? new Style({ stroke: new Stroke({ color: "#e05d3d", width: 4 }) }) : undefined;
  return new Style({
    image: new Circle({ radius: 8, fill: new Fill({ color: "#efb750" }), stroke: new Stroke({ color: "#103b35", width: 3 }) }),
    text: display.resultLabels ? labelStyle(feature.get("name") ?? "") : undefined,
  });
}

function labelStyle(text: string): Text {
  return new Text({ text, offsetY: -18, font: "600 13px 'Noto Sans TC', sans-serif", fill: new Fill({ color: "#103b35" }), backgroundFill: new Fill({ color: "rgba(255,253,247,.94)" }), padding: [3, 6, 3, 6] });
}

function workStyle(featureLike: FeatureLike): Style | undefined {
  const feature = featureLike as Feature;
  if (!display.work) return undefined;
  const presetKey = (feature.get("preset") || "project-area") as FeaturePreset;
  const preset = featurePresets[presetKey] ?? featurePresets["project-area"];
  const geometry = feature.getGeometry();
  const text = display.workLabels ? labelStyle(feature.get("name") || preset.label) : undefined;
  if (geometry instanceof Point) {
    return new Style({ image: new Circle({ radius: presetKey === "tbn-point" ? 6 : 8, fill: new Fill({ color: preset.color }), stroke: new Stroke({ color: "#ffffff", width: 2 }) }), text });
  }
  if (geometry instanceof LineString) return new Style({ stroke: new Stroke({ color: preset.color, width: 4 }), text });
  const alpha = presetKey === "impact-area" ? "2b" : "45";
  return new Style({ fill: new Fill({ color: `${preset.color}${alpha}` }), stroke: new Stroke({ color: preset.color, width: presetKey === "impact-area" ? 2 : 3, lineDash: presetKey === "impact-area" ? [9, 6] : undefined }), text });
}

const resultLayer = new VectorLayer({ source: resultSource, style: resultStyle, zIndex: 20 });
const workLayer = new VectorLayer({ source: workSource, style: workStyle, zIndex: 30 });

export interface MapCallbacks {
  cursor: (longitude: number, latitude: number) => void;
  selection: (feature: Feature<Geometry> | null) => void;
  changed: () => void;
}

export function createMap(target: HTMLElement, tooltipElement: HTMLElement, callbacks: MapCallbacks): Map {
  const tooltip = new Overlay({ element: tooltipElement, offset: [12, 12], positioning: "bottom-left", stopEvent: false });
  const map = new Map({ target, layers: [emap, photo, resultLayer, workLayer], overlays: [tooltip], view: new View({ center: fromLonLat([120.95, 23.7]), zoom: 7.5 }) });
  selectInteraction = new Select({ layers: [workLayer], style: (feature) => [workStyle(feature as Feature)!, new Style({ stroke: new Stroke({ color: "#0f5bff", width: 3, lineDash: [5, 4] }), image: new Circle({ radius: 11, stroke: new Stroke({ color: "#0f5bff", width: 3 }) }) })] });
  map.addInteraction(selectInteraction);
  selectInteraction.on("select", () => callbacks.selection((selectInteraction!.getFeatures().item(0) as Feature<Geometry>) ?? null));
  workSource.on("change", callbacks.changed);

  map.on("pointermove", (event) => {
    const [longitude, latitude] = toLonLat(event.coordinate);
    callbacks.cursor(longitude, latitude);
    const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate as Feature<Geometry>);
    target.style.cursor = feature ? "pointer" : "";
    if (!feature) { tooltip.setPosition(undefined); return; }
    const result = feature.get("point") as ConvertedCoordinate | undefined;
    const geometry = feature.getGeometry();
    const measurement = geometry ? measureGeometry(geometry) : "";
    tooltipElement.innerHTML = result
      ? `<strong>${escapeHtml(result.label)}</strong><span>WGS84：${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}</span><span>TWD97：X ${Math.round(result.x).toLocaleString()}、Y ${Math.round(result.y).toLocaleString()}</span>`
      : `<strong>${escapeHtml(feature.get("name") || featurePresets[feature.get("preset") as FeaturePreset]?.label || "工作圖徵")}</strong><span>${escapeHtml(feature.get("presetLabel") || "公司工作圖層")}</span>${measurement ? `<span>${measurement}</span>` : ""}`;
    tooltip.setPosition(event.coordinate);
  });
  const resizeObserver = new ResizeObserver(() => map.updateSize());
  resizeObserver.observe(target);
  requestAnimationFrame(() => map.updateSize());
  return map;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);
}

function measureGeometry(geometry: Geometry): string {
  if (geometry.getType().includes("LineString")) { const length = getLength(geometry); return length >= 1000 ? `長度 ${(length / 1000).toFixed(2)} km` : `長度 ${length.toFixed(1)} m`; }
  if (geometry.getType().includes("Polygon")) { const area = getArea(geometry); return area >= 1_000_000 ? `面積 ${(area / 1_000_000).toFixed(2)} km²` : `面積 ${area.toFixed(0)} m²`; }
  return "";
}

export function setBaseMap(type: "emap" | "photo"): void { emap.setVisible(type === "emap"); photo.setVisible(type === "photo"); }
export function setMapDisplay(options: Partial<typeof display>): void { Object.assign(display, options); resultLayer.changed(); workLayer.changed(); }

export function showPoints(map: Map, points: ConvertedCoordinate[]): void {
  resultSource.clear();
  const projected = points.map((point) => fromLonLat([point.longitude, point.latitude]));
  projected.forEach((coordinate, index) => { const feature = new Feature(new Point(coordinate)); feature.setProperties({ kind: "result-point", name: points[index].label, point: points[index] }); resultSource.addFeature(feature); });
  if (projected.length > 1) { const line = new Feature(new LineString(projected)); line.set("kind", "result-line"); resultSource.addFeature(line); }
  if (projected.length) { const extent = resultSource.getExtent(); if (extent) map.getView().fit(extent, { padding: [70, 70, 70, 70], maxZoom: 18, duration: 350 }); }
}

export function setEditorMode(map: Map, mode: EditorMode, preset: FeaturePreset, onCreated: (feature: Feature<Geometry>) => void): void {
  if (drawInteraction) map.removeInteraction(drawInteraction);
  if (modifyInteraction) map.removeInteraction(modifyInteraction);
  if (snapInteraction) map.removeInteraction(snapInteraction);
  drawInteraction = undefined; modifyInteraction = undefined; snapInteraction = undefined;
  activePreset = preset;
  if (mode === "modify") { modifyInteraction = new Modify({ source: workSource }); map.addInteraction(modifyInteraction); snapInteraction = new Snap({ source: workSource }); map.addInteraction(snapInteraction); return; }
  if (["point", "line", "polygon"].includes(mode)) {
    const geometryType = mode === "point" ? "Point" : mode === "line" ? "LineString" : "Polygon";
    drawInteraction = new Draw({ source: workSource, type: geometryType });
    drawInteraction.on("drawend", (event) => { const feature = event.feature as Feature<Geometry>; const presetInfo = featurePresets[activePreset]; feature.setProperties({ preset: activePreset, presetLabel: presetInfo.label, name: `${presetInfo.label} ${workSource.getFeatures().length + 1}`, note: "" }); onCreated(feature); });
    map.addInteraction(drawInteraction); snapInteraction = new Snap({ source: workSource }); map.addInteraction(snapInteraction);
  }
}

export function selectedFeature(): Feature<Geometry> | null { return (selectInteraction?.getFeatures().item(0) as Feature<Geometry>) ?? null; }
export function selectFeature(feature: Feature<Geometry> | null): void { selectInteraction?.getFeatures().clear(); if (feature) selectInteraction?.getFeatures().push(feature); }
export function updateSelected(properties: { name: string; note: string; preset: FeaturePreset }): void { const feature = selectedFeature(); if (!feature) return; feature.setProperties({ ...properties, presetLabel: featurePresets[properties.preset].label }); workLayer.changed(); }
export function deleteSelected(): boolean { const feature = selectedFeature(); if (!feature) return false; selectInteraction?.getFeatures().clear(); workSource.removeFeature(feature); return true; }
export function clearWorkFeatures(): void { selectInteraction?.getFeatures().clear(); workSource.clear(); }
export function getWorkFeatures(): Feature<Geometry>[] { return workSource.getFeatures() as Feature<Geometry>[]; }
export function fitWorkFeatures(map: Map): void { if (workSource.getFeatures().length) { const extent = workSource.getExtent(); if (extent) map.getView().fit(extent, { padding: [70, 70, 70, 70], maxZoom: 18, duration: 350 }); } }

export function exportGeoJson(): string {
  return new GeoJSON().writeFeatures(workSource.getFeatures(), { featureProjection: "EPSG:3857", dataProjection: "EPSG:4326", decimals: 7 });
}

export function importGeoJson(map: Map, text: string): number {
  const features = new GeoJSON().readFeatures(text, { dataProjection: "EPSG:4326", featureProjection: "EPSG:3857" }) as Feature<Geometry>[];
  features.forEach((feature, index) => { const preset = (feature.get("preset") as FeaturePreset) || inferPreset(feature.getGeometry()); feature.setProperties({ preset, presetLabel: featurePresets[preset].label, name: feature.get("name") || `${featurePresets[preset].label} ${index + 1}`, note: feature.get("note") || "" }); });
  workSource.addFeatures(features); fitWorkFeatures(map); return features.length;
}

function inferPreset(geometry: Geometry | undefined): FeaturePreset { if (geometry instanceof Point) return "project-point"; if (geometry instanceof LineString) return "project-line"; return "project-area"; }

export function featureSummary(feature: Feature<Geometry>): { type: string; measurement: string } { return { type: feature.getGeometry()?.getType() ?? "—", measurement: feature.getGeometry() ? measureGeometry(feature.getGeometry()!) : "" }; }
