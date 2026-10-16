
  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  import "./styles/index.css";
  import { startPushSessionGuard } from "./app/utils/browser-push";
  import { startInstallationSupport } from "./app/utils/pwa-install";

  startPushSessionGuard();
  startInstallationSupport();
  createRoot(document.getElementById("root")!).render(<App />);

