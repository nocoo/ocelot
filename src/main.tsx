import "@nocoo/basalt/styles/standalone";
import "@fontsource-variable/source-serif-4/standard.css";
import "@fontsource-variable/source-serif-4/standard-italic.css";
import "katex/dist/katex.min.css";
import "./views/styles.css";
import { createRoot } from "react-dom/client";
import { ApiClient } from "./services/api";
import { browserServices } from "./services/browser";
import { ReaderViewModel } from "./viewmodels/reader";
import { App } from "./views/App";

const root = document.getElementById("root");
if (root)
  createRoot(root).render(
    <App model={new ReaderViewModel(new ApiClient(), browserServices(window, document))} />,
  );
