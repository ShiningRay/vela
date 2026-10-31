import { createEffect, createMemo, createSignal } from "solid-js";
import { createDeepSignal } from "@vela/core";

export function Counter() {
  const [form, setForm] = createDeepSignal({ count: 0, meta: { label: "counter" } });
  const [effectRuns, setEffectRuns] = createSignal(0);
  const double = createMemo(() => form().count * 2);

  createEffect(() => {
    form();
    setEffectRuns((runs) => runs + 1);
  });

  const increment = () => {
    setForm((current) => ({ ...current, count: current.count + 1 }));
  };

  const writeEqualState = () => {
    setForm({ count: form().count, meta: { label: form().meta.label } });
  };

  const toggleLabel = () => {
    setForm((current) => ({
      ...current,
      meta: { label: current.meta.label === "counter" ? "ticked" : "counter" },
    }));
  };

  return (
    <main class="demo">
      <section class="demo__card">
        <p class="demo__eyebrow">Vela · @vela/core</p>
        <h1 class="demo__title">Signal model, borrowed from Citrine</h1>

        <div class="demo__readout">
          <span class="demo__number">{form().count}</span>
          <span class="demo__label">{form().meta.label}</span>
        </div>

        <p class="demo__line">
          double = <strong>{double()}</strong> · structural effect runs = <strong>{effectRuns()}</strong>
        </p>

        <div class="demo__actions">
          <button type="button" class="demo__button is-primary" onClick={increment}>
            +1
          </button>
          <button type="button" class="demo__button" onClick={writeEqualState}>
            Write equal state
          </button>
          <button type="button" class="demo__button" onClick={toggleLabel}>
            Toggle label
          </button>
        </div>

        <p class="demo__hint">
          “Write equal state” builds a fresh object with the same contents. Deep equality
          short-circuits it, so the effect count stays unchanged.
        </p>
      </section>
    </main>
  );
}
