import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import { Providers } from "@/app/providers";
import { showMainWindow } from "@/tauri/window";
import "@/index.css";

// isomorphic-git expects Buffer in the browser runtime
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

// Show window ASAP — HTML splash is already painted in the (was-hidden) WebView.
void showMainWindow();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Providers />
  </React.StrictMode>,
);
