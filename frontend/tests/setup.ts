import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(Element.prototype, "animate", {
  configurable: true,
  value: () => ({}),
});

Object.defineProperty(Element.prototype, "scrollTo", {
  configurable: true,
  value: () => {},
});

afterEach(cleanup);
