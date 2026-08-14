import "ol/ol.css";
import "./style.css";
import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import { toLonLat } from "ol/proj";
import { registerSW } from "virtual:pwa-register";
import { convertPair, type CoordinateSystem, type ConvertedCoordinate } from "./coordinate";
import { extractCoordinatePairs } from "./parser";
import { createTableRows, pointTokens, renderTemplate, replaceCoordinatesInText, templates, type NumberFormatOptions } from "./format";
import { readSpatialFiles } from "./file-import";
import {
  addGeoFeature, cancelEditorMode, clearTbnRecords, clearWorkFeatures, configureLayers, createMap, deleteFeatures,
  duplicateSelected, exportGeoJson, exportKml, featurePresets, featureSummary, finishDrawing, fitFeatures, fitWorkFeatures, getWorkFeatures, importGeoJson, layerFeatures, locateMap,
  removeLastDrawPoint, replaceWorkGeoJson, selectAllFeatures, selectFeature, selectedFeature, selectedFeatures,
  selectedGeoFeatures, selectLayerFeatures, setActiveLayer, setBaseMap, setEditorMode, setMapDisplay, setRegionalDrainageVisible, showPoints, showTbnRecords,
  toggleFeatureSelection, updateSelected, type EditorMode, type FeaturePreset, type LayerDefinition, type TbnRecord,
} from "./map";
import type { BooleanOperation, PolygonFeature } from "./spatial";

