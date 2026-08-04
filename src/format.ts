import type { ConvertedCoordinate } from "./coordinate";

export const templates = {
  route: "({1.x}, {1.y})~({2.x}, {2.y})",
  engineering: "TWD97 起點 X:{1.x} Y:{1.y} 迄點 X:{2.x} Y:{2.y}",
  lines: "{label}｜X: {x}｜Y: {y}",
  wgs84: "{label}｜{lat}, {lon}",
};

export interface NumberFormatOptions {
  xyDecimals: number;
  llDecimals: number;
  useThousands: boolean;
}

export function formatNumber(value: number, decimals: number, useThousands = false): string {
  const factor = 10 ** decimals;
  const rounded = Math.round((value + Number.EPSILON) * factor) / factor;
  return useThousands
    ? rounded.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })
    : rounded.toFixed(decimals);
}

export function pointTokens(
  point: ConvertedCoordinate,
  options: NumberFormatOptions,
): Record<string, string> {
  return {
    label: point.label,
    x: formatNumber(point.x, options.xyDecimals, options.useThousands),
    y: formatNumber(point.y, options.xyDecimals, options.useThousands),
    lat: formatNumber(point.latitude, options.llDecimals),
    lon: formatNumber(point.longitude, options.llDecimals),
  };
}

export function renderPointTemplate(
  template: string,
  point: ConvertedCoordinate,
  options: NumberFormatOptions,
): string {
  const tokens = pointTokens(point, options);
  return template.replace(/\{(label|x|y|lat|lon)\}/g, (_, key: string) => tokens[key]);
}

export function renderTemplate(
  template: string,
  points: ConvertedCoordinate[],
  options: NumberFormatOptions,
): string {
  const hasIndexedTokens = /\{\d+\./.test(template);
  if (!hasIndexedTokens) {
    return points.map((point) => renderPointTemplate(template, point, options)).join("\n");
  }

  return template.replace(
    /\{(\d+)\.(label|x|y|lat|lon)\}/g,
    (token, indexText: string, key: string) => {
      const point = points[Number(indexText) - 1];
      return point ? pointTokens(point, options)[key] : token;
    },
  );
}

const rawCoordinatePattern =
  /([+-]?(?:\d{2,6}(?:\.\d+)?))\s*[,，、;；／/|\s]\s*([+-]?(?:\d{2,7}(?:\.\d+)?))/g;

export function replaceCoordinatesInText(
  rawText: string,
  points: ConvertedCoordinate[],
  replacementTemplate: string,
  options: NumberFormatOptions,
): string {
  let pointIndex = 0;
  return rawText.replace(rawCoordinatePattern, (original) => {
    const point = points[pointIndex++];
    return point ? renderPointTemplate(replacementTemplate, point, options) : original;
  });
}

export function createTableRows(
  points: ConvertedCoordinate[],
  options: NumberFormatOptions,
): string[][] {
  return points.map((point) => [
    point.label,
    formatNumber(point.latitude, options.llDecimals),
    formatNumber(point.longitude, options.llDecimals),
    formatNumber(point.x, options.xyDecimals),
    formatNumber(point.y, options.xyDecimals),
  ]);
}
