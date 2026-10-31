import { Show, type JSX } from "solid-js";
import type { WindowRecord } from "@vela/core";

export interface WindowFrameProps {
  record: WindowRecord;
  active: boolean;
  zIndex: number;
  children?: JSX.Element;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}

export function WindowFrame(props: WindowFrameProps): JSX.Element {
  const startDrag = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    props.onFocus();
    if (props.record.state.maximized) return;

    event.preventDefault();
    const origin = { ...props.record.geometry };
    const startX = event.clientX;
    const startY = event.clientY;

    const move = (moveEvent: PointerEvent): void => {
      props.onMove(origin.x + moveEvent.clientX - startX, origin.y + moveEvent.clientY - startY);
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const startResize = (event: PointerEvent): void => {
    if (event.button !== 0 || props.record.state.maximized) return;
    event.preventDefault();
    event.stopPropagation();
    props.onFocus();

    const origin = { ...props.record.geometry };
    const startX = event.clientX;
    const startY = event.clientY;

    const move = (moveEvent: PointerEvent): void => {
      props.onResize(
        origin.width + moveEvent.clientX - startX,
        origin.height + moveEvent.clientY - startY,
      );
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <section
      class="vela-window"
      data-active={props.active ? "true" : "false"}
      data-maximized={props.record.state.maximized ? "true" : "false"}
      style={{
        left: `${props.record.geometry.x}px`,
        top: `${props.record.geometry.y}px`,
        width: `${props.record.geometry.width}px`,
        height: `${props.record.geometry.height}px`,
        "z-index": props.zIndex,
        display: props.record.state.minimized ? "none" : "flex",
      }}
      onPointerDown={() => props.onFocus()}
    >
      <header class="vela-window__titlebar" onPointerDown={startDrag} onDblClick={() => props.onMaximize()}>
        <span class="vela-window__title">{props.record.title}</span>
        <div class="vela-window__controls" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" class="vela-window__control" title="Minimize" onClick={() => props.onMinimize()}>
            <span aria-hidden="true">–</span>
          </button>
          <button type="button" class="vela-window__control" title="Maximize" onClick={() => props.onMaximize()}>
            <span aria-hidden="true">{props.record.state.maximized ? "❐" : "□"}</span>
          </button>
          <button type="button" class="vela-window__control is-close" title="Close" onClick={() => props.onClose()}>
            <span aria-hidden="true">×</span>
          </button>
        </div>
      </header>

      <div class="vela-window__body">{props.children}</div>

      <Show when={!props.record.state.maximized}>
        <div class="vela-window__resize" onPointerDown={startResize} aria-hidden="true" />
      </Show>
    </section>
  );
}