registerSW({ immediate: true });

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="app-header">
    <div class="brand-mark" aria-hidden="true">智</div>
    <div class="brand-copy"><p>智聯工程科技顧問有限公司</p><h1>智聯 GeoDesk</h1><span>工程座標與圖資工作台 · v0.4</span></div>
    <nav class="app-tabs" aria-label="工作模式"><button class="app-tab active" data-view="editor">圖資功能</button><button class="app-tab" data-view="coordinate">座標轉換</button></nav>
    <div class="header-actions"><button id="toggleWorkbench" title="收合左側工作區">☰</button><button id="toggleHeader" title="收合上方區域">▴</button><button id="themeToggle" title="切換深淺色主題">◐</button></div>
    <div class="header-status"><span id="networkStatus" class="status-dot">檢查連線</span><span>EPSG:3826</span></div>
  </header>
  <main class="app-shell">
    <aside class="workbench">
      <section id="coordinateView" class="view-panel" hidden>
        <div class="section-title"><span>01</span><div><h2>座標輸入</h2><p>混合文字也能直接辨識</p></div></div>
        <textarea id="rawInput" spellcheck="false">智聯工程科技顧問有限公司 24.124337779583556, 120.67646269974776</textarea>
        <div class="inline-controls"><label>輸入類型<select id="inputSystem"><option value="auto">自動判斷</option><option value="wgs84-latlon">WGS84（緯度, 經度）</option><option value="wgs84-lonlat">WGS84（經度, 緯度）</option><option value="twd97">TWD97（X, Y）</option></select></label><button id="sampleButton" class="ghost-button">載入範例</button></div>
        <div id="message" class="message" aria-live="polite"></div>

        <div class="section-title compact"><span>02</span><div><h2>辨識結果</h2><p id="resultCount">尚未辨識</p></div><button id="copyExcelTop" class="small-button">複製 Excel</button></div>
        <div class="table-wrap"><table><thead><tr><th>點位</th><th>WGS84</th><th>TWD97 X / Y</th><th></th></tr></thead><tbody id="resultRows"></tbody></table></div>

        <div class="section-title compact output-heading"><span>03</span><div><h2>輸出</h2><p>保留原文、表格或自訂句型</p></div></div>
        <div class="mode-tabs"><button data-mode="replace" class="mode-tab active">原文替換</button><button data-mode="table" class="mode-tab">Excel 表格</button><button data-mode="sentence" class="mode-tab">句型輸出</button></div>
        <div class="format-row"><label>XY 小數<select id="xyDecimals">${[0, 1, 2, 3].map((n) => `<option>${n}</option>`).join("")}</select></label><label>經緯度小數<select id="llDecimals">${[3, 4, 5, 6, 7].map((n) => `<option ${n === 6 ? "selected" : ""}>${n}</option>`).join("")}</select></label><label class="check"><input id="thousands" type="checkbox">千分位</label></div>
        <div id="replaceControls" class="mode-controls"><label>替換格式<input id="replacementTemplate" value="X:{x} Y:{y}"></label></div>
        <div id="tableControls" class="mode-controls" hidden><label class="check"><input id="includeHeader" type="checkbox" checked>包含欄位名稱</label></div>
        <div id="sentenceControls" class="mode-controls" hidden><label>格式範本<select id="templateSelect"><option value="route">(X, Y)~(X, Y)</option><option value="engineering">工程起迄格式</option><option value="lines">逐點 TWD97</option><option value="wgs84">逐點 WGS84</option><option value="custom">自訂格式</option></select></label><textarea id="templateInput" rows="2">${templates.route}</textarea></div>
        <div class="token-buttons"><button data-target="active" data-token="{label}">名稱</button><button data-target="active" data-token="{x}">X</button><button data-target="active" data-token="{y}">Y</button><button data-target="active" data-token="{lat}">緯度</button><button data-target="active" data-token="{lon}">經度</button></div>
        <div class="output-box"><pre id="formattedOutput"></pre><button id="copyButton" class="primary-button">複製結果</button></div>
      </section>

      <section id="editorView" class="view-panel">
        <div class="editor-intro"><span class="qgis-badge">QGIS 工作流</span><h2>輕量圖資編輯</h2><p>依近期工程及生態檢核專案建立的公司圖徵預設。成果可用 GeoJSON 與 QGIS 雙向交換。</p></div>
        <div class="editor-card">
          <h3>繪製與編修</h3>
          <div class="history-bar icon-toolbar" aria-label="編輯歷程"><button id="undoButton" class="icon-button" title="復原（Ctrl+Z）" aria-label="復原">↶</button><button id="redoButton" class="icon-button" title="重做（Ctrl+Y）" aria-label="重做">↷</button><button id="cancelEdit" class="icon-button" title="取消編輯（Esc）" aria-label="取消編輯">✕</button><button id="removeVertex" class="icon-button" title="取消上一點（Backspace）" aria-label="取消上一點">⌫</button></div>
          <div class="tool-grid"><button class="tool-button" data-tool="browse">拖曳圖面</button><button class="tool-button active" data-tool="select">選取</button><button class="tool-button" data-tool="modify">節點編修</button><button class="tool-button" data-tool="point">新增點</button><button class="tool-button" data-tool="line">新增線</button><button class="tool-button" data-tool="polygon">新增面</button></div>
          <label>公司圖徵樣式<select id="featurePreset">${Object.entries(featurePresets).map(([key, item]) => `<option value="${key}">${item.label}</option>`).join("")}</select></label>
          <p id="toolHint" class="hint">點選地圖上的工作圖徵以編輯屬性。</p>
        </div>
        <div class="editor-card properties-card">
          <div class="card-heading"><h3>圖徵屬性</h3><span id="geometryInfo">未選取</span></div>
          <label>名稱<input id="featureName" placeholder="請先選取圖徵" disabled></label>
          <label>備註<textarea id="featureNote" rows="2" placeholder="工程內容、調查說明或其他備註" disabled></textarea></label>
          <label>所屬圖層<select id="featureLayer" disabled></select></label>
          <div class="button-row"><button id="saveProperties" class="small-button" disabled>套用屬性</button><button id="deleteFeature" class="danger-button" disabled>刪除圖徵</button></div>
        </div>
        <div class="editor-card">
          <div class="card-heading"><h3>工作圖層</h3><span id="featureCount">0 筆圖徵</span></div>
          <div class="layer-actions"><button id="addGroup" class="icon-button" title="新增群組" aria-label="新增群組">▣＋</button><button id="addLayer" class="icon-button" title="新增圖層" aria-label="新增圖層">▤＋</button><label><input id="showWorkLabels" type="checkbox" checked>標籤</label></div>
          <div id="layerTree" class="layer-tree"></div>
          <p class="hint">勾選圖層名稱可作為布林運算輸入；點擊圖徵可選取，Ctrl＋點擊可複選。</p>
          <button id="fitFeatures" class="ghost-button">縮放至全部圖徵</button>
        </div>
        <div class="editor-card analysis-card">
          <h3>空間分析</h3>
          <div class="quick-buffer"><button class="preset-buffer" data-distance="100" data-preset="survey-area">建立調查範圍 100 m</button><button class="preset-buffer" data-distance="500" data-preset="inventory-area">建立盤點範圍 500 m</button></div>
          <div class="analysis-row"><label>Buffer 距離<input id="bufferDistance" type="number" min="0.1" step="1" value="1000"></label><label>單位<select id="bufferUnit"><option value="m">公尺</option><option value="km">公里</option></select></label><button id="runBuffer" class="small-button">建立環域</button></div>
          <div class="button-row"><button class="small-button boolean-button" data-operation="union">聯集 Union</button><button class="small-button boolean-button" data-operation="intersect">交集 Intersect</button><button class="small-button boolean-button" data-operation="difference">差集 Difference</button></div>
          <p id="booleanSelectionHint" class="hint">可勾選工作圖層作為運算輸入，或按住 Ctrl 複選至少兩個面圖徵；差集以圖層順序最前者為主體。</p>
        </div>
        <div class="editor-card tbn-card">
          <div class="card-heading"><h3>TBN 生態資料初篩</h3><span class="online-only">需連網</span></div>
          <p class="hint">以選取圖徵或其環域查詢 TBN v2.6 公開觀測紀錄；敏感物種座標已由 TBN 模糊化。單次最多取得 1,000 筆，匯出名錄會依物種彙整。</p>
          <div class="analysis-row"><label>線／點查詢半徑<select id="tbnRadius"><option value="0.1">100 m</option><option value="0.5">500 m</option><option value="1">1 km</option><option value="3" selected>3 km</option><option value="5">5 km</option><option value="10">10 km</option></select></label><label>觀測年份<input id="tbnYears" value="2016~2026"></label></div>
          <label>生物類群<select id="tbnGroup"><option value="">全部類群</option><option value="birds">鳥類</option><option value="mammals">哺乳類</option><option value="amphibians">兩棲類</option><option value="reptiles">爬行類</option><option value="fishes">魚類</option><option value="angiosperms">被子植物</option><option value="ferns">蕨類</option><option value="butterflies">蝶類</option><option value="dragonflies">蜻蛉類</option><option value="otherinsects">其他昆蟲</option></select></label>
          <div class="button-row wrap"><button id="queryTbn" class="small-button">查詢選取範圍</button><button id="exportTbnChecklist" class="small-button" disabled>匯出物種名錄 CSV</button><button id="clearTbn" class="ghost-button">清除結果</button></div>
          <div id="tbnStatus" class="tbn-status">尚未查詢。</div>
          <div id="tbnSummary" class="tbn-summary" hidden></div>
        </div>
        <div class="editor-card">
          <h3>資料交換</h3>
          <p class="hint">GeoJSON 使用 WGS84 儲存，匯入後自動投影到地圖；可再由 QGIS 另存為 EPSG:3826。</p>
          <div class="button-row wrap"><label class="file-button">匯入圖資<input id="spatialFile" type="file" accept=".geojson,.json,.kml,.zip,.shp,.shx,.dbf,.prj,.cpg" multiple hidden></label><select id="exportFormat" aria-label="匯出格式"><option value="geojson">GeoJSON</option><option value="kml">KML</option><option value="shp">Shapefile ZIP</option></select><button id="exportSpatial" class="small-button">匯出圖資</button><button id="clearFeatures" class="danger-button">清空工作圖層</button><button id="clearSession" class="danger-button">清除已保存工作階段</button></div>
          <button id="openLayout" class="small-button">建立圖面配置</button>
          <p class="hint">支援 GeoJSON、KML、ZIP Shapefile；散檔 Shapefile 請一次選取或拖入同名的 SHP、SHX、DBF、PRJ、CPG。</p>
        </div>
        <details class="editor-card shortcut-help">
          <summary>滑鼠與快捷鍵</summary>
          <div class="shortcut-grid"><kbd>Esc</kbd><span>取消目前繪製或編輯</span><kbd>Backspace</kbd><span>取消上一個繪製點位</span><kbd>Space</kbd><span>切換拖曳圖面</span><kbd>Ctrl + Z</kbd><span>回復上一步</span><kbd>Ctrl + Y</kbd><span>重做</span><kbd>Ctrl + A</kbd><span>全選工作圖徵</span><kbd>Ctrl + C / V</kbd><span>複製／貼上圖徵</span><kbd>Ctrl + 點擊</kbd><span>複選圖徵</span><kbd>Delete</kbd><span>刪除選取圖徵</span></div>
        </details>
      </section>
    </aside>

    <section class="map-workspace">
      <button id="toggleMenuBar" class="menu-toggle" title="顯示或隱藏功能列">☷</button><nav class="desktop-menu" aria-label="圖資功能選單"><button data-menu-action="import">檔案／匯入</button><button data-menu-action="undo">編輯／復原</button><button data-menu-action="fit">檢視／全圖</button><button data-menu-action="select">選取／全選</button></nav>
      <div class="map-topbar"><div><strong>圖資位置檢核</strong><span id="mapContext">座標成果預覽</span></div><div class="map-toolbar" aria-label="地圖工具列"><button data-map-tool="browse" title="拖曳圖面">✋</button><button data-map-tool="select" title="選取圖徵">⌖</button><button id="toolbarZoomAll" title="縮放至全部圖徵">⛶</button><button id="toolbarUndo" title="復原 Ctrl+Z">↶</button><button id="toolbarRedo" title="重做 Ctrl+Y">↷</button><button id="toolbarDelete" title="刪除選取圖徵">⌫</button></div><div class="map-controls"><select id="baseMap"><option value="emap">臺灣通用電子地圖</option><option value="photo">國土測繪中心正射影像</option><option value="google" disabled>Google Satellite（需官方 API 專案）</option></select><label><input id="showRegionalDrainage" type="checkbox">區域排水</label><label><input id="showResultLabels" type="checkbox" checked>點位標籤</label><label><input id="showResultLine" type="checkbox" checked>起迄連線</label></div></div>
      <div id="offlineNotice" class="offline-notice" hidden>目前離線：仍可轉換、編輯及匯出，底圖暫停載入。</div>
      <div id="map"><div id="mapTooltip" class="map-tooltip"></div><div id="fileDropOverlay" class="file-drop-overlay" hidden><strong>放開以新增圖資圖層</strong><span>GeoJSON · KML · ZIP／散檔 Shapefile</span></div></div>
      <div class="map-locator"><label for="locateInput">定位到：</label><input id="locateInput" placeholder="輸入經緯度或 TWD97 X, Y"><button id="locateButton">定位</button><span id="locateMessage">例：24.1243378, 120.6764627</span></div>
      <details class="coordinate-draw"><summary>⌖ 以座標新增點／線／面</summary><div><label>圖徵類型<select id="coordinateGeometry"><option value="Point">點</option><option value="LineString">線</option><option value="Polygon">面</option></select></label><label>座標（線、面請每行一組）<textarea id="coordinateGeometryInput" rows="3" placeholder="24.1243378, 120.6764627&#10;24.1250000, 120.6770000"></textarea></label><button id="addCoordinateGeometry">新增至目前圖層</button><span id="coordinateGeometryMessage"></span></div></details>
      <div class="map-status"><span id="cursorCoordinate">游標座標：—</span><span>專案基準：TWD97 / TM2 zone 121 · EPSG:3826</span></div>
    </section>
  </main>
  <div id="contextMenu" class="context-menu" role="menu" hidden></div>
  <dialog id="layoutDialog" class="layout-dialog"><form method="dialog"><div class="layout-settings"><h2>圖面配置</h2><label>圖名<input id="layoutTitle" value="工程圖資配置圖"></label><label>紙張<select id="layoutPaper"><option>A4 橫式</option><option>A4 直式</option></select></label><label><input id="layoutNorth" type="checkbox" checked>指北針</label><label><input id="layoutScale" type="checkbox" checked>比例尺</label><label><input id="layoutLegend" type="checkbox" checked>圖例</label><button id="exportLayout" type="button">匯出 PNG</button><button>關閉</button></div><div id="layoutSheet" class="layout-sheet"><h1 id="layoutTitlePreview">工程圖資配置圖</h1><div id="layoutMapPreview" class="layout-map-preview"></div><div id="northArrow" class="north-arrow">▲<small>N</small></div><div id="scaleBar" class="scale-bar"><span></span><b>比例尺依目前圖面</b></div><div id="layoutLegendPreview" class="layout-legend"></div><p>智聯工程科技顧問有限公司</p></div></form></dialog>
  <footer><div><strong>智聯工程科技顧問有限公司</strong><span>工程座標與輕量圖資工作台</span></div><details><summary>免責聲明與版權</summary><p>本工具提供座標整理、圖徵草繪及初步位置檢核，不替代測量、鑑界、設計、法定成果或 QGIS 正式品質管理。使用者應確認座標基準、分帶、資料來源與成果精度。底圖及參考圖資權利依原提供機關公告；連線底圖會向第三方圖資服務提出請求。</p><p>© 2026 智聯工程科技顧問有限公司。第三方套件及圖資依各自授權條款使用。</p></details></footer>`;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const rawInput = $("#rawInput") as HTMLTextAreaElement;
const inputSystem = $("#inputSystem") as HTMLSelectElement;
const message = $("#message") as HTMLDivElement;
const resultRows = $("#resultRows") as HTMLTableSectionElement;
const resultCount = $("#resultCount") as HTMLParagraphElement;
const templateSelect = $("#templateSelect") as HTMLSelectElement;
const templateInput = $("#templateInput") as HTMLTextAreaElement;
const replacementTemplate = $("#replacementTemplate") as HTMLInputElement;
const xyDecimals = $("#xyDecimals") as HTMLSelectElement;
const llDecimals = $("#llDecimals") as HTMLSelectElement;
const thousands = $("#thousands") as HTMLInputElement;
const includeHeader = $("#includeHeader") as HTMLInputElement;
const formattedOutput = $("#formattedOutput") as HTMLPreElement;
const featurePreset = $("#featurePreset") as HTMLSelectElement;
const featureName = $("#featureName") as HTMLInputElement;
const featureNote = $("#featureNote") as HTMLTextAreaElement;
const featureLayer = $("#featureLayer") as HTMLSelectElement;
const cursorCoordinate = $("#cursorCoordinate") as HTMLSpanElement;

interface LayerGroup { id: string; name: string; visible: boolean; order: number; }
let layerGroups: LayerGroup[] = [
  { id: "engineering", name: "工程圖資", visible: true, order: 0 },
  { id: "ecology", name: "生態與分析", visible: true, order: 1 },
];
let workLayers: LayerDefinition[] = [
  { id: "project", name: "工程圖徵", groupId: "engineering", visible: true, order: 0 },
  { id: "survey", name: "調查範圍", groupId: "ecology", visible: true, order: 1 },
  { id: "analysis", name: "分析成果", groupId: "ecology", visible: true, order: 2 },
];
let activeLayerId = "project";
const analysisLayerIds = new Set<string>();
const selectedLayerIds = new Set<string>(); const selectedGroupIds = new Set<string>(); let lastFeatureIndex = -1; let lastLayerIndex = -1;
let undoStack: string[] = [];
let redoStack: string[] = [];
let clipboardGeoJson = "";
let lastTbnRecords: TbnRecord[] = [];
let contextLayerId = "";
let contextFeature: Feature<Geometry> | null = null;
let contextLonLat: [number, number] | null = null;
const SESSION_KEY = "zhilian-geodesk-session-v1";

const map = createMap($("#map") as HTMLDivElement, $("#mapTooltip") as HTMLDivElement, {
  cursor: (lon, lat) => { const twd = convertPair({ first: lat, second: lon, sourceText: "" }, "wgs84-latlon", 0); cursorCoordinate.textContent = `游標：${lat.toFixed(6)}, ${lon.toFixed(6)} · X ${Math.round(twd.x).toLocaleString()} Y ${Math.round(twd.y).toLocaleString()}`; },
  selection: (features) => populateProperties(features[0] ?? null),
  changed: renderFeatureList,
  committed: recordState,
});
configureLayers(workLayers);
setActiveLayer(activeLayerId);

let converted: ConvertedCoordinate[] = [];
let outputMode: "replace" | "table" | "sentence" = "replace";
let activeView: "coordinate" | "editor" = "editor";
let editorMode: EditorMode = "select";

function escapeHtml(value: string): string { return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!); }
function saveSession(): void { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ version: 1, geojson: exportGeoJson(), layerGroups, workLayers, activeLayerId, showWorkLabels: (<HTMLInputElement>$("#showWorkLabels")).checked })); } catch (error) { console.warn("無法保存工作階段", error); } }
function restoreSession(): boolean { try { const saved = localStorage.getItem(SESSION_KEY); if (!saved) return false; const state = JSON.parse(saved); if (!Array.isArray(state.layerGroups) || !Array.isArray(state.workLayers) || typeof state.geojson !== "string") return false; layerGroups = state.layerGroups; workLayers = state.workLayers; activeLayerId = state.activeLayerId || workLayers[0]?.id || "project"; (<HTMLInputElement>$("#showWorkLabels")).checked = state.showWorkLabels !== false; replaceWorkGeoJson(state.geojson); applyLayerConfiguration(); return true; } catch (error) { console.warn("無法還原工作階段", error); return false; } }
function safeLayerId(name: string): string { const base = name.normalize("NFKC").replace(/[^\p{Letter}\p{Number}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "imported"; let id = base; let suffix = 2; while (workLayers.some((layer) => layer.id === id)) id = `${base}-${suffix++}`; return id; }
async function importSpatialFiles(files: FileList | File[]): Promise<void> {
  const datasets = await readSpatialFiles(files); if (!datasets.length) return;
  let total = 0; const warnings: string[] = [];
  for (const dataset of datasets) {
    const id = safeLayerId(dataset.name); workLayers.push({ id, name: dataset.name, groupId: layerGroups[0]?.id || "engineering", visible: true, order: workLayers.length });
    activeLayerId = id; setActiveLayer(id); configureLayers(workLayers);
    total += importGeoJson(undefined, dataset.geojson); warnings.push(...dataset.warnings.map((warning) => `${dataset.name}：${warning}`));
  }
  applyLayerConfiguration(); recordState(`匯入 ${datasets.length} 個圖層`); renderFeatureList(); fitWorkFeatures(map); saveSession();
  alert(`已新增 ${datasets.length} 個圖層，共 ${total} 筆圖徵。${warnings.length ? `\n\n注意：\n${warnings.join("\n")}` : ""}`);
}
function closeContextMenu(): void { (<HTMLElement>$("#contextMenu")).hidden = true; }
function removeFeatures(features = selectedFeatures()): void { if (!deleteFeatures(features)) return; recordState("刪除圖徵"); populateProperties(null); renderFeatureList(); saveSession(); }
function openContextMenu(event: MouseEvent, items: Array<{ action: string; icon: string; label: string; danger?: boolean; disabled?: boolean }>): void {
  event.preventDefault(); const menu = $("#contextMenu") as HTMLElement;
  menu.innerHTML = items.map((item) => `<button role="menuitem" data-context-action="${item.action}" class="${item.danger ? "danger" : ""}" ${item.disabled ? "disabled" : ""}><span aria-hidden="true">${item.icon}</span>${escapeHtml(item.label)}</button>`).join("");
  menu.hidden = false; menu.style.left = `${Math.min(event.clientX, window.innerWidth - 230)}px`; menu.style.top = `${Math.min(event.clientY, window.innerHeight - menu.offsetHeight - 12)}px`;
}
function numberOptions(): NumberFormatOptions { return { xyDecimals: Number(xyDecimals.value), llDecimals: Number(llDecimals.value), useThousands: thousands.checked }; }
function tableData(): string[][] { return createTableRows(converted, { ...numberOptions(), useThousands: false }); }
function tableText(withHeader = includeHeader.checked): string { const rows = tableData(); if (withHeader) rows.unshift(["點位", "WGS84 緯度", "WGS84 經度", "TWD97 X", "TWD97 Y"]); return rows.map((row) => row.join("\t")).join("\n"); }

async function copyText(text: string, button?: HTMLButtonElement): Promise<void> { await navigator.clipboard.writeText(text); if (button) flashButton(button, "已複製"); }
function flashButton(button: HTMLButtonElement, label: string): void { const original = button.textContent; button.textContent = label; setTimeout(() => { button.textContent = original; }, 1200); }
async function copyExcel(button?: HTMLButtonElement): Promise<void> { const plain = tableText(); try { const rows = tableData(); const html = `<table><thead><tr><th>點位</th><th>WGS84 緯度</th><th>WGS84 經度</th><th>TWD97 X</th><th>TWD97 Y</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`; await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([plain], { type: "text/plain" }), "text/html": new Blob([html], { type: "text/html" }) })]); } catch { await navigator.clipboard.writeText(plain); } if (button) flashButton(button, "已複製到 Excel"); }

function updateCoordinates(): void {
  const pairs = extractCoordinatePairs(rawInput.value); converted = []; const errors: string[] = [];
  pairs.forEach((pair, index) => { try { converted.push(convertPair(pair, inputSystem.value as CoordinateSystem, index)); } catch (error) { errors.push(`第 ${index + 1} 組：${(error as Error).message}`); } });
  message.className = `message ${!pairs.length ? "error" : errors.length ? "warning" : "success"}`;
  message.textContent = !pairs.length ? "找不到合理座標，請確認內容或指定輸入類型。" : errors.length ? errors.join("；") : `已擷取並驗證 ${converted.length} 組座標。`;
  resultCount.textContent = `辨識出 ${converted.length} 組有效座標`;
  resultRows.innerHTML = converted.map((point, index) => { const token = pointTokens(point, numberOptions()); return `<tr><td><strong>${escapeHtml(point.label)}</strong><small>${escapeHtml(point.sourceText ?? "")}</small></td><td>${token.lat}<br>${token.lon}</td><td>${token.x}<br>${token.y}</td><td><button class="icon-copy" data-copy="xy" data-index="${index}" title="複製 TWD97">複製</button></td></tr>`; }).join("");
  updateOutput(); showPoints(map, converted);
}

function updateOutput(): void { if (!converted.length) { formattedOutput.textContent = "請先輸入座標。"; return; } formattedOutput.textContent = outputMode === "replace" ? replaceCoordinatesInText(rawInput.value, converted, replacementTemplate.value, numberOptions()) : outputMode === "table" ? tableText() : renderTemplate(templateInput.value, converted, numberOptions()); }
function setOutputMode(mode: typeof outputMode): void { outputMode = mode; document.querySelectorAll<HTMLButtonElement>(".mode-tab").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode)); ($("#replaceControls") as HTMLElement).hidden = mode !== "replace"; ($("#tableControls") as HTMLElement).hidden = mode !== "table"; ($("#sentenceControls") as HTMLElement).hidden = mode !== "sentence"; ($("#copyButton") as HTMLButtonElement).textContent = mode === "table" ? "複製到 Excel" : "複製結果"; updateOutput(); }

function setView(view: typeof activeView): void { activeView = view; ($("#coordinateView") as HTMLElement).hidden = view !== "coordinate"; ($("#editorView") as HTMLElement).hidden = view !== "editor"; document.querySelectorAll<HTMLButtonElement>(".app-tab").forEach((button) => button.classList.toggle("active", button.dataset.view === view)); $("#mapContext").textContent = view === "coordinate" ? "座標成果預覽" : "公司工作圖層 · 草繪與屬性編輯"; setMapDisplay({ results: true, resultLabels: ($("#showResultLabels") as HTMLInputElement).checked, resultLine: ($("#showResultLine") as HTMLInputElement).checked }); requestAnimationFrame(() => map.updateSize()); }

function setTool(mode: EditorMode): void {
  editorMode = mode; document.querySelectorAll<HTMLButtonElement>(".tool-button").forEach((button) => button.classList.toggle("active", button.dataset.tool === mode));
  const hints: Record<EditorMode, string> = { browse: "平移及查看地圖。", select: "點選工作圖徵以編輯名稱、備註與樣式。", modify: "拖曳既有節點修改幾何；新位置會自動吸附。", point: "在地圖上點一下建立點位。", line: "依序點選線段節點，雙擊完成。", polygon: "依序點選範圍邊界，雙擊完成。" };
  $("#toolHint").textContent = hints[mode];
  setEditorMode(map, mode, featurePreset.value as FeaturePreset, {
    created: (feature) => { selectFeature(feature); populateProperties(feature); renderFeatureList(); requestAnimationFrame(() => recordState("新增圖徵")); if (mode === "point") setTool("select"); },
    modified: () => { recordState("修改幾何"); renderFeatureList(); populateProperties(selectedFeature()); },
  });
}

function populateProperties(feature: Feature<Geometry> | null): void {
  const disabled = !feature; featureName.disabled = disabled; featureNote.disabled = disabled; featureLayer.disabled = disabled; ($("#saveProperties") as HTMLButtonElement).disabled = disabled; ($("#deleteFeature") as HTMLButtonElement).disabled = disabled;
  if (!feature) { featureName.value = ""; featureNote.value = ""; $("#geometryInfo").textContent = "未選取"; return; }
  featureName.value = feature.get("name") || ""; featureNote.value = feature.get("note") || ""; featurePreset.value = feature.get("preset") || "project-area"; featureLayer.value = feature.get("layerId") || activeLayerId; const summary = featureSummary(feature); const count = selectedFeatures().length; $("#geometryInfo").textContent = count > 1 ? `已選取 ${count} 筆` : `${summary.type}${summary.measurement ? ` · ${summary.measurement}` : ""}`;
}

function renderFeatureList(): void {
  const features = getWorkFeatures(); $("#featureCount").textContent = `${features.length} 筆圖徵`;
  renderLayerTree();
}

function renderLayerTree(): void {
  const sortedGroups = [...layerGroups].sort((a, b) => a.order - b.order);
  $("#layerTree").innerHTML = sortedGroups.map((group) => {
    const layers = workLayers.filter((layer) => layer.groupId === group.id).sort((a, b) => a.order - b.order);
    return `<section class="layer-group" data-group-id="${group.id}" draggable="true"><div class="layer-group-heading"><span class="drag-handle">⋮⋮</span><label><input type="checkbox" data-group-visible="${group.id}" ${group.visible ? "checked" : ""}>${escapeHtml(group.name)}</label></div><div class="layer-dropzone" data-drop-group="${group.id}">${layers.map((layer) => { const items = getWorkFeatures().map((feature, index) => ({ feature, index })).filter(({ feature }) => feature.get("layerId") === layer.id); return `<div class="layer-node ${layer.id === activeLayerId ? "active" : ""}" draggable="true" data-layer-id="${layer.id}"><div class="layer-item"><span class="drag-handle">⋮⋮</span><button data-activate-layer="${layer.id}" title="設為目前圖層">${layer.id === activeLayerId ? "●" : "○"}</button><label class="analysis-layer-label" title="勾選作為布林運算輸入"><input type="checkbox" data-layer-analysis="${layer.id}" ${analysisLayerIds.has(layer.id) ? "checked" : ""}>${escapeHtml(layer.name)}</label><label class="visibility-toggle" title="顯示或隱藏"><input type="checkbox" data-layer-visible="${layer.id}" ${layer.visible && group.visible ? "checked" : ""}>◉</label><small>${items.length}</small></div><div class="layer-features">${items.map(({ feature, index }) => { const preset = featurePresets[(feature.get("preset") || "project-area") as FeaturePreset]; const summary = featureSummary(feature); return `<button class="feature-row" data-feature-index="${index}"><i style="--feature-color:${preset.color}"></i><span><strong>${escapeHtml(feature.get("name") || preset.label)}</strong><small>${summary.type}${summary.measurement ? ` · ${summary.measurement}` : ""}</small></span></button>`; }).join("") || '<p class="empty-layer">尚無圖徵</p>'}</div></div>`; }).join("") || '<p class="empty-layer">拖曳圖層到這裡</p>'}</div></section>`;
  }).join("");
  featureLayer.innerHTML = workLayers.sort((a, b) => a.order - b.order).map((layer) => `<option value="${layer.id}">${escapeHtml(layer.name)}</option>`).join("");
  if (selectedFeature()) featureLayer.value = selectedFeature()!.get("layerId") || activeLayerId;
  const chosen = [...analysisLayerIds].reduce((sum, id) => sum + layerFeatures(id).filter((feature) => feature.getGeometry()?.getType().includes("Polygon")).length, 0); $("#booleanSelectionHint").textContent = analysisLayerIds.size ? `已選 ${analysisLayerIds.size} 個圖層，共 ${chosen} 個面圖徵作為布林運算輸入。` : "可勾選工作圖層作為運算輸入，或按住 Ctrl 複選至少兩個面圖徵；差集以圖層順序最前者為主體。";
  selectedLayerIds.forEach((id) => $("#layerTree").querySelector(`[data-layer-id="${CSS.escape(id)}"]`)?.classList.add("selected")); selectedGroupIds.forEach((id) => $("#layerTree").querySelector(`[data-group-id="${CSS.escape(id)}"]`)?.classList.add("selected")); selectedFeatures().forEach((feature) => { const index = getWorkFeatures().indexOf(feature); $("#layerTree").querySelector(`[data-feature-index="${index}"]`)?.classList.add("selected"); });
}

function applyLayerConfiguration(): void {
  const groupVisibility = new Map(layerGroups.map((group) => [group.id, group.visible]));
  configureLayers(workLayers.map((layer) => ({ ...layer, visible: layer.visible && groupVisibility.get(layer.groupId) !== false })));
  setActiveLayer(activeLayerId);
  renderLayerTree();
}

function recordState(_label = "編輯"): void {
  const snapshot = exportGeoJson();
  if (undoStack.at(-1) === snapshot) return;
  undoStack.push(snapshot); if (undoStack.length > 60) undoStack.shift(); redoStack = []; updateHistoryButtons(); saveSession();
}
function updateHistoryButtons(): void { ($("#undoButton") as HTMLButtonElement).disabled = undoStack.length <= 1; ($("#redoButton") as HTMLButtonElement).disabled = !redoStack.length; }
function undo(): void { if (undoStack.length <= 1) return; const current = undoStack.pop()!; redoStack.push(current); replaceWorkGeoJson(undoStack.at(-1)!); populateProperties(null); renderFeatureList(); updateHistoryButtons(); }
function redo(): void { const next = redoStack.pop(); if (!next) return; replaceWorkGeoJson(next); undoStack.push(next); populateProperties(null); renderFeatureList(); updateHistoryButtons(); }

async function runBuffer(): Promise<void> {
  const feature = selectedGeoFeatures()[0]; if (!feature) { alert("請先選取一個點、線或面圖徵。"); return; }
  const value = Number((<HTMLInputElement>$("#bufferDistance")).value); const unit = (<HTMLSelectElement>$("#bufferUnit")).value; const meters = unit === "km" ? value * 1000 : value;
  try { const { bufferGeometry } = await import("./spatial"); const result = bufferGeometry(feature, meters); addGeoFeature(result, { preset: "impact-area", presetLabel: featurePresets["impact-area"].label, name: `${selectedFeature()?.get("name") || "圖徵"} Buffer ${value}${unit}`, note: `環域距離 ${meters} 公尺`, layerId: "analysis" }); recordState("建立環域"); renderFeatureList(); populateProperties(selectedFeature()); }
  catch (error) { alert((error as Error).message); }
}

async function runPresetBuffer(distance: number, preset: FeaturePreset): Promise<void> {
  const feature = selectedGeoFeatures()[0]; if (!feature) { alert("請先選取工程線位或工程範圍。"); return; }
  try { const { bufferGeometry } = await import("./spatial"); const result = bufferGeometry(feature, distance); const presetInfo = featurePresets[preset]; addGeoFeature(result, { preset, presetLabel: presetInfo.label, name: presetInfo.label.replace(/（.*）/, ""), note: `由選取圖徵建立 ${distance} 公尺環域`, layerId: "analysis" }); recordState(`建立 ${distance} m 環域`); renderFeatureList(); populateProperties(selectedFeature()); }
  catch (error) { alert((error as Error).message); }
}

async function runBoolean(operation: BooleanOperation): Promise<void> {
  try { const layerInput = [...analysisLayerIds].flatMap((id) => layerFeatures(id)).filter((feature) => feature.getGeometry()?.getType().includes("Polygon")); const inputs = layerInput.length ? JSON.parse(exportGeoJson(layerInput)).features : selectedGeoFeatures(); const { booleanGeometry } = await import("./spatial"); const result = booleanGeometry(inputs, operation); const labels: Record<BooleanOperation, string> = { union: "聯集", intersect: "交集", difference: "差集" }; addGeoFeature(result, { preset: "project-area", presetLabel: featurePresets["project-area"].label, name: `${labels[operation]}結果`, note: `由 ${inputs.length} 筆圖徵進行${labels[operation]}`, layerId: "analysis" }); recordState(labels[operation]); renderFeatureList(); populateProperties(selectedFeature()); }
  catch (error) { alert((error as Error).message); }
}

async function queryTbn(): Promise<void> {
  const selected = selectedGeoFeatures(); if (!selected.length) { alert("請先選取查詢用的點、線或面圖徵。"); return; }
  const radius = Number((<HTMLSelectElement>$("#tbnRadius")).value); const status = $("#tbnStatus"); const proxy = import.meta.env.VITE_TBN_PROXY as string | undefined;
  if (!proxy) { status.className = "tbn-status error"; status.innerHTML = 'TBN 官方 API 未開放瀏覽器跨網域讀取。本網站已完成代理介面，但部署前需設定 <code>VITE_TBN_PROXY</code>。'; return; }
  status.className = "tbn-status loading"; status.textContent = "正在向 TBN 查詢公開觀測紀錄…"; (<HTMLButtonElement>$("#queryTbn")).disabled = true;
  try {
    let spatialKey = ""; let spatialValue = ""; const first = selected[0];
    if (first.geometry.type === "Point") { spatialKey = "circle"; spatialValue = `${first.geometry.coordinates[0]} ${first.geometry.coordinates[1]},${radius}`; }
    else { const { bufferGeometry, polygonQueryValue } = await import("./spatial"); let polygon: PolygonFeature; if (first.geometry.type === "LineString" || first.geometry.type === "MultiLineString") polygon = bufferGeometry(first, radius * 1000); else polygon = first as PolygonFeature; spatialKey = "polygon"; spatialValue = polygonQueryValue(polygon); }
    const params = new URLSearchParams({ [spatialKey]: spatialValue, limit: "1000" }); const years = (<HTMLInputElement>$("#tbnYears")).value.trim(); const group = (<HTMLSelectElement>$("#tbnGroup")).value; if (years) params.set("year", years); if (group) params.set("taxonGroup", group);
    const response = await fetch(`${proxy}?${params}`); if (!response.ok) throw new Error(`TBN 查詢失敗（HTTP ${response.status}）`); const payload = await response.json(); if (payload.meta?.status !== "SUCCESS") throw new Error("TBN 回傳非成功狀態。"); lastTbnRecords = payload.data || []; const mapped = showTbnRecords(lastTbnRecords); renderTbnSummary(Number(payload.meta.total || lastTbnRecords.length), mapped); (<HTMLButtonElement>$("#exportTbnChecklist")).disabled = !lastTbnRecords.length; status.className = "tbn-status success"; status.textContent = `已取得 ${lastTbnRecords.length} 筆，本次地圖顯示 ${mapped} 筆有座標紀錄。`;
  } catch (error) { status.className = "tbn-status error"; status.textContent = `${(error as Error).message}；TBN服務可能暫時忙碌，請稍後重試。`; }
  finally { (<HTMLButtonElement>$("#queryTbn")).disabled = false; }
}

function renderTbnSummary(total: number, mapped: number): void {
  const species = new Set(lastTbnRecords.map((record) => record.vernacularName || record.simplifiedScientificName).filter(Boolean)); const protectedCount = lastTbnRecords.filter((record) => record.protectedStatusTW).length; const sensitiveCount = lastTbnRecords.filter((record) => record.sensitiveCategory && record.sensitiveCategory !== "無").length; const groups = new Map<string, number>(); lastTbnRecords.forEach((record) => { const key = String(record.taxonGroup || "未分類"); groups.set(key, (groups.get(key) || 0) + 1); }); const topGroups = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const summary = $("#tbnSummary"); (<HTMLElement>summary).hidden = false; summary.innerHTML = `<div><strong>${total.toLocaleString()}</strong><span>符合紀錄</span></div><div><strong>${species.size}</strong><span>本頁物種</span></div><div><strong>${protectedCount}</strong><span>保育類紀錄</span></div><div><strong>${sensitiveCount}</strong><span>模糊化紀錄</span></div><p>地圖座標 ${mapped} 筆 · ${topGroups.map(([name, count]) => `${escapeHtml(name)} ${count}`).join("、")}</p>`;
}

function csvCell(value: unknown): string { return `"${String(value ?? "").replace(/"/g, '""')}"`; }
function exportTbnChecklist(): void {
  if (!lastTbnRecords.length) { alert("目前沒有可匯出的 TBN 查詢結果。"); return; }
  const grouped = new Map<string, { record: TbnRecord; years: Set<string>; counties: Set<string>; count: number }>();
  lastTbnRecords.forEach((record) => { const scientific = String(record.simplifiedScientificName || record.scientificName || ""); const vernacular = String(record.vernacularName || ""); const key = `${scientific}|${vernacular}`; const item = grouped.get(key) || { record, years: new Set<string>(), counties: new Set<string>(), count: 0 }; if (record.year) item.years.add(String(record.year)); const place = `${record.county || ""}${record.municipality || ""}`; if (place) item.counties.add(place); item.count++; grouped.set(key, item); });
  const headers = ["中文名", "學名", "類群", "保育等級", "臺灣紅皮書", "敏感資料", "紀錄年份", "行政區", "資料集", "紀錄筆數", "授權"];
  const rows = [...grouped.values()].sort((a, b) => String(a.record.taxonGroup || "").localeCompare(String(b.record.taxonGroup || ""), "zh-Hant") || String(a.record.vernacularName || "").localeCompare(String(b.record.vernacularName || ""), "zh-Hant")).map(({ record, years, counties, count }) => [record.vernacularName, record.simplifiedScientificName || record.scientificName, record.taxonGroup, record.protectedStatusTW, record.categoryRedlistTW, record.sensitiveCategory, [...years].sort().join("、"), [...counties].sort().join("、"), record.datasetName, count, record.license]);
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}`; download(`TBN物種名錄_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8");
}

