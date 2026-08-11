import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "智聯 GeoDesk｜工程座標與圖資工作台",
        short_name: "智聯 GeoDesk",
        description: "離線轉換 WGS84 與 TWD97、編輯工程圖徵，連線時使用國土測繪圖資檢核位置。",
        theme_color: "#103b35",
        background_color: "#f3f0e8",
        display: "standalone",
        start_url: "./",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/wmts\.nlsc\.gov\.tw\//,
            handler: "NetworkOnly"
          }
        ]
      }
    })
  ]
});
