import "ol/ol.css";
import "./style.css";
import { convertPair, type CoordinateSystem, type ConvertedCoordinate } from "./coordinate";
import { extractCoordinatePairs } from "./parser";
import {
  createTableRows,
  pointTokens,
  renderTemplate,
  replaceCoordinatesInText,
  templates,
  type NumberFormatOptions,
} from "./format";
import { createMap, setBaseMap, setMapDisplay, showPoints } from "./map";
import { registerSW } from "virtual:pwa-register";

registerSW({ immediate: true });

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="masthead">
    <div><p class="eyebrow">TAIWAN COORDINATE DESK · v0.2</p><h1>座標轉換與<br><span>圖資檢核</span></h1><p class="lede">從雜訊文字找出座標，轉換、表格化並檢核位置。核心功能離線可用，地圖於連線時載入。</p></div>
    <div class="status-cluster"><span id="networkStatus" class="status-dot">檢查連線中</span><span class="crs-chip">TWD97 / TM2 121 · EPSG:3826</span></div>
  </header>
  <main>
    <section class="workspace">
      <div class="panel input-panel">
        <div class="step-heading"><b>01</b><div><h2>貼上原始內容</h2><p>前後文字保留，只擷取合理座標</p></div></div>
        <textarea id="rawInput" spellcheck="false">(1)起點(23.712,120.324)(2)終點(23.708,120.320)</textarea>
        <div class="toolbar"><label>輸入類型<select id="inputSystem"><option value="auto">自動判斷</option><option value="wgs84-latlon">WGS84（緯度, 經度）</option><option value="wgs84-lonlat">WGS84（經度, 緯度）</option><option value="twd97">TWD97（X, Y）</option></select></label><button id="sampleButton" class="text-button">載入範例</button></div>
        <div id="message" class="message" aria-live="polite"></div>
      </div>
      <div class="panel result-panel">
        <div class="result-heading"><div class="step-heading"><b>02</b><div><h2>確認辨識結果</h2><p id="resultCount">尚未辨識</p></div></div><button id="copyExcelTop" class="secondary-button">複製到 Excel</button></div>
        <div class="table-wrap"><table><thead><tr><th>點位</th><th>WGS84</th><th>TWD97 X / Y</th><th>快速複製</th></tr></thead><tbody id="resultRows"></tbody></table></div>
      </div>
    </section>
    <section class="output-grid">
      <div class="panel formatter-panel">
        <div class="step-heading"><b>03</b><div><h2>選擇輸出方式</h2><p>原文替換、Excel 表格或自訂句型</p></div></div>
        <div class="mode-tabs" role="tablist"><button data-mode="replace" class="mode-tab active">原文替換</button><button data-mode="table" class="mode-tab">Excel 表格</button><button data-mode="sentence" class="mode-tab">句型輸出</button></div>
        <div class="control-grid compact-controls"><label>XY 小數位<select id="xyDecimals">${[0, 1, 2, 3].map((n) => `<option>${n}</option>`).join("")}</select></label><label>經緯度小數位<select id="llDecimals">${[3, 4, 5, 6, 7].map((n) => `<option ${n === 6 ? "selected" : ""}>${n}</option>`).join("")}</select></label><label class="check-label"><input id="thousands" type="checkbox"> 文字輸出顯示千分位</label></div>
        <div id="replaceControls" class="mode-controls"><label>每組座標替換為<input id="replacementTemplate" value="X:{x} Y:{y}"></label><div class="token-buttons" data-target="replacementTemplate"><button data-token="{label}">點位名稱</button><button data-token="{x}">X</button><button data-token="{y}">Y</button><button data-token="{lat}">緯度</button><button data-token="{lon}">經度</button></div></div>
        <div id="tableControls" class="mode-controls" hidden><label class="check-label"><input id="includeHeader" type="checkbox" checked> 複製時包含標題列</label><p class="help">Excel 模式保留純數值，不加入千分位，貼上後可直接計算與排序。</p></div>
        <div id="sentenceControls" class="mode-controls" hidden><label>格式範本<select id="templateSelect"><option value="route">(X, Y)~(X, Y)</option><option value="engineering">工程起迄格式</option><option value="lines">逐點 TWD97</option><option value="wgs84">逐點 WGS84</option><option value="custom">自訂格式</option></select></label><label class="template-label">格式內容<textarea id="templateInput" rows="3">${templates.route}</textarea></label><div class="token-buttons" data-target="templateInput"><button data-token="{label}">點位名稱</button><button data-token="{x}">X</button><button data-token="{y}">Y</button><button data-token="{lat}">緯度</button><button data-token="{lon}">經度</button><button data-token="{1.x}">起點 X</button><button data-token="{1.y}">起點 Y</button><button data-token="{2.x}">終點 X</button><button data-token="{2.y}">終點 Y</button></div></div>
        <div class="output-box"><pre id="formattedOutput"></pre><button id="copyButton" class="primary-button">複製結果</button></div>
      </div>
      <div class="panel map-panel">
        <div class="map-heading"><div class="step-heading"><b>04</b><div><h2>圖資位置檢核</h2><p>移到點位即可查看座標</p></div></div><select id="baseMap"><option value="emap">臺灣通用電子地圖</option><option value="photo">正射影像</option></select></div>
        <div class="map-tools"><label><input id="showPoints" type="checkbox" checked> 點位</label><label><input id="showLabels" type="checkbox" checked> 標籤</label><label><input id="showLine" type="checkbox" checked> 連線</label><span id="cursorCoordinate">游標座標：—</span></div>
        <div id="map"><div id="mapTooltip" class="map-tooltip"></div></div>
        <div id="offlineMap" class="offline-map" hidden><strong>目前離線</strong><span>座標轉換仍可正常使用；恢復連線後即可載入底圖。</span></div>
        <p class="map-note">圖資僅供初步位置檢核，正式成果仍應以測量資料及主管機關公告為準。</p>
      </div>
    </section>
    <section class="legal-panel">
      <div><strong>智聯工程科技顧問有限公司</strong><span>臺灣座標轉換與圖資檢核工具 · v0.2</span></div>
      <details>
        <summary>使用聲明、圖資來源與版權說明</summary>
        <div class="legal-copy">
          <p>本工具提供座標擷取、格式轉換及圖面套疊功能，成果僅供業務整理與初步位置檢核，不構成測量、鑑界、設計或其他專業成果之替代。正式作業仍應以合格測量成果、現地調查及主管機關公告資料為準。</p>
          <p>使用者應自行確認輸入資料、座標系統、欄位順序、基準、分帶與輸出精度。因來源資料誤差、圖資更新時間差、網路服務中斷或使用方式所造成之差異，本工具不保證結果完全符合特定工程或法定用途。</p>
          <p>底圖與部分參考圖資來源為內政部國土測繪中心「國土測繪圖資服務雲」，相關圖資之權利與使用規範依原提供機關公告為準。本工具不預先大量下載或離線重製第三方圖磚。</p>
          <p>座標文字於使用者裝置內處理，不主動上傳；開啟圖資檢核時，瀏覽器會直接連線至第三方圖資服務。</p>
          <p>© 2026 智聯工程科技顧問有限公司。程式介面、原創文字與功能設計保留相關權利；第三方套件及圖資依各自授權條款使用。</p>
        </div>
      </details>
    </section>
  </main>
  <footer><span>智聯工程科技顧問有限公司</span><span>本機運算 · WGS84 ↔ TWD97 / TM2 zone 121</span></footer>`;

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
const networkStatus = $("#networkStatus") as HTMLSpanElement;
const offlineMap = $("#offlineMap") as HTMLDivElement;
const cursorCoordinate = $("#cursorCoordinate") as HTMLSpanElement;
const map = createMap($("#map") as HTMLDivElement, $("#mapTooltip") as HTMLDivElement, (lon, lat) => {
  cursorCoordinate.textContent = `游標座標：${lat.toFixed(6)}, ${lon.toFixed(6)}`;
});

let converted: ConvertedCoordinate[] = [];
let outputMode: "replace" | "table" | "sentence" = "replace";

function options(): NumberFormatOptions {
  return { xyDecimals: Number(xyDecimals.value), llDecimals: Number(llDecimals.value), useThousands: thousands.checked };
}

function tableData(includeThousands = false): string[][] {
  return createTableRows(converted, { ...options(), useThousands: includeThousands });
}

function tableText(withHeader = includeHeader.checked): string {
  const rows = tableData(false);
  if (withHeader) rows.unshift(["點位", "WGS84 緯度", "WGS84 經度", "TWD97 X", "TWD97 Y"]);
  return rows.map((row) => row.join("\t")).join("\n");
}

function tableHtml(withHeader = includeHeader.checked): string {
  const rows = tableData(false);
  const header = withHeader ? "<thead><tr><th>點位</th><th>WGS84 緯度</th><th>WGS84 經度</th><th>TWD97 X</th><th>TWD97 Y</th></tr></thead>" : "";
  return `<table>${header}<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

