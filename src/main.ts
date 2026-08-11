import "ol/ol.css";
import "./style.css";
import type Feature from "ol/Feature";
import type Geometry from "ol/geom/Geometry";
import { registerSW } from "virtual:pwa-register";
import { convertPair, type CoordinateSystem, type ConvertedCoordinate } from "./coordinate";
import { extractCoordinatePairs } from "./parser";
import { createTableRows, pointTokens, renderTemplate, replaceCoordinatesInText, templates, type NumberFormatOptions } from "./format";
import {
  clearWorkFeatures, createMap, deleteSelected, exportGeoJson, featurePresets, featureSummary, fitWorkFeatures,
  getWorkFeatures, importGeoJson, selectFeature, selectedFeature, setBaseMap, setEditorMode, setMapDisplay,
  showPoints, updateSelected, type EditorMode, type FeaturePreset,
} from "./map";

registerSW({ immediate: true });

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="app-header">
    <div class="brand-mark" aria-hidden="true">智</div>
    <div class="brand-copy"><p>智聯工程科技顧問有限公司</p><h1>智聯 GeoDesk</h1><span>工程座標與圖資工作台 · v0.3</span></div>
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
          <div class="tool-grid"><button class="tool-button active" data-tool="select">選取</button><button class="tool-button" data-tool="modify">節點編修</button><button class="tool-button" data-tool="point">新增點</button><button class="tool-button" data-tool="line">新增線</button><button class="tool-button" data-tool="polygon">新增面</button></div>
          <label>公司圖徵樣式<select id="featurePreset">${Object.entries(featurePresets).map(([key, item]) => `<option value="${key}">${item.label}</option>`).join("")}</select></label>
          <p id="toolHint" class="hint">點選地圖上的工作圖徵以編輯屬性。</p>
        </div>
        <div class="editor-card properties-card">
          <div class="card-heading"><h3>圖徵屬性</h3><span id="geometryInfo">未選取</span></div>
          <label>名稱<input id="featureName" placeholder="請先選取圖徵" disabled></label>
          <label>備註<textarea id="featureNote" rows="2" placeholder="工程內容、調查說明或其他備註" disabled></textarea></label>
          <div class="button-row"><button id="saveProperties" class="small-button" disabled>套用屬性</button><button id="deleteFeature" class="danger-button" disabled>刪除圖徵</button></div>
        </div>
        <div class="editor-card">
          <div class="card-heading"><h3>工作圖層</h3><span id="featureCount">0 筆圖徵</span></div>
          <div class="layer-toggles"><label><input id="showWork" type="checkbox" checked>工作圖徵</label><label><input id="showWorkLabels" type="checkbox" checked>標籤</label><label><input id="showResults" type="checkbox" checked>座標結果</label></div>
          <div id="featureList" class="feature-list"><p class="empty-state">尚未建立圖徵</p></div>
          <button id="fitFeatures" class="ghost-button">縮放至全部圖徵</button>
        </div>
        <div class="editor-card">
          <h3>資料交換</h3>
          <p class="hint">GeoJSON 使用 WGS84 儲存，匯入後自動投影到地圖；可再由 QGIS 另存為 EPSG:3826。</p>
          <div class="button-row wrap"><label class="file-button">匯入 GeoJSON<input id="geojsonFile" type="file" accept=".geojson,.json,application/geo+json" hidden></label><button id="exportGeoJson" class="small-button">匯出 GeoJSON</button><button id="clearFeatures" class="danger-button">清空工作圖層</button></div>
        </div>
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
const cursorCoordinate = $("#cursorCoordinate") as HTMLSpanElement;

const map = createMap($("#map") as HTMLDivElement, $("#mapTooltip") as HTMLDivElement, {
  cursor: (lon, lat) => { const twd = convertPair({ first: lat, second: lon, sourceText: "" }, "wgs84-latlon", 0); cursorCoordinate.textContent = `游標：${lat.toFixed(6)}, ${lon.toFixed(6)} · X ${Math.round(twd.x).toLocaleString()} Y ${Math.round(twd.y).toLocaleString()}`; },
  selection: populateProperties,
  changed: renderFeatureList,
});

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
  setEditorMode(map, mode, featurePreset.value as FeaturePreset, (feature) => { selectFeature(feature); populateProperties(feature); renderFeatureList(); setTool("select"); });
}

