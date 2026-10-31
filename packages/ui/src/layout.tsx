import { createSignal, For, Show, type JSX } from "solid-js";

export interface TabDefinition {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface TabsProps {
  tabs: TabDefinition[];
  value: string;
  onChange: (id: string) => void;
  panel?: JSX.Element;
  label?: string;
  class?: string;
}

export function Tabs(props: TabsProps): JSX.Element {
  const tabButtons = new Map<string, HTMLButtonElement>();

  const move = (direction: 1 | -1 | "home" | "end"): void => {
    const enabled = props.tabs.filter((tab) => !tab.disabled);
    if (enabled.length === 0) return;
    const currentIndex = Math.max(
      0,
      enabled.findIndex((tab) => tab.id === props.value),
    );
    const nextIndex =
      direction === "home"
        ? 0
        : direction === "end"
          ? enabled.length - 1
          : (currentIndex + direction + enabled.length) % enabled.length;
    const next = enabled[nextIndex];
    if (!next) return;
    props.onChange(next.id);
    queueMicrotask(() => tabButtons.get(next.id)?.focus());
  };

  return (
    <div class={`vela-tabs ${props.class ?? ""}`}>
      <div class="vela-tabs__list" role="tablist" aria-label={props.label}>
        <For each={props.tabs}>
          {(tab) => (
            <button
              ref={(element) => {
                tabButtons.set(tab.id, element);
              }}
              id={`vela-tab-${tab.id}`}
              type="button"
              role="tab"
              class="vela-tabs__tab"
              data-tab-id={tab.id}
              aria-selected={tab.id === props.value}
              aria-controls={`vela-tabpanel-${tab.id}`}
              tabIndex={tab.id === props.value ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => props.onChange(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  move(1);
                } else if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  move(-1);
                } else if (event.key === "Home") {
                  event.preventDefault();
                  move("home");
                } else if (event.key === "End") {
                  event.preventDefault();
                  move("end");
                }
              }}
            >
              {tab.label}
            </button>
          )}
        </For>
      </div>
      <div
        id={`vela-tabpanel-${props.value}`}
        class="vela-tabs__panel"
        role="tabpanel"
        aria-labelledby={`vela-tab-${props.value}`}
        tabIndex={0}
      >
        {props.panel}
      </div>
    </div>
  );
}

export interface AccordionItem {
  id: string;
  title: JSX.Element;
  content: JSX.Element;
  disabled?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  defaultOpen?: string[];
  multiple?: boolean;
  class?: string;
}

export function Accordion(props: AccordionProps): JSX.Element {
  const [openIds, setOpenIds] = createSignal<string[]>(props.defaultOpen ?? []);

  const toggle = (id: string): void => {
    setOpenIds((current) => {
      const isOpen = current.includes(id);
      if (props.multiple) {
        return isOpen ? current.filter((item) => item !== id) : [...current, id];
      }
      return isOpen ? [] : [id];
    });
  };

  return (
    <div class={`vela-accordion ${props.class ?? ""}`}>
      <For each={props.items}>
        {(item) => {
          const open = () => openIds().includes(item.id);
          const panelId = `vela-accordion-panel-${item.id}`;
          const buttonId = `vela-accordion-button-${item.id}`;
          return (
            <div class="vela-accordion__item" data-open={open() ? "true" : "false"}>
              <h3 class="vela-accordion__heading">
                <button
                  id={buttonId}
                  type="button"
                  class="vela-accordion__trigger"
                  aria-expanded={open()}
                  aria-controls={panelId}
                  disabled={item.disabled}
                  onClick={() => toggle(item.id)}
                >
                  <span>{item.title}</span>
                  <span class="vela-accordion__marker" aria-hidden="true">
                    {open() ? "−" : "+"}
                  </span>
                </button>
              </h3>
              <Show when={open()}>
                <div id={panelId} class="vela-accordion__panel" role="region" aria-labelledby={buttonId}>
                  {item.content}
                </div>
              </Show>
            </div>
          );
        }}
      </For>
    </div>
  );
}

export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  label?: JSX.Element;
  class?: string;
}

export function Divider(props: DividerProps): JSX.Element {
  const vertical = () => props.orientation === "vertical";
  return (
    <div
      class={`vela-divider ${props.class ?? ""}`}
      role="separator"
      aria-orientation={vertical() ? "vertical" : "horizontal"}
      data-orientation={vertical() ? "vertical" : "horizontal"}
    >
      <Show when={props.label}>
        <span class="vela-divider__label">{props.label}</span>
      </Show>
    </div>
  );
}

export interface BreadcrumbItem {
  id: string;
  label: JSX.Element;
  href?: string;
  onClick?: () => void;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  label?: string;
  class?: string;
}