function download(name: string, content: BlobPart, type: string): void { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function captureMapCanvas(): HTMLCanvasElement { const size=map.getSize()!; const output=document.createElement("canvas"); output.width=size[0]; output.height=size[1]; const context=output.getContext("2d")!; document.querySelectorAll<HTMLCanvasElement>("#map .ol-layer canvas").forEach((canvas)=>{ if (!canvas.width) return; const opacity=Number(canvas.parentElement?.style.opacity||1); context.globalAlpha=opacity; const transform=canvas.style.transform.match(/^matrix\(([^)]+)\)$/)?.[1].split(",").map(Number); if(transform) context.setTransform(transform[0],transform[1],transform[2],transform[3],transform[4],transform[5]); context.drawImage(canvas,0,0); }); context.setTransform(1,0,0,1,0,0); context.globalAlpha=1; return output; }
function renderLayoutLegend(): void { const keys=[...new Set(getWorkFeatures().map((feature)=>feature.get("preset") as FeaturePreset))]; $("#layoutLegendPreview").innerHTML=keys.map((key)=>`<span><i style="--legend-color:${featurePresets[key]?.color||"#777"}"></i>${escapeHtml(featurePresets[key]?.label||key)}</span>`).join(""); }
function updateNetworkState(): void { const online = navigator.onLine; $("#networkStatus").textContent = online ? "圖資服務連線" : "離線編輯"; $("#networkStatus").className = `status-dot ${online ? "online" : "offline"}`; ($("#offlineNotice") as HTMLElement).hidden = online; }

