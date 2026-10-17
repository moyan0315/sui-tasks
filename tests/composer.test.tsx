// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import {
  render,
  cleanup,
  fireEvent,
  act,
  screen,
} from "@testing-library/react";
import { Composer } from "../src/components/Composer";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("追加の保存待ち中に書き始めた次のメモを消さない", async () => {
  localStorage.clear();
  let finish!: (saved: boolean) => void;
  const pending = new Promise<boolean>((resolve) => (finish = resolve));
  render(
    <Composer
      scope="guest"
      onAdd={() => pending}
      notify={() => {}}
      syncState="local"
    />,
  );
  const input = screen.getByRole("textbox", { name: "メモを書く" });
  fireEvent.change(input, { target: { value: "最初のメモ" } });
  fireEvent.click(screen.getByRole("button", { name: "メモを追加" }));
  fireEvent.change(input, { target: { value: "保存中に入力した次のメモ" } });
  await act(async () => {
    finish(true);
    await pending;
  });
  expect((input as HTMLTextAreaElement).value).toBe("保存中に入力した次のメモ");
});
it("IME変換中のCtrl+Enterでは送信しない", () => {
  localStorage.clear();
  const add = vi.fn(async () => true);
  render(
    <Composer scope="guest" onAdd={add} notify={() => {}} syncState="local" />,
  );
  const input = screen.getByRole("textbox", { name: "メモを書く" });
  fireEvent.change(input, { target: { value: "にほんご" } });
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "Enter", ctrlKey: true, isComposing: true });
  expect(add).not.toHaveBeenCalled();
});
it("保存が禁止されたブラウザでもメモ入力画面が開く", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Blocked", "SecurityError");
  });
  expect(() =>
    render(
      <Composer
        scope="guest"
        onAdd={async () => true}
        notify={() => {}}
        syncState="local"
      />,
    ),
  ).not.toThrow();
});
