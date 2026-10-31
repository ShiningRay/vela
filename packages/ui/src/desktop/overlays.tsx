import { createEffect, createSignal, createUniqueId, For, onCleanup, Show, type JSX } from "solid-js";
import { Portal } from "solid-js/web";

export interface PopoverProps {
  label: string;
  children?: JSX.Element;
  placement?: "top" | "bottom";
  class?: string;
}

export function Popover(props: PopoverProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  let root: HTMLDivElement | undefined;
  let trigger: HTMLButtonElement | undefined;
  let panel: HTMLDivElement | undefined;

  createEffect(() => {
    if (!open()) return;
    queueMicrotask(() => panel?.focus());

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && root?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
      trigger?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  return (
    <div class={`vela-popover ${props.class ?? ""}`} ref={root} data-placement={props.placement ?? "bottom"}>
      <button
        ref={trigger}
        type="button"
        class="vela-popover__trigger"
        aria-haspopup="dialog"
        aria-expanded={open()}
        onClick={() => setOpen((current) => !current)}
      >
        {props.label}
      </button>
      <Show when={open()}>
        <div ref={panel} class="vela-popover__panel" role="dialog" aria-label={props.label} tabIndex={-1}>
          {props.children}
        </div>
      </Show>
    </div>
  );
}

export interface TooltipProps {
  label: string;
  children?: JSX.Element;
  placement?: "top" | "bottom";
  class?: string;
}

export function Tooltip(props: TooltipProps): JSX.Element {
  const id = createUniqueId();
  const [visible, setVisible] = createSignal(false);
  return (
    <span
      class={`vela-tooltip ${props.class ?? ""}`}
      data-placement={props.placement ?? "top"}
      onPointerEnter={() => setVisible(true)}
      onPointerLeave={() => setVisible(false)}
    >
      <span
        class="vela-tooltip__trigger"
        tabIndex={0}
        aria-describedby={visible() ? id : undefined}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setVisible(false);
        }}
      >
        {props.children}
      </span>
      <Show when={visible()}>
        <span id={id} class="vela-tooltip__content" role="tooltip">
          {props.label}
        </span>
      </Show>
    </span>
  );
}

export interface ContextMenuItem {
  id: string;
  label: JSX.Element;
  disabled?: boolean;
  danger?: boolean;
  onSelect: () => void;
}

export interface ContextMenuProps {
  items: ContextMenuItem[];
  children?: JSX.Element;
  class?: string;
}

export function ContextMenu(props: ContextMenuProps): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [position, setPosition] = createSignal({ x: 0, y: 0 });
  let root: HTMLDivElement | undefined;
  let menu: HTMLDivElement | undefined;

  const showAt = (x: number, y: number): void => {
    setPosition({ x, y });
    setOpen(true);
  };

  const close = (): void => {
    setOpen(false);
  };

  createEffect(() => {
    if (!open()) return;
    queueMicrotask(() => menu?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (target instanceof Node && menu?.contains(target)) return;
      close();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!menu) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        root?.focus();
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const items = [...menu.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
      if (items.length === 0) return;
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      const next =
        event.key === "ArrowDown"
          ? (index + 1) % items.length
          : (index - 1 + items.length) % items.length;
      event.preventDefault();
      items[next]?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    });
  });

  return (
    <div
      ref={root}
      class={`vela-context-menu__target ${props.class ?? ""}`}
      tabIndex={0}
      onContextMenu={(event) => {
        event.preventDefault();
        showAt(event.clientX, event.clientY);
      }}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          const rect = root?.getBoundingClientRect();
          showAt(rect?.left ?? 0, (rect?.bottom ?? 0) + 4);
        }
      }}
    >
      {props.children}
      <Show when={open()}>
        <Portal>
          <div
            ref={menu}
            class="vela-context-menu"
            role="menu"
            style={{ left: `${position().x}px`, top: `${position().y}px` }}
            onContextMenu={(event) => event.preventDefault()}
          >
            <For each={props.items}>
              {(item) => (
                <button
                  type="button"
                  role="menuitem"
                  class="vela-context-menu__item"
                  data-danger={item.danger ? "true" : "false"}
                  disabled={item.disabled}
                  onClick={() => {
                    close();
                    item.onSelect();
                  }}
                >
                  {item.label}
                </button>
              )}
            </For>
          </div>
        </Portal>
      </Show>
    </div>
  );
}

export interface ColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  swatches?: string[];
  label?: JSX.Element;
  class?: string;
}

export function ColorPicker(props: ColorPickerProps): JSX.Element {
  const labelId = createUniqueId();
  return (
    <div class={`vela-field vela-color-picker ${props.class ?? ""}`}>
      <Show when={props.label}>
        <span id={labelId} class="vela-field__label">
          {props.label}
        </span>
      </Show>
      <div class="vela-color-picker__row">
        <For each={props.swatches ?? []}>
          {(color) => (
            <button
              type="button"
              class="vela-color-picker__swatch"
              style={{ background: color }}
              data-active={props.value === color ? "true" : "false"}
              aria-label={`Use color ${color}`}
              aria-pressed={props.value === color}
              onClick={() => props.onChange(color)}
            />
          )}
        </For>
        <input
          type="color"
          class="vela-color-picker__input"
          value={props.value}
          aria-labelledby={props.label ? labelId : undefined}
          aria-label={props.label ? undefined : "Color"}
          onInput={(event) => props.onChange(event.currentTarget.value)}
        />
        <output class="vela-color-picker__value">{props.value}</output>
      </div>
    </div>
  );
}

export interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: JSX.Element;
  min?: string;
  max?: string;
  class?: string;
}

export function DatePicker(props: DatePickerProps): JSX.Element {
  const labelId = createUniqueId();
  return (
    <div class={`vela-field vela-date-picker ${props.class ?? ""}`}>
      <Show when={props.label}>
        <span id={labelId} class="vela-field__label">
          {props.label}
        </span>
      </Show>
      <input
        type="date"
        class="vela-date-picker__input"
        value={props.value}
        min={props.min}
        max={props.max}
        aria-labelledby={props.label ? labelId : undefined}
        aria-label={props.label ? undefined : "Date"}
        onInput={(event) => props.onChange(event.currentTarget.value)}
      />
    </div>
  );
}
