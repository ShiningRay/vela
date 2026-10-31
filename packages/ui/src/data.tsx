import { createSignal, For, Show, type JSX } from "solid-js";
import { IconButton } from "./primitives/button";

export interface ListItem {
  id: string;
  label: JSX.Element;
  description?: JSX.Element;
  icon?: JSX.Element;
  meta?: JSX.Element;
  disabled?: boolean;
}

export interface ListProps {
  items: ListItem[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  label?: string;
  empty?: JSX.Element;
  class?: string;
}

export function List(props: ListProps): JSX.Element {
  return (
    <ul class={`vela-list ${props.class ?? ""}`} role="listbox" aria-label={props.label}>
      <Show
        when={props.items.length > 0}
        fallback={<li class="vela-list__empty">{props.empty ?? "No items"}</li>}
      >
        <For each={props.items}>
          {(item) => (
            <li class="vela-list__item">
              <button
                type="button"
                role="option"
                class="vela-list__row"
                aria-selected={props.selectedId === item.id}
                data-active={props.selectedId === item.id ? "true" : "false"}
                disabled={item.disabled}
                onClick={() => props.onSelect?.(item.id)}
              >
                <Show when={item.icon}>
                  <span class="vela-list__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                </Show>
                <span class="vela-list__text">
                  <span class="vela-list__label">{item.label}</span>
                  <Show when={item.description}>
                    <span class="vela-list__description">{item.description}</span>
                  </Show>
                </span>
                <Show when={item.meta}>
                  <span class="vela-list__meta">{item.meta}</span>
                </Show>
              </button>
            </li>
          )}
        </For>
      </Show>
    </ul>
  );
}

export interface TableColumn {
  id: string;
  label: JSX.Element;
  align?: "left" | "center" | "right";
}

export interface TableRow {
  id: string;
  cells: Record<string, JSX.Element | string | number | null | undefined>;
}

export interface TableProps {
  columns: TableColumn[];
  rows: TableRow[];
  caption?: string;
  empty?: JSX.Element;
  class?: string;
}

export function Table(props: TableProps): JSX.Element {
  return (
    <table class={`vela-table ${props.class ?? ""}`}>
      <Show when={props.caption}>
        <caption>{props.caption}</caption>
      </Show>
      <thead>
        <tr>
          <For each={props.columns}>
            {(column) => (
              <th scope="col" style={{ "text-align": column.align ?? "left" }}>
                {column.label}
              </th>
            )}
          </For>
        </tr>
      </thead>
      <tbody>
        <Show
          when={props.rows.length > 0}
          fallback={
            <tr>
              <td class="vela-table__empty" colSpan={props.columns.length}>
                {props.empty ?? "No rows"}
              </td>
            </tr>
          }
        >
          <For each={props.rows}>
            {(row) => (
              <tr>
                <For each={props.columns}>
                  {(column) => (
                    <td style={{ "text-align": column.align ?? "left" }}>
                      {row.cells[column.id]}
                    </td>
                  )}
                </For>
              </tr>
            )}
          </For>
        </Show>
      </tbody>
    </table>
  );
}

export interface TreeNode {
  id: string;
  label: JSX.Element;
  children?: TreeNode[];
  disabled?: boolean;
}

export interface TreeProps {
  nodes: TreeNode[];
  defaultExpanded?: string[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  label?: string;
  class?: string;
}

interface TreeBranchProps {
  node: TreeNode;
  level: number;
  openIds: () => string[];
  toggle: (id: string) => void;
  selectedId: () => string | undefined;
  onSelect?: (id: string) => void;
}

function TreeBranch(props: TreeBranchProps): JSX.Element {
  const open = () => props.openIds().includes(props.node.id);
  const hasChildren = () => (props.node.children?.length ?? 0) > 0;
  return (
    <li
      role="treeitem"
      class="vela-tree__item"
      aria-level={props.level}
      aria-expanded={hasChildren() ? open() : undefined}
      aria-selected={props.selectedId() === props.node.id}
      data-active={props.selectedId() === props.node.id ? "true" : "false"}
    >
      <div
        class="vela-tree__row"
        tabIndex={props.node.disabled ? -1 : 0}
        aria-disabled={props.node.disabled}
        onClick={() => {
          if (props.node.disabled) return;
          props.onSelect?.(props.node.id);
        }}
        onKeyDown={(event) => {
          if (props.node.disabled) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            props.onSelect?.(props.node.id);
          } else if (event.key === "ArrowRight" && hasChildren() && !open()) {
            event.preventDefault();
            props.toggle(props.node.id);
          } else if (event.key === "ArrowLeft" && hasChildren() && open()) {
            event.preventDefault();
            props.toggle(props.node.id);
          }
        }}
      >
        <Show
          when={hasChildren()}
          fallback={<span class="vela-tree__toggle-placeholder" aria-hidden="true" />}
        >
          <button
            type="button"
            class="vela-tree__toggle"
            aria-label={open() ? "Collapse" : "Expand"}
            onClick={(event) => {
              event.stopPropagation();
              props.toggle(props.node.id);
            }}
          >
            {open() ? "▾" : "▸"}
          </button>
        </Show>
        <span class="vela-tree__label">{props.node.label}</span>
      </div>
      <Show when={hasChildren() && open()}>
        <ul role="group" class="vela-tree__group">
          <For each={props.node.children}>
            {(child) => (
              <TreeBranch
                {...props}
                node={child}
                level={props.level + 1}
                openIds={props.openIds}
                selectedId={props.selectedId}
                toggle={props.toggle}
              />
            )}
          </For>
        </ul>
      </Show>
    </li>
  );
}

export function Tree(props: TreeProps): JSX.Element {
  const [openIds, setOpenIds] = createSignal(props.defaultExpanded ?? []);
  const toggle = (id: string): void => {
    setOpenIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  };

  return (
    <ul class={`vela-tree ${props.class ?? ""}`} role="tree" aria-label={props.label}>
      <For each={props.nodes}>
        {(node) => (
          <TreeBranch
            {...props}
            node={node}
            level={1}
            openIds={openIds}
            selectedId={() => props.selectedId}
            toggle={toggle}
          />
        )}
      </For>
    </ul>
  );
}

export interface KvItem {
  id: string;
  label: JSX.Element;
  value: JSX.Element;
}

export interface KvProps {
  items: KvItem[];
  columns?: 1 | 2;
  class?: string;
}

export function Kv(props: KvProps): JSX.Element {
  return (
    <dl class={`vela-kv ${props.class ?? ""}`} data-columns={props.columns ?? 1}>
      <For each={props.items}>
        {(item) => (
          <div class="vela-kv__pair">
            <dt class="vela-kv__label">{item.label}</dt>
            <dd class="vela-kv__value">{item.value}</dd>
          </div>
        )}
      </For>
    </dl>
  );
}

export type TagTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface TagProps {
  children?: JSX.Element;
  tone?: TagTone;
  onRemove?: () => void;
  class?: string;
}

export function Tag(props: TagProps): JSX.Element {
  return (
    <span class={`vela-tag ${props.class ?? ""}`} data-tone={props.tone ?? "neutral"}>
      <span class="vela-tag__label">{props.children}</span>
      <Show when={props.onRemove}>
        <IconButton label="Remove tag" onClick={() => props.onRemove?.()}>
          ×
        </IconButton>
      </Show>
    </span>
  );
}

export interface BadgeProps {
  children?: JSX.Element;
  tone?: TagTone;
  dot?: boolean;
  class?: string;
}

export function Badge(props: BadgeProps): JSX.Element {
  return (
    <span class={`vela-badge ${props.class ?? ""}`} data-tone={props.tone ?? "neutral"}>
      <Show when={props.dot}>
        <span class="vela-badge__dot" aria-hidden="true" />
      </Show>
      {props.children}
    </span>
  );
}
