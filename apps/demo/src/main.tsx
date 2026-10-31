import { render } from "solid-js/web";
import "@vela/theme/tokens.css";
import { applyTheme } from "@vela/theme";
import { Counter } from "./counter";
import "./demo.css";

applyTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");

render(() => <Counter />, root);
