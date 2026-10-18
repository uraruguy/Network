// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Combobox, type ComboboxProps } from "./Combobox";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type City = { id: string; name: string };
const CITIES: City[] = [
  { id: "lj", name: "Ljubljana" },
  { id: "ln", name: "London" },
  { id: "li", name: "Lisbon" },
];

let root: Root;
let host: HTMLElement;

function render(props: ComboboxProps<City>) {
  act(() => root.render(createElement(Combobox<City>, props)));
}
const input = () => host.querySelector<HTMLInputElement>('input[role="combobox"]')!;
const options = () => Array.from(document.querySelectorAll('[role="option"]')).map((o) => o.textContent);

function key(el: HTMLElement, k: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  });
}

/** Types into the input the way a keyboard does (an InputEvent with inputType). */
function type(el: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(el, value);
    el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value.slice(-1) }));
  });
}

const common = {
  getKey: (c: City) => c.id,
  getLabel: (c: City) => c.name,
  renderItem: (c: City) => c.name,
  "aria-label": "City",
};

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("Combobox", () => {
  it("Escape with the popup closed keeps the selection (single) and lets the key reach a parent sheet", () => {
    const onChange = vi.fn();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    render({ ...common, search: () => CITIES, value: CITIES[0]!, onChange });
    act(() => input().focus());
    expect(input().getAttribute("aria-expanded")).not.toBe("true");
    key(input(), "Escape");
    document.removeEventListener("keydown", outer);
    expect(onChange).not.toHaveBeenCalled();
    expect(outer).toHaveBeenCalledTimes(1);
  });

  it("Escape with the popup closed keeps every chip (multiple)", () => {
    const onChange = vi.fn();
    render({ ...common, multiple: true, search: () => CITIES, value: [CITIES[0]!, CITIES[1]!], onChange });
    act(() => input().focus());
    key(input(), "Escape");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Backspace in an empty input removes the last chip", () => {
    const onChange = vi.fn();
    render({ ...common, multiple: true, search: () => CITIES, value: [CITIES[0]!, CITIES[1]!], onChange });
    act(() => input().focus());
    key(input(), "Backspace");
    expect(onChange).toHaveBeenCalledWith([CITIES[0]]);
  });

  it("typing fast into a closed single-select runs the debounced search for the typed text", async () => {
    vi.useFakeTimers();
    const search = vi.fn((q: string) => CITIES.filter((c) => q && c.name.toLowerCase().startsWith(q.toLowerCase())));
    render({ ...common, search, debounceMs: 150, value: null, onChange: () => {} });
    act(() => input().focus());
    // One keystroke that also opens the popup: the open must not replace the pending search with "".
    type(input(), "lj");
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(search).toHaveBeenLastCalledWith("lj");
    expect(search).not.toHaveBeenCalledWith("");
    expect(options()).toEqual(["Ljubljana"]);
  });
});
