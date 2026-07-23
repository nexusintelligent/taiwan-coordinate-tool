import { describe, expect, it } from "vitest";
import { convertPair, detectSystem } from "./coordinate";
import { extractCoordinatePairs } from "./parser";
import { renderTemplate } from "./format";

describe("coordinate parsing and conversion", () => {
  it("extracts coordinates from noisy Chinese text", () => {
    const pairs = extractCoordinatePairs("(1)起點(23.712,120.324)(2)終點(23.708,120.320)");
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

  it("renders indexed templates", () => {
    const points = [
      convertPair({ first: 23.712, second: 120.324, label: "起點" }, "wgs84-latlon"),
      convertPair({ first: 23.708, second: 120.32, label: "終點" }, "wgs84-latlon"),
    ];
    expect(renderTemplate("({1.x}, {1.y})~({2.x}, {2.y})", points, 0, 6, "round")).toMatch(
      /^\(\d+, \d+\)~\(\d+, \d+\)$/,
    );
  });
});