rawInput.addEventListener("input", updateCoordinates); inputSystem.addEventListener("change", updateCoordinates);
[templateInput, replacementTemplate, xyDecimals, llDecimals, thousands, includeHeader].forEach((element) => element.addEventListener("input", updateCoordinates));
templateSelect.addEventListener("change", () => { if (templateSelect.value !== "custom") { templateInput.value = templates[templateSelect.value as keyof typeof templates]; updateOutput(); } });
document.querySelectorAll<HTMLButtonElement>(".app-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view as typeof activeView)));
$("#toggleWorkbench").addEventListener("click", () => { document.body.classList.toggle("workbench-collapsed"); requestAnimationFrame(() => map.updateSize()); });
$("#toggleHeader").addEventListener("click", () => { document.body.classList.toggle("header-collapsed"); requestAnimationFrame(() => map.updateSize()); });
const savedTheme = localStorage.getItem("zhilian-theme"); if (savedTheme) document.documentElement.dataset.theme = savedTheme;
$("#themeToggle").addEventListener("click", () => { const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; document.documentElement.dataset.theme = theme; localStorage.setItem("zhilian-theme", theme); });
document.querySelectorAll<HTMLButtonElement>("[data-menu-action]").forEach((button) => button.addEventListener("click", () => { const action = button.dataset.menuAction; if (action === "import") (<HTMLInputElement>$("#spatialFile")).click(); else if (action === "undo") undo(); else if (action === "fit") fitWorkFeatures(map); else if (action === "select") { selectAllFeatures(); populateProperties(selectedFeature()); } }));
document.querySelectorAll<HTMLButtonElement>(".mode-tab").forEach((button) => button.addEventListener("click", () => setOutputMode(button.dataset.mode as typeof outputMode)));
document.querySelectorAll<HTMLButtonElement>(".tool-button").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool as EditorMode)));
document.querySelectorAll<HTMLButtonElement>(".token-buttons button").forEach((button) => button.addEventListener("click", () => { const target = outputMode === "replace" ? replacementTemplate : templateInput; const start = target.selectionStart ?? target.value.length; target.setRangeText(button.dataset.token!, start, target.selectionEnd ?? start, "end"); target.focus(); updateOutput(); }));
resultRows.addEventListener("click", (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-copy]"); if (!button) return; const token = pointTokens(converted[Number(button.dataset.index)], numberOptions()); copyText(`${token.x}\t${token.y}`, button); });
$("#sampleButton").addEventListener("click", () => { rawInput.value = "智聯工程科技顧問有限公司 24.124337779583556, 120.67646269974776"; inputSystem.value = "auto"; updateCoordinates(); });
$("#copyExcelTop").addEventListener("click", (event) => copyExcel(event.currentTarget as HTMLButtonElement));
$("#copyButton").addEventListener("click", (event) => outputMode === "table" ? copyExcel(event.currentTarget as HTMLButtonElement) : copyText(formattedOutput.textContent ?? "", event.currentTarget as HTMLButtonElement));
function locateFromInput(): void { const input = (<HTMLInputElement>$("#locateInput")).value.trim(); const values = input.match(/-?\d+(?:\.\d+)?/g)?.map(Number); const notice = $("#locateMessage"); if (!values || values.length < 2) { notice.textContent = "請輸入兩個座標數值。"; return; } try { let lon: number; let lat: number; if (values[0] > 10000 && values[1] > 10000) { const point = convertPair({ first: values[0], second: values[1], sourceText: input }, "twd97", 7); lon = point.longitude; lat = point.latitude; notice.textContent = `TWD97 → ${lat.toFixed(7)}, ${lon.toFixed(7)}`; } else if (values[0] >= 20 && values[0] <= 27 && values[1] >= 118 && values[1] <= 123) { lat = values[0]; lon = values[1]; notice.textContent = `WGS84：${lat.toFixed(7)}, ${lon.toFixed(7)}`; } else if (values[1] >= 20 && values[1] <= 27 && values[0] >= 118 && values[0] <= 123) { lon = values[0]; lat = values[1]; notice.textContent = `WGS84：${lat.toFixed(7)}, ${lon.toFixed(7)}`; } else throw new Error("座標不在臺灣合理範圍內。"); locateMap(map, lon, lat); } catch (error) { notice.textContent = (error as Error).message; } }
function parseMapCoordinate(text: string): [number, number] { const values = text.match(/-?\d+(?:\.\d+)?/g)?.map(Number); if (!values || values.length < 2) throw new Error(`無法辨識座標：${text}`); if (values[0] > 10000 && values[1] > 10000) { const point = convertPair({ first: values[0], second: values[1], sourceText: text }, "twd97", 7); return [point.longitude, point.latitude]; } if (values[0] >= 20 && values[0] <= 27 && values[1] >= 118 && values[1] <= 123) return [values[1], values[0]]; if (values[1] >= 20 && values[1] <= 27 && values[0] >= 118 && values[0] <= 123) return [values[0], values[1]]; throw new Error(`座標不在臺灣合理範圍：${text}`); }
function addGeometryFromCoordinates(): void { const type = (<HTMLSelectElement>$("#coordinateGeometry")).value as "Point" | "LineString" | "Polygon"; const lines = (<HTMLTextAreaElement>$("#coordinateGeometryInput")).value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean); const notice = $("#coordinateGeometryMessage"); try { const coordinates = lines.map(parseMapCoordinate); if (type === "Point" && coordinates.length !== 1) throw new Error("點圖徵請輸入一組座標。"); if (type === "LineString" && coordinates.length < 2) throw new Error("線圖徵至少需要兩組座標。"); if (type === "Polygon" && coordinates.length < 3) throw new Error("面圖徵至少需要三組座標。"); const preset = featurePreset.value as FeaturePreset; const presetInfo = featurePresets[preset]; let geometry: { type: "Point"; coordinates: [number, number] } | { type: "LineString"; coordinates: [number, number][] } | { type: "Polygon"; coordinates: [number, number][][] }; if (type === "Point") geometry = { type, coordinates: coordinates[0] }; else if (type === "LineString") geometry = { type, coordinates }; else { const ring = [...coordinates]; if (ring[0][0] !== ring.at(-1)![0] || ring[0][1] !== ring.at(-1)![1]) ring.push([...ring[0]] as [number, number]); geometry = { type, coordinates: [ring] }; } addGeoFeature({ type: "Feature", properties: {}, geometry }, { preset, presetLabel: presetInfo.label, name: `${presetInfo.label}（座標新增）`, note: "由精確座標輸入建立", layerId: activeLayerId }); recordState("座標新增圖徵"); renderFeatureList(); populateProperties(selectedFeature()); fitFeatures(map, selectedFeatures()); notice.textContent = `已新增 ${type === "Point" ? "點" : type === "LineString" ? "線" : "面"}圖徵。`; } catch (error) { notice.textContent = (error as Error).message; } }
$("#locateButton").addEventListener("click", locateFromInput); $("#locateInput").addEventListener("keydown", (event) => { if ((event as KeyboardEvent).key === "Enter") locateFromInput(); });
$("#addCoordinateGeometry").addEventListener("click", addGeometryFromCoordinates);
$("#baseMap").addEventListener("change", (event) => setBaseMap((event.target as HTMLSelectElement).value as "emap" | "photo"));
document.querySelector<HTMLInputElement>("#showRegionalDrainage")?.addEventListener("change", (event) => setRegionalDrainageVisible(event.currentTarget.checked));
featurePreset.addEventListener("change", () => { const preset = featurePresets[featurePreset.value as FeaturePreset]; if (["point", "line", "polygon"].includes(editorMode)) { const nextMode = preset.geometry === "Point" ? "point" : preset.geometry === "LineString" ? "line" : "polygon"; setTool(nextMode); } });
$("#saveProperties").addEventListener("click", () => { updateSelected({ name: featureName.value.trim() || featurePresets[featurePreset.value as FeaturePreset].label, note: featureNote.value.trim(), preset: featurePreset.value as FeaturePreset, layerId: featureLayer.value }); recordState("修改屬性"); renderFeatureList(); populateProperties(selectedFeature()); });
$("#deleteFeature").addEventListener("click", () => removeFeatures());
$("#fitFeatures").addEventListener("click", () => fitWorkFeatures(map));
$("#exportSpatial").addEventListener("click", async () => { if (!getWorkFeatures().length) { alert("工作圖層目前沒有可匯出的圖徵。"); return; } const date = new Date().toISOString().slice(0, 10); const type = (<HTMLSelectElement>$("#exportFormat")).value; if (type === "kml") download(`智聯工程圖資_${date}.kml`, exportKml(), "application/vnd.google-earth.kml+xml;charset=utf-8"); else if(type==="shp") { const {zip}=await import("@mapbox/shp-write"); download(`智聯工程圖資_${date}.zip`,zip(JSON.parse(exportGeoJson()),{folder:"智聯工程圖資"}),"application/zip"); } else download(`智聯工程圖資_${date}.geojson`, exportGeoJson(), "application/geo+json;charset=utf-8"); });
$("#toggleMenuBar").addEventListener("click",()=>{ document.body.classList.toggle("menu-collapsed"); requestAnimationFrame(()=>map.updateSize()); });
$("#openLayout").addEventListener("click",()=>{ const canvas=captureMapCanvas(); $("#layoutMapPreview").setAttribute("style",`background-image:url(${canvas.toDataURL("image/png")})`); renderLayoutLegend(); (<HTMLDialogElement>$("#layoutDialog")).showModal(); });
$("#layoutTitle").addEventListener("input",()=>$("#layoutTitlePreview").textContent=(<HTMLInputElement>$("#layoutTitle")).value); ["layoutNorth","layoutScale","layoutLegend"].forEach((id)=>$(`#${id}`).addEventListener("change",()=>{ $(id==="layoutNorth"?"#northArrow":id==="layoutScale"?"#scaleBar":"#layoutLegendPreview").toggleAttribute("hidden",!(<HTMLInputElement>$(`#${id}`)).checked); }));
$("#exportLayout").addEventListener("click",()=>{ const mapCanvas=captureMapCanvas(); const canvas=document.createElement("canvas"); canvas.width=1600; canvas.height=1100; const c=canvas.getContext("2d")!; c.fillStyle="#fff"; c.fillRect(0,0,1600,1100); c.fillStyle="#183b35"; c.font="bold 42px sans-serif"; c.textAlign="center"; c.fillText((<HTMLInputElement>$("#layoutTitle")).value,800,65); c.drawImage(mapCanvas,70,100,1460,850); if((<HTMLInputElement>$("#layoutNorth")).checked){c.font="bold 58px sans-serif";c.fillText("▲",1440,180);c.font="bold 24px sans-serif";c.fillText("N",1440,215);} c.fillStyle="#111"; c.font="18px sans-serif"; c.textAlign="left"; c.fillText("智聯工程科技顧問有限公司",70,1060); canvas.toBlob((blob)=>blob&&download(`圖面配置_${new Date().toISOString().slice(0,10)}.png`,blob,"image/png")); });
$("#spatialFile").addEventListener("change", async (event) => { const input = event.target as HTMLInputElement; if (!input.files?.length) return; try { await importSpatialFiles(input.files); } catch (error) { alert(`無法匯入圖資：${(error as Error).message}`); } finally { input.value = ""; } });
const mapWorkspace = $(".map-workspace") as HTMLElement; const fileDropOverlay = $("#fileDropOverlay") as HTMLElement; let fileDragDepth = 0;
mapWorkspace.addEventListener("dragenter", (event) => { if (!event.dataTransfer?.types.includes("Files")) return; event.preventDefault(); fileDragDepth++; fileDropOverlay.hidden = false; mapWorkspace.classList.add("file-dragging"); });
mapWorkspace.addEventListener("dragover", (event) => { if (!event.dataTransfer?.types.includes("Files")) return; event.preventDefault(); event.dataTransfer.dropEffect = "copy"; });
mapWorkspace.addEventListener("dragleave", (event) => { if (!event.dataTransfer?.types.includes("Files")) return; fileDragDepth = Math.max(0, fileDragDepth - 1); if (!fileDragDepth) { fileDropOverlay.hidden = true; mapWorkspace.classList.remove("file-dragging"); } });
mapWorkspace.addEventListener("drop", async (event) => { if (!event.dataTransfer?.files.length) return; event.preventDefault(); event.stopPropagation(); fileDragDepth = 0; fileDropOverlay.hidden = true; mapWorkspace.classList.remove("file-dragging"); try { await importSpatialFiles(event.dataTransfer.files); } catch (error) { alert(`無法匯入圖資：${(error as Error).message}`); } });
$("#clearFeatures").addEventListener("click", () => { if (getWorkFeatures().length && confirm("確定清空目前工作圖層？可使用復原取回。")) { clearWorkFeatures(); recordState("清空工作圖層"); populateProperties(null); renderFeatureList(); } });
$("#clearSession").addEventListener("click", () => { if (confirm("確定清除本機保存的工作階段？目前畫面不會立即清空，但重新整理後不再自動還原。")) { localStorage.removeItem(SESSION_KEY); alert("已清除本機工作階段。若要保留目前內容，請先匯出 GeoJSON。"); } });
["showWorkLabels", "showResultLabels", "showResultLine"].forEach((id) => $(`#${id}`).addEventListener("change", () => setMapDisplay({ workLabels: ($("#showWorkLabels") as HTMLInputElement).checked, resultLabels: ($("#showResultLabels") as HTMLInputElement).checked, resultLine: ($("#showResultLine") as HTMLInputElement).checked })));