export function Breadcrumb(props: BreadcrumbProps): JSX.Element {
  return (
    <nav class={`vela-breadcrumb ${props.class ?? ""}`} aria-label={props.label ?? "Breadcrumb"}>
      <ol class="vela-breadcrumb__list">
        <For each={props.items}>
          {(item, index) => {
            const current = () => index() === props.items.length - 1;
            return (
              <li class="vela-breadcrumb__item">
                <Show
                  when={!current()}
                  fallback={
                    <span class="vela-breadcrumb__current" aria-current="page">
                      {item.label}
                    </span>
                  }
                >
                  <Show
                    when={item.href}
                    fallback={
                      <button type="button" class="vela-breadcrumb__link" onClick={() => item.onClick?.()}>
                        {item.label}
                      </button>
                    }
                  >
                    <a class="vela-breadcrumb__link" href={item.href}>
                      {item.label}
                    </a>
                  </Show>
                  <span class="vela-breadcrumb__separator" aria-hidden="true">
                    /
                  </span>
                </Show>
              </li>
            );
          }}
        </For>
      </ol>
    </nav>
  );
}

export type PaginationToken = number | "ellipsis";

export function paginationRange(page: number, pageCount: number, siblingCount = 1): PaginationToken[] {
  const total = Math.max(1, pageCount);
  const current = Math.max(1, Math.min(page, total));
  const visible = siblingCount * 2 + 5;
  if (total <= visible) return Array.from({ length: total }, (_, index) => index + 1);

  const left = Math.max(2, current - siblingCount);
  const right = Math.min(total - 1, current + siblingCount);
  const tokens: PaginationToken[] = [1];
  if (left > 2) tokens.push("ellipsis");
  for (let value = left; value <= right; value += 1) tokens.push(value);
  if (right < total - 1) tokens.push("ellipsis");
  tokens.push(total);
  return tokens;
}

export interface PaginationProps {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  siblingCount?: number;
  label?: string;
  class?: string;
}

export function Pagination(props: PaginationProps): JSX.Element {
  const last = () => Math.max(1, props.pageCount);
  const range = () => paginationRange(props.page, last(), props.siblingCount ?? 1);
  return (
    <nav class={`vela-pagination ${props.class ?? ""}`} aria-label={props.label ?? "Pagination"}>
      <button
        type="button"
        class="vela-pagination__button"
        aria-label="Previous page"
        disabled={props.page <= 1}
        onClick={() => props.onChange(Math.max(1, props.page - 1))}
      >
        ‹
      </button>
      <For each={range()}>
        {(token) =>
          token === "ellipsis" ? (
            <span class="vela-pagination__ellipsis" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              type="button"
              class="vela-pagination__button"
              aria-label={`Page ${token}`}
              aria-current={token === props.page ? "page" : undefined}
              onClick={() => props.onChange(token)}
            >
              {token}
            </button>
          )
        }
      </For>
      <button
        type="button"
        class="vela-pagination__button"
        aria-label="Next page"
        disabled={props.page >= last()}
        onClick={() => props.onChange(Math.min(last(), props.page + 1))}
      >
        ›
      </button>
    </nav>
  );
}

export interface ToolbarProps {
  label: string;
  children?: JSX.Element;
  class?: string;
}

export function Toolbar(props: ToolbarProps): JSX.Element {
  let root: HTMLDivElement | undefined;
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    if (!root) return;
    const controls = [...root.querySelectorAll<HTMLElement>("button:not([disabled]), [tabindex]")];
    if (controls.length === 0) return;
    const index = controls.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    const next =
      event.key === "ArrowRight"
        ? (index + 1 + controls.length) % controls.length
        : (index - 1 + controls.length) % controls.length;
    controls[next]?.focus();
  };

  return (
    <div
      ref={root}
      class={`vela-toolbar ${props.class ?? ""}`}
      role="toolbar"
      aria-label={props.label}
      onKeyDown={onKeyDown}
    >
      {props.children}
    </div>
  );
}

export interface StatusBarItem {
  id: string;
  label?: string;
  value?: JSX.Element;
}

export interface StatusBarProps {
  items?: StatusBarItem[];
  children?: JSX.Element;
  class?: string;
}

export function StatusBar(props: StatusBarProps): JSX.Element {
  return (
    <div class={`vela-status-bar ${props.class ?? ""}`} role="status">
      <Show when={props.items && props.items.length > 0} fallback={props.children}>
        <For each={props.items ?? []}>
          {(item) => (
            <span class="vela-status-bar__item">
              <Show when={item.label}>
                <span class="vela-status-bar__label">{item.label}</span>
              </Show>
              <span class="vela-status-bar__value">{item.value}</span>
            </span>
          )}
        </For>
      </Show>
    </div>
  );
}
