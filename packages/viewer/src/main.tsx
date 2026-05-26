import { createRoot } from "react-dom/client";
import App from "./App";
import { applyViewerBootstrapLocale } from "./bootstrap-document";
import "./theme.css";

applyViewerBootstrapLocale();

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(<App />);
}
