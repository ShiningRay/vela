// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColorPicker, ContextMenu, DatePicker, Popover, Tooltip } from "../src";

afterEach(cleanup);

describe("desktop overlays", () => {
  it("Popover opens, closes on Escape and outside clicks", () => {
    render(() => (
      <Popover label="Options">
        <button type="button">Settings</button>
      </Popover>
    ));
    const trigger = screen.getByRole("button", { name: "Options" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog", { name: "Options" })).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Tooltip appears on focus and hides on blur", () => {
    render(() => (
      <Tooltip label="More information">
        <span>i</span>
      </Tooltip>
    ));
    const trigger = document.querySelector(".vela-tooltip__trigger") as HTMLElement;
    fireEvent.focus(trigger);
    expect(screen.getByRole("tooltip").textContent).toBe("More information");
    fireEvent.blur(trigger);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("ContextMenu opens at the pointer and runs items", () => {
    const onRename = vi.fn();
    const { container } = render(() => (
      <ContextMenu
        items={[
          { id: "rename", label: "Rename", onSelect: onRename },
          { id: "delete", label: "Delete", danger: true, onSelect: vi.fn() },
        ]}
      >
        <span>Right click</span>
      </ContextMenu>
    ));
    const target = container.querySelector(".vela-context-menu__target") as HTMLElement;
    fireEvent.contextMenu(target, { clientX: 30, clientY: 40 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    expect(onRename).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.contextMenu(target, { clientX: 30, clientY: 40 });
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("ContextMenu opens from the keyboard", () => {
    const { container } = render(() => (
      <ContextMenu items={[{ id: "copy", label: "Copy", onSelect: vi.fn() }]}>
        <span>Keyboard target</span>
      </ContextMenu>
    ));
    const target = container.querySelector(".vela-context-menu__target") as HTMLElement;
    fireEvent.keyDown(target, { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu")).toBeTruthy();
  });

  it("ColorPicker selects swatches and custom colors", () => {
    const onChange = vi.fn();
    render(() => (
      <ColorPicker
        label="Accent"
        value="#7dd3fc"
        swatches={["#7dd3fc", "#f472b6"]}
        onChange={onChange}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Use color #f472b6" }));
    expect(onChange).toHaveBeenLastCalledWith("#f472b6");
    fireEvent.input(screen.getByLabelText("Accent"), { target: { value: "#00ff00" } });
    expect(onChange).toHaveBeenLastCalledWith("#00ff00");
  });

  it("DatePicker reports date changes", () => {
    const onChange = vi.fn();
    render(() => <DatePicker label="Due date" value="2026-10-31" onChange={onChange} />);
    fireEvent.input(screen.getByLabelText("Due date"), { target: { value: "2026-11-01" } });
    expect(onChange).toHaveBeenCalledWith("2026-11-01");
  });
});
