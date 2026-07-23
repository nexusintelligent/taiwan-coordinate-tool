import "ol/ol.css";
import "./style.css";
import { convertPair, type CoordinateSystem, type ConvertedCoordinate } from "./coordinate";
import { extractCoordinatePairs } from "./parser";
import { renderTemplate, templates, type RoundingMode } from "./format";
import { createMap, setBaseMap, showPoints } from "./map";
import { registerSW } from "virtual:pwa-register";

registerSW({ immediate: true });

const app = document.querySelector<HTMLDivElement>("#app")!;

app.innerHTML = `
  <header class="masthead">
    <div>
      <p class="eyebrow">TAIWAN COORDINATE DESK</p>
      <h1>座標轉換與<br><span>圖資檢核</span></h1>
      <p class="lede">從一段雜訊文字中找出座標、完成轉換並套用業務格式。核心功能離線可用，地圖於連線時載入。</p>
    </div>
    <div class="status-cluster">
      <span id="networkStatus" class="status-dot">檢查連線中</span>
      <span class="crs-chip">TWD97 / TM2 121 · EPSG:3826</span>
    </div>
  </header>

  <main>
    <section class="workspace">
      <div class="panel input-panel">
        <div class="step-heading"><b>01</b><div><h2>貼上原始內容</h2><p>系統只擷取合理的座標組合</p></div></div>
        <textarea id="rawInput" spellcheck="false">(1)起點(23.712,120.324)(2)終點(23.708,120.320)</textarea>
        <div class="toolbar">
          <label>輸入類型
            <select id="inputSystem">
              <option value="auto">自動判斷</option>
              <option value="wgs84-latlon">WGS84（緯度, 經度）</option>
              <option value="wgs84-lonlat">WGS84（經度, 緯度）</option>
              <option value="twd97">TWD97（X, Y）</option>
            </select>
          </label>
          <button id="sampleButton" class="text-button">載入範例</button>
        </div>
        <div id="message" class="message" aria-live="polite"></div>
      </div>

      <div class="panel result-panel">
        <div class="step-heading"><b>02</b><div><h2>確認辨識結果</h2><p id="resultCount">尚未辨識</p></div></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>點位</th><th>WGS84</th><th>TWD97 X / Y</th><th>狀態</th></tr></thead>
            <tbody id="resultRows"></tbody>
          </table>
        </div>
      </div>
    </section>

    <section class="output-grid">
      <div class="panel formatter-panel">
        <div class="step-heading"><b>03</b><div><h2>設定輸出格式</h2><p>選用範本或直接修改</p></div></div>
        <div class="control-grid">
          <label>格式範本
            <select id="templateSelect">
              <option value="route">(X, Y)~(X, Y)</option>
              <option value="engineering">工程起迄格式</option>
              <option value="lines">逐點 TWD97</option>
              <option value="wgs84">逐點 WGS84</option>
              <option value="custom">自訂格式</option>
            </select>
          </label>
          <label>XY 小數位
            <select id="xyDecimals">${[0, 1, 2, 3].map((n) => `<option>${n}</option>`).join("")}</select>
          </label>
          <label>經緯度小數位
            <select id="llDecimals">${[3, 4, 5, 6, 7].map((n) => `<option ${n === 6 ? "selected" : ""}>${n}</option>`).join("")}</select>
          </label>
          <label>數值處理
            <select id="rounding">
              <option value="round">四捨五入</option>
              <option value="floor">無條件捨去</option>
              <option value="ceil">無條件進位</option>
            </select>
          </label>
        </div>
        <label class="template-label">格式內容
          <textarea id="templateInput" rows="3">${templates.route}</textarea>
        </label>
        <p class="token-help">變數：{x} {y} {lat} {lon} {label}，指定點位請用 {1.x}、{2.y}</p>
        <div class="output-box">
          <pre id="formattedOutput"></pre>
          <button id="copyButton" class="primary-button">複製結果</button>
        </div>
      </div>

      <div class="panel map-panel">
        <div class="map-heading">
          <div class="step-heading"><b>04</b><div><h2>圖資位置檢核</h2><p>國土測繪圖資服務雲</p></div></div>
          <select id="baseMap">
            <option value="emap">臺灣通用電子地圖</option>
            <option value="photo">正射影像</option>
          </select>
        </div>
        <div id="map"></div>
        <div id="offlineMap" class="offline-map" hidden>
          <strong>目前離線</strong>
          <span>座標轉換仍可正常使用；恢復連線後即可載入底圖。</span>
        </div>
        <p class="map-note">圖資僅供初步位置檢核，正式成果仍應以測量資料及主管機關公告為準。</p>
      </div>
    </section>
  </main>

  <footer><span>本機運算 · 不上傳輸入文字</span><span>WGS84 ↔ TWD97 / TM2 zone 121</span></footer>
`;