$("#undoButton").addEventListener("click", undo); $("#redoButton").addEventListener("click", redo);
document.querySelectorAll<HTMLButtonElement>("[data-map-tool]").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.mapTool as EditorMode)));
$("#toolbarZoomAll").addEventListener("click", () => fitWorkFeatures(map)); $("#toolbarUndo").addEventListener("click", undo); $("#toolbarRedo").addEventListener("click", redo); $("#toolbarDelete").addEventListener("click", () => removeFeatures());
$("#cancelEdit").addEventListener("click", () => { cancelEditorMode(map); setTool("select"); });
$("#removeVertex").addEventListener("click", () => { if (!removeLastDrawPoint()) alert("目前沒有正在繪製的線或面圖徵。"); });
$("#runBuffer").addEventListener("click", runBuffer);
document.querySelectorAll<HTMLButtonElement>(".preset-buffer").forEach((button) => button.addEventListener("click", () => runPresetBuffer(Number(button.dataset.distance), button.dataset.preset as FeaturePreset)));
document.querySelectorAll<HTMLButtonElement>(".boolean-button").forEach((button) => button.addEventListener("click", () => runBoolean(button.dataset.operation as BooleanOperation)));
$("#queryTbn").addEventListener("click", queryTbn); $("#exportTbnChecklist").addEventListener("click", exportTbnChecklist); $("#clearTbn").addEventListener("click", () => { clearTbnRecords(); lastTbnRecords = []; (<HTMLButtonElement>$("#exportTbnChecklist")).disabled = true; $("#tbnStatus").textContent = "已清除 TBN 查詢結果。"; (<HTMLElement>$("#tbnSummary")).hidden = true; });

