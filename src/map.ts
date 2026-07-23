import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import VectorLayer from "ol/layer/Vector";
import XYZ from "ol/source/XYZ";
import VectorSource from "ol/source/Vector";
import Feature from "ol/Feature";
import Point from "ol/geom/Point";
import LineString from "ol/geom/LineString";
import { fromLonLat } from "ol/proj";
import { Circle, Fill, Stroke, Style } from "ol/style";
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

const vectorSource = new VectorSource();
const vector = new VectorLayer({
  source: vectorSource,
  style: (feature) =>
    feature.getGeometry()?.getType() === "Point"
      ? new Style({
          image: new Circle({
            radius: 8,
            fill: new Fill({ color: "#efb750" }),
            stroke: new Stroke({ color: "#103b35", width: 3 }),
          }),
        })
      : new Style({ stroke: new Stroke({ color: "#e05d3d", width: 4 }) }),
});

export function createMap(target: HTMLElement): Map {
  return new Map({
    target,
    layers: [emap, photo, vector],
    view: new View({
      center: fromLonLat([120.95, 23.7]),
      zoom: 7.5,
    }),
  });
}

export function setBaseMap(type: "emap" | "photo"): void {
  emap.setVisible(type === "emap");
  photo.setVisible(type === "photo");
}

export function showPoints(map: Map, points: ConvertedCoordinate[]): void {
  vectorSource.clear();
  const projected = points.map((point) => fromLonLat([point.longitude, point.latitude]));
  projected.forEach((coordinate, index) => {
    const feature = new Feature(new Point(coordinate));
    feature.set("name", points[index].label);
    vectorSource.addFeature(feature);
  });
  if (projected.length > 1) vectorSource.addFeature(new Feature(new LineString(projected)));

  if (vectorSource.getFeatures().length) {
    const extent = vectorSource.getExtent();
    if (extent) {
      map.getView().fit(extent, {
        padding: [60, 60, 60, 60],
        maxZoom: 18,
        duration: 350,
      });
    }
  }
}