const rawInput = document.querySelector<HTMLTextAreaElement>("#rawInput")!;
const inputSystem = document.querySelector<HTMLSelectElement>("#inputSystem")!;
const message = document.querySelector<HTMLDivElement>("#message")!;
const resultRows = document.querySelector<HTMLTableSectionElement>("#resultRows")!;
const resultCount = document.querySelector<HTMLParagraphElement>("#resultCount")!;
const templateSelect = document.querySelector<HTMLSelectElement>("#templateSelect")!;
const templateInput = document.querySelector<HTMLTextAreaElement>("#templateInput")!;
const xyDecimals = document.querySelector<HTMLSelectElement>("#xyDecimals")!;
const llDecimals = document.querySelector<HTMLSelectElement>("#llDecimals")!;
const rounding = document.querySelector<HTMLSelectElement>("#rounding")!;
const formattedOutput = document.querySelector<HTMLPreElement>("#formattedOutput")!;
const networkStatus = document.querySelector<HTMLSpanElement>("#networkStatus")!;
const offlineMap = document.querySelector<HTMLDivElement>("#offlineMap")!;
const map = createMap(document.querySelector<HTMLDivElement>("#map")!);

let converted: ConvertedCoordinate[] = [];

function update(): void {
  const pairs = extractCoordinatePairs(rawInput.value);
  converted = [];
  const errors: string[] = [];

  pairs.forEach((pair, index) => {
    try {
      converted.push(convertPair(pair, inputSystem.value as CoordinateSystem, index));
    } catch (error) {
      errors.push(`第 ${index + 1} 組：${(error as Error).message}`);
    }
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
  resultRows.innerHTML = converted
    .map(
      (point) => `
      <tr>
        <td><strong>${point.label}</strong><small>${point.sourceText ?? ""}</small></td>
        <td>${point.latitude.toFixed(6)}<br>${point.longitude.toFixed(6)}</td>
        <td>${Math.round(point.x).toLocaleString()}<br>${Math.round(point.y).toLocaleString()}</td>
        <td><span class="valid">有效</span></td>
      </tr>`,
    )
    .join("");

  updateOutput();
  showPoints(map, converted);
}

function updateOutput(): void {
  formattedOutput.textContent = converted.length
    ? renderTemplate(
        templateInput.value,
        converted,
        Number(xyDecimals.value),
        Number(llDecimals.value),
        rounding.value as RoundingMode,
      )
    : "等待有效座標…";
}

function updateNetworkState(): void {
  const online = navigator.onLine;
  networkStatus.textContent = online ? "目前連線" : "離線模式";
  networkStatus.className = `status-dot ${online ? "online" : "offline"}`;
  offlineMap.hidden = online;
}

rawInput.addEventListener("input", update);
inputSystem.addEventListener("change", update);
[templateInput, xyDecimals, llDecimals, rounding].forEach((element) =>
  element.addEventListener("input", updateOutput),
);
templateSelect.addEventListener("change", () => {
  if (templateSelect.value !== "custom") {
    templateInput.value = templates[templateSelect.value as keyof typeof templates];
    updateOutput();
  }
});
templateInput.addEventListener("input", () => {
  templateSelect.value = "custom";
});
document.querySelector("#sampleButton")!.addEventListener("click", () => {
  rawInput.value = "(1)起點(23.712,120.324)(2)終點(23.708,120.320)";
  inputSystem.value = "auto";
  update();
});
document.querySelector("#copyButton")!.addEventListener("click", async () => {
  await navigator.clipboard.writeText(formattedOutput.textContent ?? "");
  const button = document.querySelector<HTMLButtonElement>("#copyButton")!;
  button.textContent = "已複製";
  setTimeout(() => (button.textContent = "複製結果"), 1200);
});
document.querySelector("#baseMap")!.addEventListener("change", (event) => {
  setBaseMap((event.target as HTMLSelectElement).value as "emap" | "photo");
});
window.addEventListener("online", updateNetworkState);
window.addEventListener("offline", updateNetworkState);

updateNetworkState();
update();
