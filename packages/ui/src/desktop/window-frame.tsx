import { createSignal, Show, type JSX } from "solid-js";
import { SNAP_EDGE } from "@vela/core";
import type { SnapZone, WindowRecord } from "@vela/core";

export interface WindowFrameProps {
  record: WindowRecord;
  active: boolean;
  zIndex: number;
  children?: JSX.Element;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  onResize: (width: number, height: number) => void;
  onSnap: (zone: SnapZone) => void;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
}

function snapZoneAt(clientX: number, clientY: number): SnapZone | null {
  if (clientY <= SNAP_EDGE) return "top";
  if (clientX <= SNAP_EDGE) return "left";
  if (clientX >= window.innerWidth - SNAP_EDGE) return "right";
  return null;
}

export function WindowFrame(props: WindowFrameProps): JSX.Element {
  const [preview, setPreview] = createSignal<SnapZone | null>(null);

  const stopDragging = (move: (event: PointerEvent) => void, up: () => void): void => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", up);
  };

  const startDrag = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    props.onFocus();
    if (props.record.state.maximized) return;

    event.preventDefault();
    const origin = { ...props.record.geometry };
    const startX = event.clientX;
    const startY = event.clientY;
    let zone: SnapZone | null = null;

    const move = (moveEvent: PointerEvent): void => {
      zone = snapZoneAt(moveEvent.clientX, moveEvent.clientY);
      setPreview(zone);
      if (zone) return;
      props.onMove(origin.x + moveEvent.clientX - startX, origin.y + moveEvent.clientY - startY);
    };
    const up = (): void => {
      stopDragging(move, up);
      setPreview(null);
      if (zone) props.onSnap(zone);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
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
      stopDragging(move, up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  return (
    <>
      <section
        class="vela-window"
        data-app-id={props.record.appId}
        data-window-id={props.record.id}
        data-active={props.active ? "true" : "false"}
        data-maximized={props.record.state.maximized ? "true" : "false"}
        data-minimized={props.record.state.minimized ? "true" : "false"}
        style={{
          left: `${props.record.geometry.x}px`,
          top: `${props.record.geometry.y}px`,
          width: `${props.record.geometry.width}px`,
          height: `${props.record.geometry.height}px`,
          "z-index": props.zIndex,
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

      <Show when={preview()}>
        {(zone) => (
          <div class="vela-snap-preview" data-zone={zone()} aria-hidden="true">
            <span class="vela-snap-preview__hint">
              {zone() === "top" ? "Maximize" : zone() === "left" ? "Snap left" : "Snap right"}
            </span>
          </div>
        )}
      </Show>
    </>
  );
}
