// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { createSignal } from "solid-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Accordion,
  Breadcrumb,
  Divider,
  Pagination,
  paginationRange,
  StatusBar,
  Tabs,
  Toolbar,
} from "../src";

afterEach(cleanup);

describe("layout components", () => {
  it("Tabs changes panels by click and arrow keys", () => {
    const [value, setValue] = createSignal("a");
    render(() => (
      <Tabs
        label="Sections"
        value={value()}
        onChange={setValue}
        tabs={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Beta" },
          { id: "c", label: "Gamma" },
        ]}
        panel={<div>Panel {value()}</div>}
      />
    ));

    fireEvent.click(screen.getByRole("tab", { name: "Beta" }));
    expect(screen.getByRole("tabpanel").textContent).toContain("Panel b");

    fireEvent.keyDown(screen.getByRole("tab", { name: "Beta" }), { key: "ArrowRight" });
    expect(value()).toBe("c");
    expect(screen.getByRole("tabpanel").textContent).toContain("Panel c");
  });

  it("Accordion toggles panels and respects defaultOpen", () => {
    render(() => (
      <Accordion
        defaultOpen={["one"]}
        items={[
          { id: "one", title: "First", content: "First content" },
          { id: "two", title: "Second", content: "Second content" },
        ]}
      />
    ));
    expect(screen.getByText("First content")).toBeTruthy();
    const second = screen.getByRole("button", { name: /Second/ });
    expect(second.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(second);
    expect(second.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Second content")).toBeTruthy();
  });

  it("Divider exposes its orientation", () => {
    const { unmount } = render(() => <Divider label="or" />);
    expect(screen.getByRole("separator").getAttribute("aria-orientation")).toBe("horizontal");
    unmount();
    render(() => <Divider orientation="vertical" />);
    expect(screen.getByRole("separator").getAttribute("aria-orientation")).toBe("vertical");
  });

  it("Breadcrumb marks the current page and runs link actions", () => {
    const onHome = vi.fn();
    render(() => (
      <Breadcrumb
        items={[
          { id: "home", label: "Home", onClick: onHome },
          { id: "docs", label: "Docs" },
        ]}
      />
    ));
    expect(screen.getByText("Docs").getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Home" }));
    expect(onHome).toHaveBeenCalledOnce();
  });

  it("Pagination builds ranges and reports navigation", () => {
    expect(paginationRange(5, 10, 1)).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
    const onChange = vi.fn();
    render(() => <Pagination page={5} pageCount={10} onChange={onChange} />);
    expect(screen.getByRole("button", { name: "Page 5" }).getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onChange).toHaveBeenCalledWith(6);
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("Toolbar moves focus with arrow keys", () => {
    render(() => (
      <Toolbar label="Editing tools">
        <button type="button">Bold</button>
        <button type="button">Italic</button>
      </Toolbar>
    ));
    const toolbar = screen.getByRole("toolbar", { name: "Editing tools" });
    const bold = screen.getByRole("button", { name: "Bold" });
    const italic = screen.getByRole("button", { name: "Italic" });
    bold.focus();
    fireEvent.keyDown(toolbar, { key: "ArrowRight" });
    expect(document.activeElement).toBe(italic);
  });

  it("StatusBar renders labelled items", () => {
    render(() => (
      <StatusBar
        items={[
          { id: "branch", label: "Branch", value: "main" },
          { id: "sync", label: "Sync", value: "clean" },
        ]}
      />
    ));
    expect(screen.getByRole("status").textContent).toContain("Branch");
    expect(screen.getByText("main")).toBeTruthy();
  });
});