async function copyText(text: string, button?: HTMLButtonElement): Promise<void> {
  await navigator.clipboard.writeText(text);
  if (button) {
    const original = button.textContent;
    button.textContent = "已複製";
    setTimeout(() => (button.textContent = original), 1200);
  }
}

async function copyExcel(button?: HTMLButtonElement): Promise<void> {
  const plain = tableText();
  try {
    const item = new ClipboardItem({ "text/plain": new Blob([plain], { type: "text/plain" }), "text/html": new Blob([tableHtml()], { type: "text/html" }) });
    await navigator.clipboard.write([item]);
  } catch {
    await navigator.clipboard.writeText(plain);
  }
  if (button) {
    const original = button.textContent;
    button.textContent = "已複製到 Excel";
    setTimeout(() => (button.textContent = original), 1200);
  }
}

function update(): void {
  const pairs = extractCoordinatePairs(rawInput.value);
  converted = [];
  const errors: string[] = [];
  pairs.forEach((pair, index) => {
    try { converted.push(convertPair(pair, inputSystem.value as CoordinateSystem, index)); }
    catch (error) { errors.push(`第 ${index + 1} 組：${(error as Error).message}`); }
  });
  if (!pairs.length) {
    message.className = "message error";
    message.textContent = "找不到成對座標。請確認兩個數值之間有逗號、空格或分號。";
  } else if (errors.length) {
    message.className = "message warning";
    message.textContent = errors.join("；");
  } else {
    message.className = "message success";
    message.textContent = `已擷取並驗證 ${converted.length} 組座標。`;
  }
  resultCount.textContent = `辨識到 ${converted.length} 組有效座標`;
  resultRows.innerHTML = converted.map((point, index) => {
    const token = pointTokens(point, options());
    return `<tr><td><strong>${point.label}</strong><small>${point.sourceText ?? ""}</small></td><td>${token.lat}<br>${token.lon}</td><td>${token.x}<br>${token.y}</td><td><div class="quick-actions"><button data-copy="wgs" data-index="${index}">WGS84</button><button data-copy="xy" data-index="${index}">TWD97</button></div></td></tr>`;
  }).join("");
  updateOutput();
  showPoints(map, converted);
}

