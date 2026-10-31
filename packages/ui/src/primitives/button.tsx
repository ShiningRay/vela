import { For, type JSX } from "solid-js";

export type ButtonVariant = "default" | "primary" | "ghost" | "danger";

export interface ButtonProps {
  children?: JSX.Element;
  variant?: ButtonVariant;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
  title?: string;
  onClick?: (event: MouseEvent) => void;
}

export function Button(props: ButtonProps): JSX.Element {
  return (
    <button
      type={props.type ?? "button"}
      class="vela-button"
      data-variant={props.variant ?? "default"}
      disabled={props.disabled}
      title={props.title}
      onClick={(event) => props.onClick?.(event)}
    >
      {props.children}
    </button>
  );
}

export interface IconButtonProps {
  children?: JSX.Element;
  label: string;
  onClick?: (event: MouseEvent) => void;
}

export function IconButton(props: IconButtonProps): JSX.Element {
  return (
    <button
      type="button"
      class="vela-icon-button"
      aria-label={props.label}
      title={props.label}
      onClick={(event) => props.onClick?.(event)}
    >
      {props.children}
    </button>
  );
}

export interface StackProps {
  children?: JSX.Element;
  gap?: number;
  class?: string;
}

export function Stack(props: StackProps): JSX.Element {
  return (
    <div class={`vela-stack ${props.class ?? ""}`} style={{ gap: `${props.gap ?? 8}px` }}>
      {props.children}
    </div>
  );
}

export interface RowProps {
  children?: JSX.Element;
  gap?: number;
  class?: string;
}

export function Row(props: RowProps): JSX.Element {
  return (
    <div class={`vela-row ${props.class ?? ""}`} style={{ gap: `${props.gap ?? 8}px` }}>
      {props.children}
    </div>
  );
}

export interface LabelProps {
  children?: JSX.Element;
  muted?: boolean;
  class?: string;
}

export function Label(props: LabelProps): JSX.Element {
  return <span class={`vela-label ${props.muted ? "is-muted" : ""} ${props.class ?? ""}`}>{props.children}</span>;
}

export interface MenuListProps {
  items: Array<{ id: string; label: string; onSelect?: () => void }>;
}

export function MenuList(props: MenuListProps): JSX.Element {
  return (
    <div class="vela-menu-list" role="menu">
      <For each={props.items}>
        {(item) => (
          <button type="button" role="menuitem" class="vela-menu-item" onClick={() => item.onSelect?.()}>
            {item.label}
          </button>
        )}
      </For>
    </div>
  );
}
