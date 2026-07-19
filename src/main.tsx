import React from "react";
import ReactDOM from "react-dom/client";
import { Buffer } from "buffer";
import { Providers } from "@/app/providers";
import "@/index.css";

// isomorphic-git expects Buffer in the browser runtime
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <Providers />
  </React.StrictMode>,
);
