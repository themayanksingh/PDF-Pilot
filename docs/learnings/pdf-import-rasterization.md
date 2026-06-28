# PDF Import Rasterization

Last Updated: 2026-06-28

Figma plugin main code cannot rasterize PDF files directly. Keep PDF parsing and canvas rendering in `ui.html`, then pass validated image payloads to `code.ts` for canvas placement through Figma image fills.

Use original PDF page dimensions for Figma layer sizing and a separate render scale for image sharpness. Cap rendered pixels before calling `page.render()` so very large pages do not stall the plugin UI.

For production import controls, keep the user-facing choice simple and map it internally to render settings. Low/Medium/High can drive scale, image encoding, and JPEG quality, while the UI still shows the effective scale so users understand the quality tradeoff.

There is no universal "smallest, fastest, lossless" image setting for raster imports. When file size matters more than exact pixel preservation, use tuned browser-native JPEG compression for fast, visually sharp smaller files.
