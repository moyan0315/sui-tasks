// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import App from "../src/App";
import * as storage from "../src/storage";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("全画面スケルトン表示中にもメモを書ける", () => {
  vi.spyOn(storage, "readTasks").mockImplementation(
    () => new Promise(() => {}),
  );
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string) =>
      input === "/api/me"
        ? new Response("", { status: 401 })
        : Response.json({ google: false }),
    ),
  );
  render(<App />);
  expect(screen.getByRole("status", { name: "メモを読み込み中" })).toBeTruthy();
  const input = screen.getByRole("textbox", {
    name: "メモを書く",
  }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: "読込中の下書き" } });
  expect(input.value).toBe("読込中の下書き");
  expect(
    (screen.getByRole("button", { name: "メモを追加" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});