$("#addGroup").addEventListener("click", () => { const name = prompt("新群組名稱：", "新群組"); if (!name?.trim()) return; const id = `group-${Date.now()}`; layerGroups.push({ id, name: name.trim(), visible: true, order: layerGroups.length }); renderLayerTree(); });
$("#addLayer").addEventListener("click", () => { const name = prompt("新圖層名稱：", "新工作圖層"); if (!name?.trim()) return; const groupId = layerGroups[0]?.id || "engineering"; const id = `layer-${Date.now()}`; workLayers.push({ id, name: name.trim(), groupId, visible: true, order: workLayers.length }); activeLayerId = id; applyLayerConfiguration(); });
let draggedLayerId = ""; let draggedGroupId = "";
$("#layerTree").addEventListener("change", (event) => { const target = event.target as HTMLInputElement; if (target.dataset.layerAnalysis) { target.checked ? analysisLayerIds.add(target.dataset.layerAnalysis) : analysisLayerIds.delete(target.dataset.layerAnalysis); renderLayerTree(); return; } if (target.dataset.layerVisible) { const layer = workLayers.find((item) => item.id === target.dataset.layerVisible); if (layer) layer.visible = target.checked; } if (target.dataset.groupVisible) { const group = layerGroups.find((item) => item.id === target.dataset.groupVisible); if (group) group.visible = target.checked; } applyLayerConfiguration(); saveSession(); });
$("#layerTree").addEventListener("click", (event) => { const mouse = event as MouseEvent; const target = event.target as HTMLElement; const featureButton = target.closest<HTMLButtonElement>("button[data-feature-index]"); if (featureButton) { const index = Number(featureButton.dataset.featureIndex); const features = getWorkFeatures(); if (mouse.shiftKey && lastFeatureIndex >= 0) { const [start, end] = [lastFeatureIndex, index].sort((a,b) => a-b); if (!mouse.ctrlKey && !mouse.metaKey) selectFeature(null); for (let i=start;i<=end;i++) if (!selectedFeatures().includes(features[i])) toggleFeatureSelection(features[i]); } else if (mouse.ctrlKey || mouse.metaKey) toggleFeatureSelection(features[index]); else selectFeature(features[index]); lastFeatureIndex=index; populateProperties(selectedFeature()); renderLayerTree(); return; }
  const layerNode = target.closest<HTMLElement>("[data-layer-id]"); if (layerNode && !target.closest("input,button,label,.drag-handle")) { const id=layerNode.dataset.layerId!; const ordered=workLayers.slice().sort((a,b)=>a.order-b.order); const index=ordered.findIndex((layer)=>layer.id===id); if (mouse.shiftKey && lastLayerIndex>=0) { const [start,end]=[lastLayerIndex,index].sort((a,b)=>a-b); if (!mouse.ctrlKey && !mouse.metaKey) selectedLayerIds.clear(); ordered.slice(start,end+1).forEach((layer)=>selectedLayerIds.add(layer.id)); } else { if (!mouse.ctrlKey && !mouse.metaKey) selectedLayerIds.clear(); selectedLayerIds.has(id)?selectedLayerIds.delete(id):selectedLayerIds.add(id); } lastLayerIndex=index; analysisLayerIds.clear(); selectedLayerIds.forEach((layerId)=>analysisLayerIds.add(layerId)); renderLayerTree(); return; }
  const groupNode=target.closest<HTMLElement>("[data-group-id]"); if (groupNode && target.closest(".layer-group-heading") && !target.closest("input,label,.drag-handle")) { const id=groupNode.dataset.groupId!; if (!mouse.ctrlKey && !mouse.metaKey) selectedGroupIds.clear(); selectedGroupIds.has(id)?selectedGroupIds.delete(id):selectedGroupIds.add(id); selectedLayerIds.clear(); workLayers.filter((layer)=>selectedGroupIds.has(layer.groupId)).forEach((layer)=>selectedLayerIds.add(layer.id)); analysisLayerIds.clear(); selectedLayerIds.forEach((layerId)=>analysisLayerIds.add(layerId)); renderLayerTree(); return; }
  const button = target.closest<HTMLButtonElement>("button[data-activate-layer]"); if (!button) return; activeLayerId = button.dataset.activateLayer!; setActiveLayer(activeLayerId); renderLayerTree(); saveSession(); });
