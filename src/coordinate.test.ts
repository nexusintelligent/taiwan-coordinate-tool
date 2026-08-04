import { describe, expect, it } from "vitest";
import { convertPair, detectSystem } from "./coordinate";
import { extractCoordinatePairs } from "./parser";
import { createTableRows, formatNumber, renderTemplate, replaceCoordinatesInText } from "./format";

const formatOptions = { xyDecimals: 0, llDecimals: 6, useThousands: false };

describe("coordinate parsing and conversion", () => {
  it("extracts coordinates from noisy Chinese text", () => {
    const pairs = extractCoordinatePairs("本案起點(23.712,120.324)，沿道路至終點(23.708,120.320)。");
    expect(pairs).toHaveLength(2);
    expect(pairs[0]).toMatchObject({ first: 23.712, second: 120.324, label: "起點" });
    expect(pairs[1]).toMatchObject({ first: 23.708, second: 120.32, label: "終點" });
  });

  it("detects Taiwan coordinate types", () => {
    expect(detectSystem({ first: 23.7, second: 120.3 })).toBe("wgs84-latlon");
    expect(detectSystem({ first: 120.3, second: 23.7 })).toBe("wgs84-lonlat");
    expect(detectSystem({ first: 181000, second: 2623000 })).toBe("twd97");
  });

  it("round-trips WGS84 and TWD97", () => {
    const projected = convertPair({ first: 23.712, second: 120.324 }, "wgs84-latlon");
    const restored = convertPair({ first: projected.x, second: projected.y }, "twd97");
    expect(restored.latitude).toBeCloseTo(23.712, 7);
    expect(restored.longitude).toBeCloseTo(120.324, 7);
  });

  it("renders indexed templates using round-half-up display", () => {
    const points = [
      convertPair({ first: 23.712, second: 120.324, label: "起點" }, "wgs84-latlon"),
      convertPair({ first: 23.708, second: 120.32, label: "終點" }, "wgs84-latlon"),
    ];
    expect(renderTemplate("({1.x}, {1.y})~({2.x}, {2.y})", points, formatOptions)).toBe(
      "(181069, 2623292)~(180659, 2622851)",
    );
  });

  it("replaces only coordinate pairs while preserving surrounding text", () => {
    const raw = "施工起點(23.712,120.324)，請現勘。";
    const point = convertPair({ first: 23.712, second: 120.324, label: "起點" }, "wgs84-latlon");
    expect(replaceCoordinatesInText(raw, [point], "X:{x} Y:{y}", formatOptions)).toBe(
      "施工起點(X:181069 Y:2623292)，請現勘。",
    );
  });

  it("creates Excel-ready numeric rows and optional thousands display", () => {
    const point = convertPair({ first: 23.712, second: 120.324, label: "起點" }, "wgs84-latlon");
    expect(createTableRows([point], formatOptions)[0]).toEqual([
      "起點", "23.712000", "120.324000", "181069", "2623292",
    ]);
    expect(formatNumber(point.y, 0, true)).toBe("2,623,292");
  });
});
