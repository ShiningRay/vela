// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Alert, Confirm, Dialog, EmptyState, Progress, Spinner, Toast } from "../src";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("feedback components", () => {
  it("Dialog closes with Escape and labels itself", () => {
    const onClose = vi.fn();
    render(() => (
      <Dialog open title="Delete file" onClose={onClose}>
        This cannot be undone.
      </Dialog>
    ));
    const dialog = screen.getByRole("dialog", { name: "Delete file" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Confirm runs the confirm action", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(() => (
      <Confirm
        open
        title="Delete"
        message="Remove this item?"
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    ));
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Toast auto-dismisses after its timeout", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(() => <Toast open title="Saved" timeoutMs={3000} onClose={onClose} />);
    expect(screen.getByRole("status")).toBeTruthy();
    vi.advanceTimersByTime(3000);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Alert shows a danger alert and dismisses", () => {
    const onDismiss = vi.fn();
    render(() => (
      <Alert tone="danger" title="Upload failed" onDismiss={onDismiss}>
        Try again.
      </Alert>
    ));
    expect(screen.getByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Dismiss alert" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("Progress reports determinate and indeterminate state", () => {
    const { unmount } = render(() => <Progress label="Upload" value={40} max={100} />);
    const progress = screen.getByRole("progressbar", { name: "Upload" });
    expect(progress.getAttribute("aria-valuenow")).toBe("40");
    expect(progress.getAttribute("aria-valuemax")).toBe("100");
    unmount();

    render(() => <Progress label="Upload" indeterminate />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBeNull();
  });

  it("Spinner has an accessible status label", () => {
    render(() => <Spinner label="Loading files" size="lg" />);
    expect(screen.getByRole("status", { name: "Loading files" })).toBeTruthy();
  });

  it("EmptyState renders its action", () => {
    render(() => (
      <EmptyState
        title="No files"
        description="Drop a file here."
        action={<button type="button">Upload</button>}
      />
    ));
    expect(screen.getByText("No files")).toBeTruthy();
    expect(screen.getByText("Drop a file here.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload" })).toBeTruthy();
  });
});
