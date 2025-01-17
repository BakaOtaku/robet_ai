import React from "react";
import ReactDOM from "react-dom/client";
import "./main.css";
import { BrowserRouter } from "react-router-dom";
import { WebAppProvider } from "@vkruglikov/react-telegram-web-app";
import { ToastProvider } from "@radix-ui/react-toast";
import { AbstraxionProvider } from "@burnt-labs/abstraxion";
import "@burnt-labs/abstraxion/dist/index.css";
import "@burnt-labs/ui/dist/index.css";
import App from "./App.tsx";
import { Toaster } from "@/components/ui/toaster";

// Polyfill Buffer
import { Buffer } from 'buffer';
globalThis.Buffer = Buffer;
globalThis.global = globalThis;

const treasuryConfig = {
  treasury: "xion1qn5r747gf5y5ps6qmmxglefqhtnxze9q6u36x9a582smc9a3yazqakt6x6",
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <WebAppProvider options={{ smoothButtonsTransition: true }}>
        <ToastProvider>
          <AbstraxionProvider config={treasuryConfig}>
            <App />
            <Toaster />
          </AbstraxionProvider>
        </ToastProvider>
      </WebAppProvider>
    </BrowserRouter>
  </React.StrictMode>
);
