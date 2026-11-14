/* @refresh reload */
import { render } from "solid-js/web";
import PlaygroundApp from "./app";
import "./playground.css";

render(() => <PlaygroundApp />, document.getElementById("root")!);
