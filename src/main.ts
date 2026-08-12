import "ol/ol.css";
import "./style.css";
import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import { registerSW } from "virtual:pwa-register";
import { convertPair, type CoordinateSystem, type ConvertedCoordinate } from "./coordinate";
import { extractCoordinatePairs } from "./parser";
import { createTableRows, pointTokens, renderTemplate, replaceCoordinatesInText, templates, type NumberFormatOptions } from "./format";
import {
  addGeoFeature, cancelEditorMode, clearTbnRecords, clearWorkFeatures, configureLayers, createMap, deleteSelected,
  duplicateSelected, exportGeoJson, featurePresets, featureSummary, fitWorkFeatures, getWorkFeatures, importGeoJson,
  removeLastDrawPoint, replaceWorkGeoJson, selectAllFeatures, selectFeature, selectedFeature, selectedFeatures,
  selectedGeoFeatures, setActiveLayer, setBaseMap, setEditorMode, setMapDisplay, showPoints, showTbnRecords,
  toggleFeatureSelection, updateSelected, type EditorMode, type FeaturePreset, type LayerDefinition, type TbnRecord,
} from "./map";
import type { BooleanOperation, PolygonFeature } from "./spatial";

registerSW({ immediate: true });

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="app-header">
    <div class="brand-mark" aria-hidden="true">智</div>
    <div class="brand-copy"><p>智聯工程科技顧問有限公司</p><h1>智聯 GeoDesk</h1><span>工程座標與圖資工作台 · v0.4</span></div>
    <nav class="app-tabs" aria-label="工作模式"><button class="app-tab active" data-view="coordinate">座標轉換</button><button class="app-tab" data-view="editor">圖資編輯</button></nav>
    <div class="header-status"><span id="networkStatus" class="status-dot">檢查連線</span><span>EPSG:3826</span></div>
  </header>
  <main class="app-shell">
    <aside class="workbench">
      <section id="coordinateView" class="view-panel">
        <div class="section-title"><span>01</span><div><h2>座標輸入</h2><p>混合文字也能直接辨識</p></div></div>
        <textarea id="rawInput" spellcheck="false">(1)起點(23.712,120.324)(2)終點(23.708,120.320)</textarea>
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

      <section id="editorView" class="view-panel" hidden>
        <div class="editor-intro"><span class="qgis-badge">QGIS 工作流</span><h2>輕量圖資編輯</h2><p>依近期工程及生態檢核專案建立的公司圖徵預設。成果可用 GeoJSON 與 QGIS 雙向交換。</p></div>
        <div class="editor-card">
          <h3>繪製與編修</h3>
          <div class="history-bar"><button id="undoButton" title="Ctrl+Z">↶ 復原</button><button id="redoButton" title="Ctrl+Y">↷ 重做</button><button id="cancelEdit" title="Esc">取消編輯</button><button id="removeVertex" title="Backspace">取消上一點</button></div>
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
          <div class="layer-actions"><button id="addGroup">＋群組</button><button id="addLayer">＋圖層</button><label><input id="showWorkLabels" type="checkbox" checked>標籤</label></div>
          <div id="layerTree" class="layer-tree"></div>
          <div id="featureList" class="feature-list"><p class="empty-state">尚未建立圖徵</p></div>
          <button id="fitFeatures" class="ghost-button">縮放至全部圖徵</button>
        </div>
        <div class="editor-card analysis-card">
          <h3>空間分析</h3>
          <div class="analysis-row"><label>Buffer 距離<input id="bufferDistance" type="number" min="0.1" step="1" value="1000"></label><label>單位<select id="bufferUnit"><option value="m">公尺</option><option value="km">公里</option></select></label><button id="runBuffer" class="small-button">建立環域</button></div>
          <div class="button-row"><button class="small-button boolean-button" data-operation="union">聯集 Union</button><button class="small-button boolean-button" data-operation="intersect">交集 Intersect</button><button class="small-button boolean-button" data-operation="difference">差集 Difference</button></div>
          <p class="hint">Buffer 可套用於點、線、面；布林運算請按住 Ctrl 選取至少兩個面圖徵，差集以第一個選取圖徵為主體。</p>
        </div>
        <div class="editor-card tbn-card">
          <div class="card-heading"><h3>TBN 生態資料初篩</h3><span class="online-only">需連網</span></div>
          <p class="hint">以選取圖徵或其環域查詢 TBN v2.6 公開觀測紀錄；敏感物種座標已由 TBN 模糊化。</p>
          <div class="analysis-row"><label>線／點查詢半徑<select id="tbnRadius"><option value="1">1 km</option><option value="3" selected>3 km</option><option value="5">5 km</option><option value="10">10 km</option></select></label><label>觀測年份<input id="tbnYears" value="2016~2026"></label></div>
          <label>生物類群<select id="tbnGroup"><option value="">全部類群</option><option value="birds">鳥類</option><option value="mammals">哺乳類</option><option value="amphibians">兩棲類</option><option value="reptiles">爬行類</option><option value="fishes">魚類</option><option value="angiosperms">被子植物</option><option value="ferns">蕨類</option><option value="butterflies">蝶類</option><option value="dragonflies">蜻蛉類</option><option value="otherinsects">其他昆蟲</option></select></label>
          <div class="button-row"><button id="queryTbn" class="small-button">查詢選取範圍</button><button id="clearTbn" class="ghost-button">清除結果</button></div>
          <div id="tbnStatus" class="tbn-status">尚未查詢。</div>
          <div id="tbnSummary" class="tbn-summary" hidden></div>
        </div>
        <div class="editor-card">
          <h3>資料交換</h3>
          <p class="hint">GeoJSON 使用 WGS84 儲存，匯入後自動投影到地圖；可再由 QGIS 另存為 EPSG:3826。</p>
          <div class="button-row wrap"><label class="file-button">匯入 GeoJSON<input id="geojsonFile" type="file" accept=".geojson,.json,application/geo+json" hidden></label><button id="exportGeoJson" class="small-button">匯出 GeoJSON</button><button id="clearFeatures" class="danger-button">清空工作圖層</button></div>
        </div>
        <details class="editor-card shortcut-help">
          <summary>滑鼠與快捷鍵</summary>
          <div class="shortcut-grid"><kbd>Esc</kbd><span>取消目前繪製或編輯</span><kbd>Backspace</kbd><span>取消上一個繪製點位</span><kbd>Space</kbd><span>切換拖曳圖面</span><kbd>Ctrl + Z</kbd><span>回復上一步</span><kbd>Ctrl + Y</kbd><span>重做</span><kbd>Ctrl + A</kbd><span>全選工作圖徵</span><kbd>Ctrl + C / V</kbd><span>複製／貼上圖徵</span><kbd>Ctrl + 點擊</kbd><span>複選圖徵</span><kbd>Delete</kbd><span>刪除選取圖徵</span></div>
        </details>
      </section>
    </aside>

    <section class="map-workspace">
      <div class="map-topbar"><div><strong>圖資位置檢核</strong><span id="mapContext">座標成果預覽</span></div><div class="map-controls"><select id="baseMap"><option value="emap">臺灣通用電子地圖</option><option value="photo">正射影像</option></select><label><input id="showResultLabels" type="checkbox" checked>點位標籤</label><label><input id="showResultLine" type="checkbox" checked>起迄連線</label></div></div>
      <div id="offlineNotice" class="offline-notice" hidden>目前離線：仍可轉換、編輯及匯出，底圖暫停載入。</div>
      <div id="map"><div id="mapTooltip" class="map-tooltip"></div></div>
      <div class="map-status"><span id="cursorCoordinate">游標座標：—</span><span>專案基準：TWD97 / TM2 zone 121 · EPSG:3826</span></div>
    </section>
  </main>
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
let undoStack: string[] = [];
let redoStack: string[] = [];
let clipboardGeoJson = "";
let lastTbnRecords: TbnRecord[] = [];

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
let activeView: "coordinate" | "editor" = "coordinate";
let editorMode: EditorMode = "select";

