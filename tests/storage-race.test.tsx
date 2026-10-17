// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { act, renderHook, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as storage from "../src/storage";
import { useTasks } from "../src/useTasks";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it("同期結果の後に保存された編集がサーバーのversionを巻き戻さない", async () => {
  const { newTask } = await import("../shared/model");
  const scope = "race-version",
    task = newTask("メモ");
  await storage.writeTask(scope, { ...task, version: 2, dirty: false });
  await storage.writeTask(scope, { ...task, text: "同期中の編集", version: 1 });
  const stored = (await storage.readTasks(scope))[0];
  expect(stored.text).toBe("同期中の編集");
  expect(stored.version).toBe(2);
});
it("起動時の読込中に追加したメモを古い読込結果で消さない", async () => {
  const original = storage.readTasks;
  let release!: () => void, readDone!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve)),
    snapshotRead = new Promise<void>((resolve) => (readDone = resolve));
  vi.spyOn(storage, "readTasks").mockImplementationOnce(async (scope) => {
    const snapshot = await original(scope);
    readDone();
    await gate;
    return snapshot;
  });
  const notify = () => {},
    scope = "guest";
  const { result } = renderHook(() => useTasks(scope, notify));
  await snapshotRead;
  let adding!: Promise<boolean>;
  act(() => {
    adding = result.current.add("起動直後の入力");
  });
  await act(async () => {
    await adding;
  });
  await act(async () => {
    release();
  });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.tasks.map((t) => t.text)).toContain("起動直後の入力");
});
