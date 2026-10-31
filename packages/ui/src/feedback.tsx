import {
  createEffect,
  createUniqueId,
  onCleanup,
  Show,
  type JSX,
} from "solid-js";
import { Portal } from "solid-js/web";
import { Button, IconButton } from "./primitives/button";

export type FeedbackTone = "info" | "success" | "warning" | "danger";

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children?: JSX.Element;
  footer?: JSX.Element;
  closeOnBackdrop?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog(props: DialogProps): JSX.Element {
  const titleId = createUniqueId();
  let dialog: HTMLDivElement | undefined;

  createEffect(() => {
    if (!props.open) return;
    queueMicrotask(() => dialog?.focus());

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        props.onClose();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    onCleanup(() => document.removeEventListener("keydown", onKeyDown));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div
          class="vela-dialog-backdrop"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget && props.closeOnBackdrop !== false) {
              props.onClose();
            }
          }}
        >
          <div
            ref={dialog}
            class="vela-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <header class="vela-dialog__header">
              <h2 id={titleId} class="vela-dialog__title">
                {props.title}
              </h2>
              <IconButton label="Close dialog" onClick={() => props.onClose()}>
                ×
              </IconButton>
            </header>
            <div class="vela-dialog__body">{props.children}</div>
            <Show when={props.footer}>
              <footer class="vela-dialog__footer">{props.footer}</footer>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
}

export interface ConfirmProps {
  open: boolean;
  title: string;
  message: JSX.Element;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export function Confirm(props: ConfirmProps): JSX.Element {
  return (
    <Dialog
      open={props.open}
      title={props.title}
      onClose={() => props.onCancel()}
      footer={
        <>
          <Button variant="ghost" onClick={() => props.onCancel()}>
            {props.cancelLabel ?? "Cancel"}
          </Button>
          <Button
            variant={props.tone === "danger" ? "danger" : "primary"}
            onClick={() => props.onConfirm()}
          >
            {props.confirmLabel ?? "Confirm"}
          </Button>
        </>
      }
    >
      {props.message}
    </Dialog>
  );
}

export interface ToastProps {
  open: boolean;
  title: string;
  description?: string;
  tone?: FeedbackTone;
  timeoutMs?: number;
  onClose: () => void;
}

export function Toast(props: ToastProps): JSX.Element {
  createEffect(() => {
    if (!props.open) return;
    const timeout = props.timeoutMs ?? 5_000;
    if (timeout <= 0) return;
    const timer = setTimeout(() => props.onClose(), timeout);
    onCleanup(() => clearTimeout(timer));
  });

  return (
    <Show when={props.open}>
      <Portal>
        <div class="vela-toast" role="status" data-tone={props.tone ?? "info"}>
          <div class="vela-toast__content">
            <div class="vela-toast__title">{props.title}</div>
            <Show when={props.description}>
              <div class="vela-toast__description">{props.description}</div>
            </Show>
          </div>
          <IconButton label="Dismiss toast" onClick={() => props.onClose()}>
            ×
          </IconButton>
        </div>
      </Portal>
    </Show>
  );
}

export interface AlertProps {
  tone?: FeedbackTone;
  title?: JSX.Element;
  children?: JSX.Element;
  onDismiss?: () => void;
}

export function Alert(props: AlertProps): JSX.Element {
  return (
    <div class="vela-alert" role={props.tone === "danger" ? "alert" : "status"} data-tone={props.tone ?? "info"}>
      <div class="vela-alert__content">
        <Show when={props.title}>
          <div class="vela-alert__title">{props.title}</div>
        </Show>
        <div class="vela-alert__body">{props.children}</div>
      </div>
      <Show when={props.onDismiss}>
        <IconButton label="Dismiss alert" onClick={() => props.onDismiss?.()}>
          ×
        </IconButton>
      </Show>
    </div>
  );
}

export interface ProgressProps {
  value?: number;
  max?: number;
  label?: string;
  indeterminate?: boolean;
}

export function Progress(props: ProgressProps): JSX.Element {
  const max = () => Math.max(1, props.max ?? 100);
  const clamped = () => Math.max(0, Math.min(props.value ?? 0, max()));
  return (
    <div class="vela-progress-field">
      <Show when={props.label}>
        <div class="vela-progress__label">
          <span>{props.label}</span>
          <Show when={!props.indeterminate}>
            <span>{Math.round((clamped() / max()) * 100)}%</span>
          </Show>
        </div>
      </Show>
      <div
        class="vela-progress"
        role="progressbar"
        aria-label={props.label}
        aria-valuemin={0}
        aria-valuemax={max()}
        aria-valuenow={props.indeterminate ? undefined : clamped()}
        data-indeterminate={props.indeterminate ? "true" : "false"}
      >
        <span
          class="vela-progress__fill"
          style={{ width: props.indeterminate ? "40%" : `${(clamped() / max()) * 100}%` }}
        />
      </div>
    </div>
  );
}

export interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function Spinner(props: SpinnerProps): JSX.Element {
  return (
    <span
      class="vela-spinner"
      role="status"
      aria-label={props.label ?? "Loading"}
      data-size={props.size ?? "md"}
    >
      <span class="vela-spinner__ring" aria-hidden="true" />
    </span>
  );
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: JSX.Element;
  action?: JSX.Element;
}

export function EmptyState(props: EmptyStateProps): JSX.Element {
  return (
    <div class="vela-empty-state">
      <Show when={props.icon}>
        <div class="vela-empty-state__icon" aria-hidden="true">
          {props.icon}
        </div>
      </Show>
      <div class="vela-empty-state__title">{props.title}</div>
      <Show when={props.description}>
        <div class="vela-empty-state__description">{props.description}</div>
      </Show>
      <Show when={props.action}>
        <div class="vela-empty-state__action">{props.action}</div>
      </Show>
    </div>
  );
}
