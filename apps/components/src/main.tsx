import { render } from "solid-js/web";
import { applyTheme } from "@vela/theme";
import "@vela/theme/tokens.css";
import "@vela/ui/styles.css";
import { Gallery } from "./gallery";
import "./gallery.css";

applyTheme();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element.");

render(() => <Gallery />, root);
