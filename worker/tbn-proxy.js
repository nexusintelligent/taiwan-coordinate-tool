const TBN_ENDPOINT = "https://www.tbn.org.tw/api/v26/occurrence";
const ALLOWED_ORIGINS = new Set([
  "https://nexusintelligent.github.io",
  "http://127.0.0.1:4175",
  "http://localhost:5173",
]);
const ALLOWED_PARAMETERS = new Set(["UUID", "modified", "created", "taxonUUID", "taxonGroup", "datasetUUID", "eventDate", "year", "month", "eventPlaceAdminarea", "boundedBy", "polygon", "circle", "gridID", "selfProduced", "limit", "minID"]);

export default {
  async fetch(request) {
    const origin = request.headers.get("Origin") || "";
    const cors = { "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://nexusintelligent.github.io", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "GET") return Response.json({ error: "Method not allowed" }, { status: 405, headers: cors });
    const incoming = new URL(request.url); const upstream = new URL(TBN_ENDPOINT);
    for (const [key, value] of incoming.searchParams) if (ALLOWED_PARAMETERS.has(key)) upstream.searchParams.append(key, value);
    const limit = Math.min(Number(upstream.searchParams.get("limit") || 300), 1000); upstream.searchParams.set("limit", String(limit));
    const response = await fetch(upstream, { headers: { Accept: "application/json", "User-Agent": "Zhilian-GeoDesk/0.4" }, cf: { cacheTtl: 300, cacheEverything: true } });
    return new Response(response.body, { status: response.status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=300" } });
  },
};