function escapeHtml(value: string): string { return value.replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!); }
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
  $("#featureList").innerHTML = features.length ? features.map((feature, index) => { const preset = featurePresets[(feature.get("preset") || "project-area") as FeaturePreset]; const summary = featureSummary(feature); return `<button class="feature-row" data-feature-index="${index}"><i style="--feature-color:${preset.color}"></i><span><strong>${escapeHtml(feature.get("name") || preset.label)}</strong><small>${preset.label}${summary.measurement ? ` · ${summary.measurement}` : ""}</small></span></button>`; }).join("") : '<p class="empty-state">尚未建立圖徵</p>';
  renderLayerTree();
}

function renderLayerTree(): void {
  const sortedGroups = [...layerGroups].sort((a, b) => a.order - b.order);
  $("#layerTree").innerHTML = sortedGroups.map((group) => {
    const layers = workLayers.filter((layer) => layer.groupId === group.id).sort((a, b) => a.order - b.order);
    return `<section class="layer-group" data-group-id="${group.id}" draggable="true"><div class="layer-group-heading"><span class="drag-handle">⋮⋮</span><label><input type="checkbox" data-group-visible="${group.id}" ${group.visible ? "checked" : ""}>${escapeHtml(group.name)}</label></div><div class="layer-dropzone" data-drop-group="${group.id}">${layers.map((layer) => `<div class="layer-item ${layer.id === activeLayerId ? "active" : ""}" draggable="true" data-layer-id="${layer.id}"><span class="drag-handle">⋮⋮</span><button data-activate-layer="${layer.id}" title="設為目前圖層">${layer.id === activeLayerId ? "●" : "○"}</button><label><input type="checkbox" data-layer-visible="${layer.id}" ${layer.visible && group.visible ? "checked" : ""}>${escapeHtml(layer.name)}</label><small>${getWorkFeatures().filter((feature) => feature.get("layerId") === layer.id).length}</small></div>`).join("") || '<p class="empty-layer">拖曳圖層到這裡</p>'}</div></section>`;
  }).join("");
  featureLayer.innerHTML = workLayers.sort((a, b) => a.order - b.order).map((layer) => `<option value="${layer.id}">${escapeHtml(layer.name)}</option>`).join("");
  if (selectedFeature()) featureLayer.value = selectedFeature()!.get("layerId") || activeLayerId;
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
  undoStack.push(snapshot); if (undoStack.length > 60) undoStack.shift(); redoStack = []; updateHistoryButtons();
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

async function runBoolean(operation: BooleanOperation): Promise<void> {
  try { const { booleanGeometry } = await import("./spatial"); const result = booleanGeometry(selectedGeoFeatures(), operation); const labels: Record<BooleanOperation, string> = { union: "聯集", intersect: "交集", difference: "差集" }; addGeoFeature(result, { preset: "project-area", presetLabel: featurePresets["project-area"].label, name: `${labels[operation]}結果`, note: `由 ${selectedFeatures().length} 筆圖徵進行${labels[operation]}`, layerId: "analysis" }); recordState(labels[operation]); renderFeatureList(); populateProperties(selectedFeature()); }
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
    const params = new URLSearchParams({ [spatialKey]: spatialValue, limit: "300" }); const years = (<HTMLInputElement>$("#tbnYears")).value.trim(); const group = (<HTMLSelectElement>$("#tbnGroup")).value; if (years) params.set("year", years); if (group) params.set("taxonGroup", group);
    const response = await fetch(`${proxy}?${params}`); if (!response.ok) throw new Error(`TBN 查詢失敗（HTTP ${response.status}）`); const payload = await response.json(); if (payload.meta?.status !== "SUCCESS") throw new Error("TBN 回傳非成功狀態。"); lastTbnRecords = payload.data || []; const mapped = showTbnRecords(lastTbnRecords); renderTbnSummary(Number(payload.meta.total || lastTbnRecords.length), mapped); status.className = "tbn-status success"; status.textContent = `已取得 ${lastTbnRecords.length} 筆，本次地圖顯示 ${mapped} 筆有座標紀錄。`;
  } catch (error) { status.className = "tbn-status error"; status.textContent = `${(error as Error).message}；TBN服務可能暫時忙碌，請稍後重試。`; }
  finally { (<HTMLButtonElement>$("#queryTbn")).disabled = false; }
}

