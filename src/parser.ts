import type { CoordinatePair } from "./coordinate";

const pairPattern =
  /(?:^|[^\d.])([+-]?(?:\d{2,6}(?:\.\d+)?))\s*[,，、;；／/|\s]\s*([+-]?(?:\d{2,7}(?:\.\d+)?))(?![\d.])/g;

const labelPattern = /(起點|終點|迄點|終點|終點|起|迄|終|P\d+|[A-Z]點|點位\s*\d+)/i;

function nearestLabel(text: string, matchIndex: number): string | undefined {
  const prefix = text.slice(Math.max(0, matchIndex - 24), matchIndex);
  const matches = [...prefix.matchAll(new RegExp(labelPattern.source, "gi"))];
  return matches.at(-1)?.[0]?.replace(/\s+/g, "");
}

export function normalizeInput(text: string): string {
  return text
    .replace(/[（【［]/g, "(")
    .replace(/[）】］]/g, ")")
    .replace(/[：]/g, ":")
    .replace(/\u3000/g, " ");
}

export function extractCoordinatePairs(rawText: string): CoordinatePair[] {
  const text = normalizeInput(rawText);
  const pairs: CoordinatePair[] = [];

  for (const match of text.matchAll(pairPattern)) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    if (!Number.isFinite(first) || !Number.isFinite(second)) continue;

    pairs.push({
      first,
      second,
      label: nearestLabel(text, match.index ?? 0),
      sourceText: match[0].trim(),
    });
  }

  return pairs;
}
