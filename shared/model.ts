import type { z } from "zod";
import type { taskSchema } from "./validation";
export const statuses = ["todo", "doing", "done"] as const;
export type Status = (typeof statuses)[number];
export const labels: Record<Status, string> = {
  todo: "未着手",
  doing: "進行中",
  done: "完了",
};
export type Task = z.infer<typeof taskSchema>;
export type LocalTask = Task & { dirty: boolean };
export type User = { id: string; name: string; email: string };
export function moveStatus(status: Status, direction: number): Status {
  return statuses[
    Math.max(0, Math.min(2, statuses.indexOf(status) + direction))
  ];
}
export function newTask(text: string): LocalTask {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    status: "todo",
    createdAt: now,
    updatedAt: now,
    deleted: false,
    version: 0,
    mutationId: crypto.randomUUID(),
    dirty: true,
  };
}
