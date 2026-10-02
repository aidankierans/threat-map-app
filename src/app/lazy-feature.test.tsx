/** @vitest-environment jsdom */
import { afterEach, expect, it, vi } from "vitest";
import { render } from "preact";
import { act } from "preact/test-utils";
import { lazyFeature } from "./lazy-feature.js";

const host = document.createElement("div");
afterEach(() => act(() => render(null, host)));

it("loads only when rendered, preserves the surrounding UI, and uses current props", async () => {
  let finish!: (module: { default: (props: { name: string }) => preact.JSX.Element }) => void;
  const load = vi.fn(() => new Promise<{ default: (props: { name: string }) => preact.JSX.Element }>(resolve => { finish = resolve; }));
  const Feature = lazyFeature(load, "example");
  expect(load).not.toHaveBeenCalled();
  act(() => render(<><button>Navigation</button><Feature name="first" /></>, host));
  expect(host.querySelector("button")?.textContent).toBe("Navigation");
  expect(host.textContent).toContain("Loading example");
  act(() => render(<><button>Navigation</button><Feature name="latest" /></>, host));
  await act(async () => finish({ default: ({ name }) => <p>{name}</p> }));
  await vi.waitFor(() => expect(host.textContent).toContain("latest"));
  expect(host.textContent).not.toContain("Loading");
  expect(load).toHaveBeenCalledTimes(1);
});

it("contains a failed download and lets the reader retry", async () => {
  const load = vi.fn<() => Promise<{ default: () => preact.JSX.Element }>>()
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ default: () => <p>Ready</p> });
  const Feature = lazyFeature(load, "example");
  await act(async () => render(<Feature />, host));
  await vi.waitFor(() => expect(host.querySelector('[role="alert"]')?.textContent).toContain("Could not load example"));
  await act(async () => host.querySelector("button")!.click());
  await vi.waitFor(() => expect(host.textContent).toBe("Ready"));
  expect(load).toHaveBeenCalledTimes(2);
});

it("allows leaving before download completes and reuses the result on return", async () => {
  let finish!: (module: { default: () => preact.JSX.Element }) => void;
  const load = vi.fn(() => new Promise<{ default: () => preact.JSX.Element }>(resolve => { finish = resolve; }));
  const Feature = lazyFeature(load, "example");
  act(() => render(<Feature />, host));
  act(() => render(<p>Map</p>, host));
  await act(async () => finish({ default: () => <p>Ready</p> }));
  expect(host.textContent).toBe("Map");
  act(() => render(<Feature />, host));
  expect(host.textContent).toBe("Ready");
  expect(load).toHaveBeenCalledTimes(1);
});
