import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "臺灣座標轉換與圖資檢核工具",
        short_name: "座標轉換",
        description: "離線轉換 WGS84 與 TWD97，連線時使用國土測繪圖資檢核位置。",
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