function populateProperties(feature: Feature<Geometry> | null): void {
  const disabled = !feature; featureName.disabled = disabled; featureNote.disabled = disabled; ($("#saveProperties") as HTMLButtonElement).disabled = disabled; ($("#deleteFeature") as HTMLButtonElement).disabled = disabled;
  if (!feature) { featureName.value = ""; featureNote.value = ""; $("#geometryInfo").textContent = "未選取"; return; }
  featureName.value = feature.get("name") || ""; featureNote.value = feature.get("note") || ""; featurePreset.value = feature.get("preset") || "project-area"; const summary = featureSummary(feature); $("#geometryInfo").textContent = `${summary.type}${summary.measurement ? ` · ${summary.measurement}` : ""}`;
}

function renderFeatureList(): void {
  const features = getWorkFeatures(); $("#featureCount").textContent = `${features.length} 筆圖徵`;
  $("#featureList").innerHTML = features.length ? features.map((feature, index) => { const preset = featurePresets[(feature.get("preset") || "project-area") as FeaturePreset]; const summary = featureSummary(feature); return `<button class="feature-row" data-feature-index="${index}"><i style="--feature-color:${preset.color}"></i><span><strong>${escapeHtml(feature.get("name") || preset.label)}</strong><small>${preset.label}${summary.measurement ? ` · ${summary.measurement}` : ""}</small></span></button>`; }).join("") : '<p class="empty-state">尚未建立圖徵</p>';
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
$("#featureList").addEventListener("click", (event) => { const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-feature-index]"); if (!button) return; const feature = getWorkFeatures()[Number(button.dataset.featureIndex)]; selectFeature(feature); populateProperties(feature); });
$("#sampleButton").addEventListener("click", () => { rawInput.value = "(1)起點(23.712,120.324)(2)終點(23.708,120.320)"; inputSystem.value = "auto"; updateCoordinates(); });
$("#copyExcelTop").addEventListener("click", (event) => copyExcel(event.currentTarget as HTMLButtonElement));
$("#copyButton").addEventListener("click", (event) => outputMode === "table" ? copyExcel(event.currentTarget as HTMLButtonElement) : copyText(formattedOutput.textContent ?? "", event.currentTarget as HTMLButtonElement));
$("#baseMap").addEventListener("change", (event) => setBaseMap((event.target as HTMLSelectElement).value as "emap" | "photo"));
featurePreset.addEventListener("change", () => { const preset = featurePresets[featurePreset.value as FeaturePreset]; if (["point", "line", "polygon"].includes(editorMode)) { const nextMode = preset.geometry === "Point" ? "point" : preset.geometry === "LineString" ? "line" : "polygon"; setTool(nextMode); } });
$("#saveProperties").addEventListener("click", () => { updateSelected({ name: featureName.value.trim() || featurePresets[featurePreset.value as FeaturePreset].label, note: featureNote.value.trim(), preset: featurePreset.value as FeaturePreset }); renderFeatureList(); populateProperties(selectedFeature()); });
$("#deleteFeature").addEventListener("click", () => { if (deleteSelected()) { populateProperties(null); renderFeatureList(); } });
$("#fitFeatures").addEventListener("click", () => fitWorkFeatures(map));
$("#exportGeoJson").addEventListener("click", () => { if (!getWorkFeatures().length) { alert("工作圖層目前沒有可匯出的圖徵。"); return; } download(`智聯工程圖資_${new Date().toISOString().slice(0, 10)}.geojson`, exportGeoJson(), "application/geo+json;charset=utf-8"); });
$("#geojsonFile").addEventListener("change", async (event) => { const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return; try { const count = importGeoJson(map, await file.text()); renderFeatureList(); alert(`已匯入 ${count} 筆圖徵。`); } catch (error) { alert(`無法匯入 GeoJSON：${(error as Error).message}`); } finally { input.value = ""; } });
$("#clearFeatures").addEventListener("click", () => { if (getWorkFeatures().length && confirm("確定清空目前工作圖層？此動作無法復原。")) { clearWorkFeatures(); populateProperties(null); renderFeatureList(); } });
["showWork", "showWorkLabels", "showResults", "showResultLabels", "showResultLine"].forEach((id) => $(`#${id}`).addEventListener("change", () => setMapDisplay({ work: ($("#showWork") as HTMLInputElement).checked, workLabels: ($("#showWorkLabels") as HTMLInputElement).checked, results: ($("#showResults") as HTMLInputElement).checked, resultLabels: ($("#showResultLabels") as HTMLInputElement).checked, resultLine: ($("#showResultLine") as HTMLInputElement).checked })));
window.addEventListener("online", updateNetworkState); window.addEventListener("offline", updateNetworkState);
updateNetworkState(); updateCoordinates(); renderFeatureList(); setTool("select");