function renderTbnSummary(total: number, mapped: number): void {
  const species = new Set(lastTbnRecords.map((record) => record.vernacularName || record.simplifiedScientificName).filter(Boolean)); const protectedCount = lastTbnRecords.filter((record) => record.protectedStatusTW).length; const sensitiveCount = lastTbnRecords.filter((record) => record.sensitiveCategory && record.sensitiveCategory !== "無").length; const groups = new Map<string, number>(); lastTbnRecords.forEach((record) => { const key = String(record.taxonGroup || "未分類"); groups.set(key, (groups.get(key) || 0) + 1); }); const topGroups = [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const summary = $("#tbnSummary"); (<HTMLElement>summary).hidden = false; summary.innerHTML = `<div><strong>${total.toLocaleString()}</strong><span>符合紀錄</span></div><div><strong>${species.size}</strong><span>本頁物種</span></div><div><strong>${protectedCount}</strong><span>保育類紀錄</span></div><div><strong>${sensitiveCount}</strong><span>模糊化紀錄</span></div><p>地圖座標 ${mapped} 筆 · ${topGroups.map(([name, count]) => `${escapeHtml(name)} ${count}`).join("、")}</p>`;
}

function download(name: string, content: string, type: string): void { const url = URL.createObjectURL(new Blob([content], { type })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
function updateNetworkState(): void { const online = navigator.onLine; $("#networkStatus").textContent = online ? "圖資服務連線" : "離線編輯"; $("#networkStatus").className = `status-dot ${online ? "online" : "offline"}`; ($("#offlineNotice") as HTMLElement).hidden = online; }

rawInput.addEventListener("input", updateCoordinates); inputSystem.addEventListener("change", updateCoordinates);
[templateInput, replacementTemplate, xyDecimals, llDecimals, thousands, includeHeader].forEach((element) => element.addEventListener("input", updateCoordinates));
templateSelect.addEventListener("change", () => { if (templateSelect.value !== "custom") { templateInput.value = templates[templateSelect.value as keyof typeof templates]; updateOutput(); } });
document.querySelectorAll<HTMLButtonElement>(".app-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view as typeof activeView)));
document.querySelectorAll<HTMLButtonElement>(".mode-tab").forEach((button) => button.addEventListener("click", () => setOutputMode(button.dataset.mode as typeof outputMode)));
document.querySelectorAll<HTMLButtonElement>(".tool-button").forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool as EditorMode)));
document.querySelectorAll<HTMLButtonElement>(".token-buttons button").forEach((button) => button.addEventListener("click", () => { const target = outputMode === "replace" ? replacementTemplate : templateInput; const start = target.selectionStart ?? target.value.length; target.setRangeText(button.dataset.token!, start, target.selectionEnd ?? start, "end"); target.focus(); updateOutput(); }));
resultRows.addEventListener("click", (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-copy]"); if (!button) return; const token = pointTokens(converted[Number(button.dataset.index)], numberOptions()); copyText(`${token.x}\t${token.y}`, button); });
$("#featureList").addEventListener("click", (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-feature-index]"); if (!button) return; const feature = getWorkFeatures()[Number(button.dataset.featureIndex)]; if ((event as MouseEvent).ctrlKey || (event as MouseEvent).metaKey) toggleFeatureSelection(feature); else selectFeature(feature); populateProperties(selectedFeature()); });
$("#sampleButton").addEventListener("click", () => { rawInput.value = "(1)起點(23.712,120.324)(2)終點(23.708,120.320)"; inputSystem.value = "auto"; updateCoordinates(); });
$("#copyExcelTop").addEventListener("click", (event) => copyExcel(event.currentTarget as HTMLButtonElement));
$("#copyButton").addEventListener("click", (event) => outputMode === "table" ? copyExcel(event.currentTarget as HTMLButtonElement) : copyText(formattedOutput.textContent ?? "", event.currentTarget as HTMLButtonElement));
$("#baseMap").addEventListener("change", (event) => setBaseMap((event.target as HTMLSelectElement).value as "emap" | "photo"));
featurePreset.addEventListener("change", () => { const preset = featurePresets[featurePreset.value as FeaturePreset]; if (["point", "line", "polygon"].includes(editorMode)) { const nextMode = preset.geometry === "Point" ? "point" : preset.geometry === "LineString" ? "line" : "polygon"; setTool(nextMode); } });
$("#saveProperties").addEventListener("click", () => { updateSelected({ name: featureName.value.trim() || featurePresets[featurePreset.value as FeaturePreset].label, note: featureNote.value.trim(), preset: featurePreset.value as FeaturePreset, layerId: featureLayer.value }); recordState("修改屬性"); renderFeatureList(); populateProperties(selectedFeature()); });
$("#deleteFeature").addEventListener("click", () => { if (deleteSelected()) { recordState("刪除圖徵"); populateProperties(null); renderFeatureList(); } });
$("#fitFeatures").addEventListener("click", () => fitWorkFeatures(map));
$("#exportGeoJson").addEventListener("click", () => { if (!getWorkFeatures().length) { alert("工作圖層目前沒有可匯出的圖徵。"); return; } download(`智聯工程圖資_${new Date().toISOString().slice(0, 10)}.geojson`, exportGeoJson(), "application/geo+json;charset=utf-8"); });
$("#geojsonFile").addEventListener("change", async (event) => { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; try { const count = importGeoJson(map, await file.text()); recordState("匯入 GeoJSON"); renderFeatureList(); alert(`已匯入 ${count} 筆圖徵。`); } catch (error) { alert(`無法匯入 GeoJSON：${(error as Error).message}`); } finally { input.value = ""; } });
$("#clearFeatures").addEventListener("click", () => { if (getWorkFeatures().length && confirm("確定清空目前工作圖層？可使用復原取回。")) { clearWorkFeatures(); recordState("清空工作圖層"); populateProperties(null); renderFeatureList(); } });
["showWorkLabels", "showResultLabels", "showResultLine"].forEach((id) => $(`#${id}`).addEventListener("change", () => setMapDisplay({ workLabels: ($("#showWorkLabels") as HTMLInputElement).checked, resultLabels: ($("#showResultLabels") as HTMLInputElement).checked, resultLine: ($("#showResultLine") as HTMLInputElement).checked })));

$("#undoButton").addEventListener("click", undo); $("#redoButton").addEventListener("click", redo);
$("#cancelEdit").addEventListener("click", () => { cancelEditorMode(map); setTool("select"); });
$("#removeVertex").addEventListener("click", () => { if (!removeLastDrawPoint()) alert("目前沒有正在繪製的線或面圖徵。"); });
$("#runBuffer").addEventListener("click", runBuffer);
document.querySelectorAll<HTMLButtonElement>(".boolean-button").forEach((button) => button.addEventListener("click", () => runBoolean(button.dataset.operation as BooleanOperation)));
$("#queryTbn").addEventListener("click", queryTbn); $("#clearTbn").addEventListener("click", () => { clearTbnRecords(); lastTbnRecords = []; $("#tbnStatus").textContent = "已清除 TBN 查詢結果。"; (<HTMLElement>$("#tbnSummary")).hidden = true; });

$("#addGroup").addEventListener("click", () => { const name = prompt("新群組名稱：", "新群組"); if (!name?.trim()) return; const id = `group-${Date.now()}`; layerGroups.push({ id, name: name.trim(), visible: true, order: layerGroups.length }); renderLayerTree(); });
$("#addLayer").addEventListener("click", () => { const name = prompt("新圖層名稱：", "新工作圖層"); if (!name?.trim()) return; const groupId = layerGroups[0]?.id || "engineering"; const id = `layer-${Date.now()}`; workLayers.push({ id, name: name.trim(), groupId, visible: true, order: workLayers.length }); activeLayerId = id; applyLayerConfiguration(); });
let draggedLayerId = ""; let draggedGroupId = "";
$("#layerTree").addEventListener("change", (event) => { const target = event.target as HTMLInputElement; if (target.dataset.layerVisible) { const layer = workLayers.find((item) => item.id === target.dataset.layerVisible); if (layer) layer.visible = target.checked; } if (target.dataset.groupVisible) { const group = layerGroups.find((item) => item.id === target.dataset.groupVisible); if (group) group.visible = target.checked; } applyLayerConfiguration(); });
$("#layerTree").addEventListener("click", (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-activate-layer]"); if (!button) return; activeLayerId = button.dataset.activateLayer!; setActiveLayer(activeLayerId); renderLayerTree(); });
$("#layerTree").addEventListener("dragstart", (event) => { const element = event.target as HTMLElement; draggedLayerId = element.closest<HTMLElement>("[data-layer-id]")?.dataset.layerId || ""; draggedGroupId = draggedLayerId ? "" : element.closest<HTMLElement>("[data-group-id]")?.dataset.groupId || ""; });
$("#layerTree").addEventListener("dragover", (event) => event.preventDefault());
$("#layerTree").addEventListener("drop", (event) => { event.preventDefault(); const target = event.target as HTMLElement; const targetGroup = target.closest<HTMLElement>("[data-drop-group]")?.dataset.dropGroup || target.closest<HTMLElement>("[data-group-id]")?.dataset.groupId; const targetLayer = target.closest<HTMLElement>("[data-layer-id]")?.dataset.layerId; if (draggedLayerId && targetGroup) { const layer = workLayers.find((item) => item.id === draggedLayerId); if (layer) { layer.groupId = targetGroup; const destination = workLayers.find((item) => item.id === targetLayer); layer.order = destination?.order ?? workLayers.length; workLayers.filter((item) => item.id !== layer.id && item.order >= layer.order).forEach((item) => item.order++); } } else if (draggedGroupId && targetGroup && draggedGroupId !== targetGroup) { const source = layerGroups.find((item) => item.id === draggedGroupId); const destination = layerGroups.find((item) => item.id === targetGroup); if (source && destination) { const old = source.order; source.order = destination.order; destination.order = old; } } draggedLayerId = ""; draggedGroupId = ""; applyLayerConfiguration(); });

window.addEventListener("keydown", (event) => {
  if (activeView !== "editor" || ["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) return;
  if (event.key === "Escape") { event.preventDefault(); cancelEditorMode(map); setTool("select"); }
  else if (event.key === "Backspace") { event.preventDefault(); removeLastDrawPoint(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && !event.shiftKey) { event.preventDefault(); undo(); }
  else if (((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") || ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "z")) { event.preventDefault(); redo(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") { event.preventDefault(); selectAllFeatures(); populateProperties(selectedFeature()); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c") { event.preventDefault(); clipboardGeoJson = exportGeoJson(selectedFeatures()); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v" && clipboardGeoJson) { event.preventDefault(); importGeoJson(undefined, clipboardGeoJson); const imported = getWorkFeatures().slice(-JSON.parse(clipboardGeoJson).features.length); imported.forEach((feature) => { feature.getGeometry()?.translate(8, -8); feature.set("name", `${feature.get("name") || "圖徵"} 複本`); }); recordState("貼上圖徵"); renderFeatureList(); }
  else if ((event.key === "Delete" || event.key === "Del") && selectedFeatures().length) { event.preventDefault(); deleteSelected(); recordState("刪除圖徵"); populateProperties(null); renderFeatureList(); }
  else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") { event.preventDefault(); if (duplicateSelected()) { recordState("複製圖徵"); renderFeatureList(); populateProperties(selectedFeature()); } }
  else if (event.key === " ") { event.preventDefault(); setTool("browse"); }
});
window.addEventListener("online", updateNetworkState); window.addEventListener("offline", updateNetworkState);
updateNetworkState(); updateCoordinates(); renderFeatureList(); setTool("select"); recordState("初始狀態");