function updateOutput(): void {
  if (!converted.length) { formattedOutput.textContent = "等待有效座標…"; return; }
  formattedOutput.textContent = outputMode === "replace"
    ? replaceCoordinatesInText(rawInput.value, converted, replacementTemplate.value, options())
    : outputMode === "table"
      ? tableText()
      : renderTemplate(templateInput.value, converted, options());
}

function setOutputMode(mode: typeof outputMode): void {
  outputMode = mode;
  document.querySelectorAll<HTMLButtonElement>(".mode-tab").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  ($("#replaceControls") as HTMLElement).hidden = mode !== "replace";
  ($("#tableControls") as HTMLElement).hidden = mode !== "table";
  ($("#sentenceControls") as HTMLElement).hidden = mode !== "sentence";
  ($("#copyButton") as HTMLButtonElement).textContent = mode === "table" ? "複製到 Excel" : "複製結果";
  updateOutput();
}

function insertToken(target: HTMLInputElement | HTMLTextAreaElement, token: string): void {
  const start = target.selectionStart ?? target.value.length;
  const end = target.selectionEnd ?? start;
  target.setRangeText(token, start, end, "end");
  target.focus();
  target.dispatchEvent(new Event("input", { bubbles: true }));
}

function updateNetworkState(): void {
  const online = navigator.onLine;
  networkStatus.textContent = online ? "目前連線" : "離線模式";
  networkStatus.className = `status-dot ${online ? "online" : "offline"}`;
  offlineMap.hidden = online;
}

rawInput.addEventListener("input", update);
inputSystem.addEventListener("change", update);
[templateInput, replacementTemplate, xyDecimals, llDecimals, thousands, includeHeader].forEach((element) => element.addEventListener("input", update));
templateSelect.addEventListener("change", () => { if (templateSelect.value !== "custom") { templateInput.value = templates[templateSelect.value as keyof typeof templates]; updateOutput(); } });
templateInput.addEventListener("input", () => { templateSelect.value = "custom"; });
document.querySelectorAll<HTMLButtonElement>(".mode-tab").forEach((button) => button.addEventListener("click", () => setOutputMode(button.dataset.mode as typeof outputMode)));
document.querySelectorAll<HTMLElement>(".token-buttons").forEach((group) => group.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-token]");
  if (button) insertToken($(`#${group.dataset.target}`) as HTMLInputElement | HTMLTextAreaElement, button.dataset.token!);
}));
resultRows.addEventListener("click", async (event) => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-copy]");
  if (!button) return;
  const point = converted[Number(button.dataset.index)];
  const token = pointTokens(point, options());
  await copyText(button.dataset.copy === "wgs" ? `${token.lat}, ${token.lon}` : `${token.x}\t${token.y}`, button);
});
$("#sampleButton").addEventListener("click", () => { rawInput.value = "(1)起點(23.712,120.324)(2)終點(23.708,120.320)"; inputSystem.value = "auto"; update(); });
$("#copyExcelTop").addEventListener("click", (event) => copyExcel(event.currentTarget as HTMLButtonElement));
$("#copyButton").addEventListener("click", (event) => outputMode === "table" ? copyExcel(event.currentTarget as HTMLButtonElement) : copyText(formattedOutput.textContent ?? "", event.currentTarget as HTMLButtonElement));
$("#baseMap").addEventListener("change", (event) => setBaseMap((event.target as HTMLSelectElement).value as "emap" | "photo"));
["showPoints", "showLabels", "showLine"].forEach((id) => $(`#${id}`).addEventListener("change", () => setMapDisplay({ points: ($("#showPoints") as HTMLInputElement).checked, labels: ($("#showLabels") as HTMLInputElement).checked, line: ($("#showLine") as HTMLInputElement).checked })));
window.addEventListener("online", updateNetworkState);
window.addEventListener("offline", updateNetworkState);
updateNetworkState();
update();
