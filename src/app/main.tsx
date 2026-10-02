import { render } from "preact";
import { App } from "./App.js";
import "../styles/app.css";
import "../styles/case.css";
import "../styles/shell.css";
const root = document.getElementById("app");
if (!root)
    throw new Error("#app not found");
render(<App />, root);
