// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@solidjs/testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Checkbox,
  FilePickerButton,
  Input,
  NumberInput,
  Select,
  Slider,
  Switch,
  Textarea,
} from "../src";

afterEach(cleanup);

describe("form primitives", () => {
  it("Input forwards input events and invalid state", () => {
    const onInput = vi.fn();
    render(() => <Input placeholder="Name" invalid onInput={onInput} />);
    const input = screen.getByPlaceholderText("Name");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    fireEvent.input(input, { target: { value: "Vela" } });
    expect(onInput).toHaveBeenCalledOnce();
  });

  it("Textarea renders a multi-line field", () => {
    const onInput = vi.fn();
    render(() => <Textarea aria-label="Notes" onInput={onInput} />);
    fireEvent.input(screen.getByLabelText("Notes"), { target: { value: "hello" } });
    expect(onInput).toHaveBeenCalledOnce();
  });

  it("Checkbox toggles from its label", () => {
    const onChange = vi.fn();
    render(() => <Checkbox label="Remember me" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Remember me"));
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("Switch exposes role=switch and toggles", () => {
    const onChange = vi.fn();
    render(() => <Switch checked={false} label="Wi-Fi" onChange={onChange} />);
    const toggle = screen.getByRole("switch", { name: "Wi-Fi" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("Select reports option changes", () => {
    const onChange = vi.fn();
    render(() => (
      <Select
        label="Theme"
        value="dark"
        options={[
          { value: "dark", label: "Dark" },
          { value: "light", label: "Light" },
        ]}
        onChange={onChange}
      />
    ));
    fireEvent.change(screen.getByLabelText("Theme"), { target: { value: "light" } });
    expect(onChange).toHaveBeenCalledWith("light");
  });

  it("Slider reports numeric values", () => {
    const onChange = vi.fn();
    render(() => <Slider label="Volume" value={10} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText("Volume"), { target: { value: "42" } });
    expect(onChange).toHaveBeenCalledWith(42);
  });

  it("NumberInput steps and clamps to its bounds", () => {
    const onChange = vi.fn();
    render(() => <NumberInput label="Count" value={5} min={0} max={10} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    expect(onChange).toHaveBeenLastCalledWith(6);

    cleanup();
    render(() => <NumberInput label="Count" value={10} min={0} max={10} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Increase" }));
    expect(onChange).toHaveBeenLastCalledWith(10);
  });

  it("FilePickerButton reports selected files", () => {
    const onFiles = vi.fn();
    const { container } = render(() => (
      <FilePickerButton label="Import" accept=".txt" onFiles={onFiles} />
    ));
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input).not.toBeNull();
    expect(input!.accept).toBe(".txt");
    fireEvent.change(input!, { target: { files: [new File(["hello"], "hello.txt")] } });
    expect(onFiles).toHaveBeenCalledOnce();
  });
});