$("#layerTree").addEventListener("dragstart", (event) => { const element = event.target as HTMLElement; draggedLayerId = element.closest<HTMLElement>("[data-layer-id]")?.dataset.layerId || ""; draggedGroupId = draggedLayerId ? "" : element.closest<HTMLElement>("[data-group-id]")?.dataset.groupId || ""; });
$("#layerTree").addEventListener("dragover", (event) => event.preventDefault());
$("#layerTree").addEventListener("drop", (event) => { event.preventDefault(); const target = event.target as HTMLElement; const targetGroup = target.closest<HTMLElement>("[data-drop-group]")?.dataset.dropGroup || target.closest<HTMLElement>("[data-group-id]")?.dataset.groupId; const targetLayer = target.closest<HTMLElement>("[data-layer-id]")?.dataset.layerId; if (draggedLayerId && targetGroup) { const layer = workLayers.find((item) => item.id === draggedLayerId); if (layer) { layer.groupId = targetGroup; const destination = workLayers.find((item) => item.id === targetLayer); layer.order = destination?.order ?? workLayers.length; workLayers.filter((item) => item.id !== layer.id && item.order >= layer.order).forEach((item) => item.order++); } } else if (draggedGroupId && targetGroup && draggedGroupId !== targetGroup) { const source = layerGroups.find((item) => item.id === draggedGroupId); const destination = layerGroups.find((item) => item.id === targetGroup); if (source && destination) { const old = source.order; source.order = destination.order; destination.order = old; } } draggedLayerId = ""; draggedGroupId = ""; applyLayerConfiguration(); saveSession(); });

