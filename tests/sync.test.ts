import { describe, it, expect } from "vitest";
import { mergeSync } from "../src/storage";
import { moveStatus, newTask } from "../shared/model";
import { taskSchema } from "../shared/validation";
describe("タスクの状態と入力", () => {
  it.each([
    ["todo", -1, "todo"],
    ["todo", 1, "doing"],
    ["doing", 1, "done"],
    ["done", 1, "done"],
    ["done", -1, "doing"],
  ] as const)("%sを%d動かすと%s", (from, direction, to) =>
    expect(moveStatus(from, direction)).toBe(to),
  );
  it("空白と長すぎる入力を拒否する", () => {
    expect(taskSchema.safeParse({ ...newTask("x"), text: "   " }).success).toBe(
      false,
    );
    expect(
      taskSchema.safeParse({ ...newTask("x"), text: "x".repeat(10001) })
        .success,
    ).toBe(false);
  });
});
describe("同期の競合", () => {
  it("サーバー確認後にdirtyを解除する", () => {
    const local = newTask("メモ");
    const merged = mergeSync([local], [{ ...local, version: 1 }], [local]);
    expect(merged.tasks[0].dirty).toBe(false);
    expect(merged.tasks[0].version).toBe(1);
  });
  it("送信待ちの新規メモは消さない", () => {
    const local = newTask("未送信");
    expect(mergeSync([local], [], []).tasks).toEqual([local]);
  });
  it("送信中の追加編集は保持し、次回送信用のversionだけ進める", () => {
    const sent = newTask("送信した文");
    const newer = {
      ...sent,
      text: "その後の編集",
      mutationId: crypto.randomUUID(),
    };
    const result = mergeSync([newer], [{ ...sent, version: 1 }], [sent]);
    expect(result.tasks[0].text).toBe("その後の編集");
    expect(result.tasks[0].dirty).toBe(true);
    expect(result.tasks[0].version).toBe(1);
  });
  it("別端末との編集衝突では双方を保持する", () => {
    const sent = { ...newTask("自分の編集"), version: 2 };
    const remote = {
      ...sent,
      text: "別端末の編集",
      version: 3,
      mutationId: crypto.randomUUID(),
    };
    const result = mergeSync([sent], [remote], [sent]);
    expect(result.tasks.map((t) => t.text).sort()).toEqual([
      "別端末の編集",
      "自分の編集",
    ]);
    expect(result.conflicts).toBe(1);
    expect(result.tasks.find((t) => t.text === "自分の編集")?.version).toBe(0);
  });
  it("他端末での削除を反映し、未送信のローカル削除は復活させない", () => {
    const local = { ...newTask("削除対象"), dirty: false, version: 1 };
    expect(
      mergeSync([local], [{ ...local, deleted: true, version: 2 }], []).tasks[0]
        .deleted,
    ).toBe(true);
    const pending = {
      ...local,
      deleted: true,
      dirty: true,
      mutationId: crypto.randomUUID(),
    };
    expect(mergeSync([pending], [local], []).tasks[0].deleted).toBe(true);
  });
});
