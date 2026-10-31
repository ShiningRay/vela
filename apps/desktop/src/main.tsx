import { render } from "solid-js/web";
import { applyTheme } from "@vela/theme";
import { DesktopShell } from "@vela/desktop";
import "@vela/theme/tokens.css";
import "@vela/ui/styles.css";
import "@vela/desktop/styles.css";
import "./app.css";

applyTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");

render(() => <DesktopShell />, root);
