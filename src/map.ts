import Map from "ol/Map";
import View from "ol/View";
import Overlay from "ol/Overlay";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { fromLonLat, toLonLat } from "ol/proj";
import { Circle, Fill, Stroke, Style, Text } from "ol/style";
import type { ConvertedCoordinate } from "./coordinate";

const emap = new TileLayer({
  source: new XYZ({
    url: "https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}",
    attributions: "© 內政部國土測繪中心",
    crossOrigin: "anonymous",
  }),
  visible: true,
});

const photo = new TileLayer({
  source: new XYZ({
    url: "https://wmts.nlsc.gov.tw/wmts/PHOTO2/default/GoogleMapsCompatible/{z}/{y}/{x}",
    attributions: "© 內政部國土測繪中心",
    crossOrigin: "anonymous",
  }),
  visible: false,
});

const display = { points: true, labels: true, line: true };
const vectorSource = new VectorSource();
const vector = new VectorLayer({
  source: vectorSource,
  style: (feature) => {
    const kind = feature.get("kind");
    if (kind === "line") {
      return display.line
        ? new Style({ stroke: new Stroke({ color: "#e05d3d", width: 4 }) })
        : undefined;
    }
    if (!display.points) return undefined;
    return new Style({
      image: new Circle({
        radius: 8,
        fill: new Fill({ color: "#efb750" }),
        stroke: new Stroke({ color: "#103b35", width: 3 }),
      }),
      text: display.labels
        ? new Text({
            text: feature.get("name") ?? "",
            offsetY: -19,
            font: "600 13px 'Noto Sans TC', sans-serif",
            fill: new Fill({ color: "#103b35" }),
            backgroundFill: new Fill({ color: "rgba(255,253,247,.92)" }),
            padding: [3, 6, 3, 6],
          })
        : undefined,
    });
  },
});

export interface MapDisplayOptions {
  points: boolean;
  labels: boolean;
  line: boolean;
}

export function createMap(
  target: HTMLElement,
  tooltipElement: HTMLElement,
  onCursorMove: (longitude: number, latitude: number) => void,
): Map {
  const tooltip = new Overlay({
    element: tooltipElement,
    offset: [12, 12],
    positioning: "bottom-left",
    stopEvent: false,
  });
  const map = new Map({
    target,
    layers: [emap, photo, vector],
    overlays: [tooltip],
    view: new View({ center: fromLonLat([120.95, 23.7]), zoom: 7.5 }),
  });

  map.on("pointermove", (event) => {
    const [longitude, latitude] = toLonLat(event.coordinate);
    onCursorMove(longitude, latitude);
    const feature = map.forEachFeatureAtPixel(event.pixel, (candidate) => candidate);
    const point = feature?.get("point") as ConvertedCoordinate | undefined;
    target.style.cursor = point ? "pointer" : "";
    if (!point) {
      tooltip.setPosition(undefined);
      return;
    }
    tooltipElement.innerHTML = `
      <strong>${point.label}</strong>
      <span>WGS84：${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}</span>
      <span>TWD97：X ${Math.round(point.x).toLocaleString()}　Y ${Math.round(point.y).toLocaleString()}</span>`;
    tooltip.setPosition(event.coordinate);
  });

  const resizeObserver = new ResizeObserver(() => map.updateSize());
  resizeObserver.observe(target);
  requestAnimationFrame(() => map.updateSize());
  return map;
}

export function setBaseMap(type: "emap" | "photo"): void {
  emap.setVisible(type === "emap");
  photo.setVisible(type === "photo");
}

export function setMapDisplay(options: MapDisplayOptions): void {
  Object.assign(display, options);
  vector.changed();
}

export function showPoints(map: Map, points: ConvertedCoordinate[]): void {
  vectorSource.clear();
  const projected = points.map((point) => fromLonLat([point.longitude, point.latitude]));
  projected.forEach((coordinate, index) => {
    const feature = new Feature(new Point(coordinate));
    feature.setProperties({ kind: "point", name: points[index].label, point: points[index] });
    vectorSource.addFeature(feature);
  });
  if (projected.length > 1) {
    const line = new Feature(new LineString(projected));
    line.set("kind", "line");
    vectorSource.addFeature(line);
  }
  if (vectorSource.getFeatures().length) {
    const extent = vectorSource.getExtent();
    if (extent) map.getView().fit(extent, { padding: [70, 70, 70, 70], maxZoom: 18, duration: 350 });
  }
}
