// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Sheet } from "../src/components/Sheet";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("シートを閉じると開いた操作へフォーカスを戻す", () => {
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
    this.querySelector("button")?.focus();
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
  const trigger = document.createElement("button");
  trigger.textContent = "開く";
  document.body.appendChild(trigger);
  trigger.focus();
  const { unmount } = render(
    <Sheet title="確認" onClose={() => {}}>
      内容
    </Sheet>,
  );
  unmount();
  expect(document.activeElement).toBe(trigger);
  trigger.remove();
});