$("#layerTree").addEventListener("contextmenu", (event) => {
  if ((event.target as HTMLElement).closest("[data-feature-index]")) return;
  const layerItem = (event.target as HTMLElement).closest<HTMLElement>("[data-layer-id]"); if (!layerItem) return; contextLayerId = layerItem.dataset.layerId!; const layer = workLayers.find((item) => item.id === contextLayerId)!;
  openContextMenu(event as MouseEvent, [{ action: "activate-layer", icon: "◎", label: "設為作用中圖層" }, { action: "zoom-layer", icon: "⌖", label: "縮放至圖層", disabled: !layerFeatures(contextLayerId).length }, { action: "select-layer", icon: "▣", label: "選取圖層全部圖徵", disabled: !layerFeatures(contextLayerId).length }, { action: "toggle-layer", icon: layer.visible ? "◉" : "○", label: layer.visible ? "隱藏圖層" : "顯示圖層" }, { action: "rename-layer", icon: "✎", label: "重新命名" }]);
});
$("#layerTree").addEventListener("contextmenu", (event) => {
  const row = (event.target as HTMLElement).closest<HTMLElement>("[data-feature-index]"); if (!row) return; contextFeature = getWorkFeatures()[Number(row.dataset.featureIndex)]; selectFeature(contextFeature); populateProperties(contextFeature);
  openContextMenu(event as MouseEvent, [{ action: "zoom-selection", icon: "⌖", label: "縮放至圖徵" }, { action: "copy-feature", icon: "⧉", label: "複製" }, { action: "duplicate-feature", icon: "＋", label: "複製一份" }, { action: "delete-feature", icon: "⌫", label: "刪除圖徵", danger: true }]);
});
$("#map").addEventListener("contextmenu", (event) => {
  if (finishDrawing()) { event.preventDefault(); recordState("完成繪製"); renderFeatureList(); return; }
  const mouseEvent = event as MouseEvent; const pixel = map.getEventPixel(mouseEvent); contextFeature = map.forEachFeatureAtPixel(pixel, (candidate) => candidate as Feature<Geometry>) ?? null; contextLonLat = toLonLat(map.getCoordinateFromPixel(pixel)) as [number, number];
  if (contextFeature?.get("layerId")) { selectFeature(contextFeature); populateProperties(contextFeature); openContextMenu(mouseEvent, [{ action: "zoom-selection", icon: "⌖", label: "縮放至圖徵" }, { action: "copy-feature", icon: "⧉", label: "複製圖徵" }, { action: "duplicate-feature", icon: "＋", label: "複製一份" }, { action: "delete-feature", icon: "⌫", label: "刪除圖徵", danger: true }]); return; }
  openContextMenu(mouseEvent, [{ action: "copy-coordinate", icon: "⊕", label: "複製此處 WGS84／TWD97" }, { action: "add-point-here", icon: "●", label: "在此新增點" }, { action: "paste-feature", icon: "▣", label: "貼上圖徵", disabled: !clipboardGeoJson }, { action: "zoom-all", icon: "⌗", label: "縮放至全部工作圖徵", disabled: !getWorkFeatures().length }]);
});
$("#contextMenu").addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-context-action]"); if (!button) return; const action = button.dataset.contextAction!; closeContextMenu();
  if (action === "activate-layer") { activeLayerId = contextLayerId; setActiveLayer(activeLayerId); renderLayerTree(); }
  else if (action === "zoom-layer") fitFeatures(map, layerFeatures(contextLayerId));
  else if (action === "select-layer") { selectLayerFeatures(contextLayerId); populateProperties(selectedFeature()); }
  else if (action === "toggle-layer") { const layer = workLayers.find((item) => item.id === contextLayerId); if (layer) { layer.visible = !layer.visible; applyLayerConfiguration(); } }
  else if (action === "rename-layer") { const layer = workLayers.find((item) => item.id === contextLayerId); const name = layer && prompt("圖層名稱：", layer.name); if (layer && name?.trim()) { layer.name = name.trim(); renderLayerTree(); } }
  else if (action === "zoom-selection" && contextFeature) fitFeatures(map, [contextFeature]);
  else if (action === "copy-feature" && contextFeature) { selectFeature(contextFeature); clipboardGeoJson = exportGeoJson([contextFeature]); await navigator.clipboard.writeText(clipboardGeoJson); }
  else if (action === "duplicate-feature" && contextFeature) { selectFeature(contextFeature); if (duplicateSelected()) { recordState("複製圖徵"); renderFeatureList(); } }
  else if (action === "delete-feature" && contextFeature) removeFeatures([contextFeature]);
  else if (action === "copy-coordinate" && contextLonLat) { const [lon, lat] = contextLonLat; const twd = convertPair({ first: lat, second: lon, sourceText: "" }, "wgs84-latlon", 0); await navigator.clipboard.writeText(`${lat.toFixed(7)}, ${lon.toFixed(7)}\t${Math.round(twd.x)}, ${Math.round(twd.y)}`); }
  else if (action === "add-point-here" && contextLonLat) { addGeoFeature({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: contextLonLat } }, { preset: "project-point", presetLabel: featurePresets["project-point"].label, name: "地圖新增點", note: "由地圖右鍵新增", layerId: activeLayerId }); recordState("地圖新增點"); renderFeatureList(); populateProperties(selectedFeature()); }
  else if (action === "paste-feature" && clipboardGeoJson) { importGeoJson(undefined, clipboardGeoJson); recordState("貼上圖徵"); renderFeatureList(); }
  else if (action === "zoom-all") fitWorkFeatures(map);
});
document.addEventListener("pointerdown", (event) => { if (!(event.target as HTMLElement).closest("#contextMenu")) closeContextMenu(); });
window.addEventListener("blur", closeContextMenu);

window.addEventListener("keydown", (event) => {
  if (activeView !== "editor" || ["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) return;
  if (event.key === "Escape") { event.preventDefault(); cancelEditorMode(map); setTool("select"); }
  else if (event.key === "Backspace") { event.preventDefault(); removeLastDrawPoint(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
  else if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z")) { event.preventDefault(); redo(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); selectAllFeatures(); populateProperties(selectedFeature()); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { event.preventDefault(); clipboardGeoJson = exportGeoJson(selectedFeatures()); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && clipboardGeoJson) { event.preventDefault(); importGeoJson(undefined, clipboardGeoJson); const imported = getWorkFeatures().slice(-JSON.parse(clipboardGeoJson).features.length); imported.forEach((feature) => { feature.getGeometry()?.translate(8, -8); feature.set("name", `${feature.get("name") || "圖徵"} 複本`); }); recordState("貼上圖徵"); renderFeatureList(); }
  else if ((event.key === "Delete" || event.key === "Del") && selectedFeatures().length) { event.preventDefault(); removeFeatures(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); if (duplicateSelected()) { recordState("複製圖徵"); renderFeatureList(); populateProperties(selectedFeature()); } }
  else if (event.key === " ") { event.preventDefault(); setTool("browse"); }
});
window.addEventListener("online", updateNetworkState); window.addEventListener("offline", updateNetworkState);
updateNetworkState(); updateCoordinates(); const restored = restoreSession(); renderFeatureList(); setTool("select"); recordState(restored ? "還原工作階段" : "初始狀態");
