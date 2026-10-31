import { createUniqueId, For, Show, splitProps, type JSX } from "solid-js";
import { Button, IconButton } from "./button";
import type { ButtonVariant } from "./button";

function fieldClass(base: string, extra?: string): string {
  return extra ? `${base} ${extra}` : base;
}

export interface InputProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "class" | "type"> {
  class?: string;
  invalid?: boolean;
  type?: "text" | "email" | "password" | "search" | "tel" | "url";
}

export function Input(props: InputProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "invalid", "type"]);
  return (
    <input
      {...rest}
      type={local.type ?? "text"}
      class={fieldClass("vela-input", local.class)}
      aria-invalid={local.invalid ? "true" : undefined}
      data-invalid={local.invalid ? "true" : undefined}
    />
  );
}

export interface TextareaProps extends Omit<JSX.TextareaHTMLAttributes<HTMLTextAreaElement>, "class"> {
  class?: string;
  invalid?: boolean;
}

export function Textarea(props: TextareaProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "invalid"]);
  return (
    <textarea
      {...rest}
      class={fieldClass("vela-textarea", local.class)}
      aria-invalid={local.invalid ? "true" : undefined}
      data-invalid={local.invalid ? "true" : undefined}
    />
  );
}

export interface CheckboxProps extends Omit<JSX.InputHTMLAttributes<HTMLInputElement>, "type" | "class"> {
  class?: string;
  label?: JSX.Element;
}

export function Checkbox(props: CheckboxProps): JSX.Element {
  const [local, rest] = splitProps(props, ["class", "label"]);
  return (
    <label class={fieldClass("vela-checkbox", local.class)}>
      <input {...rest} type="checkbox" class="vela-checkbox__input" />
      <Show when={local.label}>
        <span class="vela-checkbox__label">{local.label}</span>
      </Show>
    </label>
  );
}

export interface SwitchProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: JSX.Element;
  ariaLabel?: string;
  class?: string;
}

export function Switch(props: SwitchProps): JSX.Element {
  const labelId = createUniqueId();
  return (
    <div class={fieldClass("vela-switch-field", props.class)}>
      <button
        type="button"
        role="switch"
        class="vela-switch"
        aria-checked={props.checked}
        aria-labelledby={props.label ? labelId : undefined}
        aria-label={props.label ? undefined : props.ariaLabel}
        disabled={props.disabled}
        data-checked={props.checked ? "true" : "false"}
        onClick={() => props.onChange?.(!props.checked)}
      >
        <span class="vela-switch__thumb" aria-hidden="true" />
      </button>
      <Show when={props.label}>
        <span id={labelId} class="vela-switch__label">
          {props.label}
        </span>
      </Show>
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  label?: JSX.Element;
  placeholder?: string;
  disabled?: boolean;
  name?: string;
  id?: string;
  class?: string;
}

export function Select(props: SelectProps): JSX.Element {
  const labelId = createUniqueId();
  return (
    <div class={fieldClass("vela-field", props.class)}>
      <Show when={props.label}>
        <span id={labelId} class="vela-field__label">
          {props.label}
        </span>
      </Show>
      <select
        class="vela-select"
        id={props.id}
        name={props.name}
        value={props.value}
        disabled={props.disabled}
        aria-labelledby={props.label ? labelId : undefined}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      >
        <Show when={props.placeholder}>
          <option value="" disabled>
            {props.placeholder}
          </option>
        </Show>
        <For each={props.options}>
          {(option) => (
            <option value={option.value} disabled={option.disabled}>
              {option.label}
            </option>
          )}
        </For>
      </select>
    </div>
  );
}

export interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: JSX.Element;
  disabled?: boolean;
  class?: string;
}

export function Slider(props: SliderProps): JSX.Element {
  const labelId = createUniqueId();
  const min = () => props.min ?? 0;
  const max = () => props.max ?? 100;
  return (
    <div class={fieldClass("vela-field vela-slider-field", props.class)}>
      <Show when={props.label}>
        <div class="vela-field__header">
          <span id={labelId} class="vela-field__label">
            {props.label}
          </span>
          <output class="vela-field__value">{props.value}</output>
        </div>
      </Show>
      <input
        type="range"
        class="vela-slider"
        min={min()}
        max={max()}
        step={props.step ?? 1}
        value={props.value}
        disabled={props.disabled}
        aria-labelledby={props.label ? labelId : undefined}
        onInput={(event) => props.onChange(Number(event.currentTarget.value))}
      />
    </div>
  );
}

export interface FilePickerButtonProps {
  label: string;
  accept?: string;
  multiple?: boolean;
  variant?: ButtonVariant;
  disabled?: boolean;
  onFiles: (files: FileList) => void;
}

export function FilePickerButton(props: FilePickerButtonProps): JSX.Element {
  let input: HTMLInputElement | undefined;
  return (
    <>
      <Button
        variant={props.variant}
        disabled={props.disabled}
        onClick={() => input?.click()}
      >
        {props.label}
      </Button>
      <input
        ref={input}
        type="file"
        class="vela-file-picker__input"
        accept={props.accept}
        multiple={props.multiple}
        onChange={(event) => {
          const files = event.currentTarget.files;
          if (files && files.length > 0) props.onFiles(files);
          event.currentTarget.value = "";
        }}
      />
    </>
  );
}

export interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: JSX.Element;
  disabled?: boolean;
  class?: string;
}

export function NumberInput(props: NumberInputProps): JSX.Element {
  const labelId = createUniqueId();
  const min = () => props.min ?? -Infinity;
  const max = () => props.max ?? Infinity;
  const step = () => props.step ?? 1;

  const clamp = (value: number): number => Math.min(max(), Math.max(min(), value));

  const commit = (value: number): void => {
    if (!Number.isFinite(value)) return;
    props.onChange(clamp(value));
  };

  return (
    <div class={fieldClass("vela-field vela-number-field", props.class)}>
      <Show when={props.label}>
        <span id={labelId} class="vela-field__label">
          {props.label}
        </span>
      </Show>
      <div class="vela-number">
        <IconButton label="Decrease" onClick={() => commit(props.value - step())}>
          −
        </IconButton>
        <input
          type="number"
          class="vela-number__input"
          value={props.value}
          min={Number.isFinite(min()) ? min() : undefined}
          max={Number.isFinite(max()) ? max() : undefined}
          step={step()}
          disabled={props.disabled}
          aria-labelledby={props.label ? labelId : undefined}
          onInput={(event) => commit(Number(event.currentTarget.value))}
        />
        <IconButton label="Increase" onClick={() => commit(props.value + step())}>
          +
        </IconButton>
      </div>
    </div>
  );
}
