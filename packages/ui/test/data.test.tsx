// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Badge, Kv, List, Table, Tag, Tree } from "../src";

afterEach(cleanup);

describe("data components", () => {
  it("List selects rows and shows an empty state", () => {
    const onSelect = vi.fn();
    const { unmount } = render(() => (
      <List
        label="Files"
        selectedId="a"
        onSelect={onSelect}
        items={[
          { id: "a", label: "Report", meta: "file" },
          { id: "b", label: "Photos", meta: "dir" },
        ]}
      />
    ));
    expect(screen.getByRole("option", { name: /Report/ }).getAttribute("aria-selected")).toBe("true");
    fireEvent.click(screen.getByRole("option", { name: /Photos/ }));
    expect(onSelect).toHaveBeenCalledWith("b");
    unmount();

    render(() => <List items={[]} empty="No files" />);
    expect(screen.getByText("No files")).toBeTruthy();
  });

  it("Table renders headers, rows and empty state", () => {
    const columns = [
      { id: "name", label: "Name" },
      { id: "size", label: "Size", align: "right" as const },
    ];
    const { unmount } = render(() => (
      <Table
        caption="Artifacts"
        columns={columns}
        rows={[{ id: "one", cells: { name: "Vela.app", size: "121 MB" } }]}
      />
    ));
    expect(screen.getByRole("table").textContent).toContain("Artifacts");
    expect(screen.getByRole("columnheader", { name: "Name" })).toBeTruthy();
    expect(screen.getByRole("cell", { name: "Vela.app" })).toBeTruthy();
    unmount();

    render(() => <Table columns={columns} rows={[]} empty="No artifacts" />);
    expect(screen.getByText("No artifacts")).toBeTruthy();
  });

  it("Tree expands, collapses and selects nodes", () => {
    const onSelect = vi.fn();
    render(() => (
      <Tree
        label="Project"
        selectedId="src"
        onSelect={onSelect}
        defaultExpanded={["root"]}
        nodes={[
          {
            id: "root",
            label: "Root",
            children: [{ id: "src", label: "Source" }],
          },
        ]}
      />
    ));

    expect(screen.getByText("Source")).toBeTruthy();
    const sourceRow = screen.getByText("Source").closest(".vela-tree__row") as HTMLElement;
    fireEvent.click(sourceRow);
    expect(onSelect).toHaveBeenCalledWith("src");

    fireEvent.click(screen.getByRole("button", { name: "Collapse" }));
    expect(screen.queryByText("Source")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Source")).toBeTruthy();

    const rootRow = screen.getByText("Root").closest(".vela-tree__row") as HTMLElement;
    fireEvent.keyDown(rootRow, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("root");
  });

  it("Kv renders pairs in one or two columns", () => {
    render(() => (
      <Kv
        columns={2}
        items={[
          { id: "runtime", label: "Runtime", value: "Node 24" },
          { id: "shell", label: "Shell", value: "Tauri 2" },
        ]}
      />
    ));
    expect(screen.getByText("Runtime")).toBeTruthy();
    expect(screen.getByText("Node 24")).toBeTruthy();
    expect(screen.getAllByRole("definition")).toHaveLength(2);
  });

  it("Tag removes itself", () => {
    const onRemove = vi.fn();
    render(() => (
      <Tag tone="success" onRemove={onRemove}>
        Ready
      </Tag>
    ));
    fireEvent.click(screen.getByRole("button", { name: "Remove tag" }));
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("Badge renders a dot and tone", () => {
    const { container } = render(() => (
      <Badge tone="danger" dot>
        Offline
      </Badge>
    ));
    const badge = container.querySelector(".vela-badge");
    expect(badge?.getAttribute("data-tone")).toBe("danger");
    expect(badge?.querySelector(".vela-badge__dot")).toBeTruthy();
  });
});
