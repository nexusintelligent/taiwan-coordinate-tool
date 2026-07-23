import type { ConvertedCoordinate } from "./coordinate";

export type RoundingMode = "round" | "floor" | "ceil";

export const templates = {
  route: "({1.x}, {1.y})~({2.x}, {2.y})",
  engineering: "TWD97 起點 X:{1.x} Y:{1.y} 迄點 X:{2.x} Y:{2.y}",
  lines: "{label}｜X: {x}｜Y: {y}",
  wgs84: "{label}｜{lat}, {lon}",
};

export function formatNumber(value: number, decimals: number, mode: RoundingMode): string {
  const factor = 10 ** decimals;
  const rounded =
    mode === "floor"
      ? Math.floor(value * factor) / factor
      : mode === "ceil"
        ? Math.ceil(value * factor) / factor
        : Math.round((value + Number.EPSILON) * factor) / factor;
  return rounded.toFixed(decimals);
}

function pointTokens(
  point: ConvertedCoordinate,
  xyDecimals: number,
  llDecimals: number,
  mode: RoundingMode,
): Record<string, string> {
  return {
    label: point.label,
    x: formatNumber(point.x, xyDecimals, mode),
    y: formatNumber(point.y, xyDecimals, mode),
    lat: formatNumber(point.latitude, llDecimals, mode),
    lon: formatNumber(point.longitude, llDecimals, mode),
  };
}

export function renderTemplate(
  template: string,
  points: ConvertedCoordinate[],
  xyDecimals: number,
  llDecimals: number,
  mode: RoundingMode,
): string {
  const hasIndexedTokens = /\{\d+\./.test(template);
  if (!hasIndexedTokens) {
    return points
      .map((point) => {
        const tokens = pointTokens(point, xyDecimals, llDecimals, mode);
        return template.replace(/\{(label|x|y|lat|lon)\}/g, (_, key: string) => tokens[key]);
      })
      .join("\n");
  }

  return template.replace(
    /\{(\d+)\.(label|x|y|lat|lon)\}/g,
    (token, indexText: string, key: string) => {
      const point = points[Number(indexText) - 1];
      return point ? pointTokens(point, xyDecimals, llDecimals, mode)[key] : token;
    },
  );
}
