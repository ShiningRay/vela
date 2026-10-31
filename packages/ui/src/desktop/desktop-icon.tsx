import type { JSX } from "solid-js";

export interface DesktopIconProps {
  icon: string;
  label: string;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}

export function DesktopIcon(props: DesktopIconProps): JSX.Element {
  return (
    <button
      type="button"
      class="vela-desktop-icon"
      data-selected={props.selected ? "true" : "false"}
      onClick={() => props.onSelect()}
      onDblClick={() => props.onOpen()}
      title={`Double-click to open ${props.label}`}
    >
      <span class="vela-desktop-icon__glyph" aria-hidden="true">
        {props.icon}
      </span>
      <span class="vela-desktop-icon__label">{props.label}</span>
    </button>
  );
}
