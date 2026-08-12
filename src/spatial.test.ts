import { describe, expect, it } from "vitest";
import { point, polygon } from "@turf/helpers";
import { booleanGeometry, bufferGeometry, polygonQueryValue } from "./spatial";

describe("spatial analysis", () => {
  it("creates a polygon buffer around a point", () => {
    const result = bufferGeometry(point([120.3, 23.7]), 1000);
    expect(result.geometry.type).toBe("Polygon");
    expect(result.geometry.coordinates[0].length).toBeGreaterThan(20);
  });

  it("performs polygon union, intersection and difference", () => {
    const first = polygon([[[120, 23], [121, 23], [121, 24], [120, 24], [120, 23]]]);
    const second = polygon([[[120.5, 23.5], [121.5, 23.5], [121.5, 24.5], [120.5, 24.5], [120.5, 23.5]]]);
    expect(booleanGeometry([first, second], "union").geometry.type).toMatch(/Polygon/);
    expect(booleanGeometry([first, second], "intersect").geometry.type).toMatch(/Polygon/);
    expect(booleanGeometry([first, second], "difference").geometry.type).toMatch(/Polygon/);
  });

  it("encodes polygon coordinates for a TBN query", () => {
    const area = polygon([[[120, 23], [121, 23], [121, 24], [120, 23]]]);
    expect(polygonQueryValue(area)).toContain("120.0000000 23.0000000");
  });
});
