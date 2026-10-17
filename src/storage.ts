import { openDB } from "idb";
import type { LocalTask, Task } from "../shared/model";
const database = () =>
  openDB("sui-v1", 1, {
    upgrade(db) {
      db.createObjectStore("tasks", { keyPath: ["scope", "id"] });
    },
  });
export async function readTasks(scope: string): Promise<LocalTask[]> {
  const db = await database();
  const records = await db.getAll(
    "tasks",
    IDBKeyRange.bound([scope, ""], [scope, "\uffff"]),
  );
  return records
    .filter((t) => t.scope === scope)
    .map(({ scope: _, ...task }) => task);
}
export async function writeTask(scope: string, task: LocalTask) {
  const db = await database();
  const tx = db.transaction("tasks", "readwrite");
  const previous = await tx.store.get([scope, task.id]);
  const stored = {
    ...task,
    version: Math.max(task.version, previous?.version ?? 0),
  };
  await tx.store.put({ ...stored, scope });
  await tx.done;
  return stored;
}
export async function writeMany(scope: string, tasks: LocalTask[]) {
  const db = await database();
  const tx = db.transaction("tasks", "readwrite");
  await Promise.all([
    ...tasks.map((task) => tx.store.put({ ...task, scope })),
    tx.done,
  ]);
}
export async function applySync(
  scope: string,
  remote: Task[],
  sent: LocalTask[],
) {
  const db = await database(),
    tx = db.transaction("tasks", "readwrite");
  const rows = await tx.store.getAll(
    IDBKeyRange.bound([scope, ""], [scope, "\uffff"]),
  );
  const local: LocalTask[] = rows
    .filter((t) => t.scope === scope)
    .map(({ scope: _, ...task }) => task);
  const merged = mergeSync(local, remote, sent);
  await Promise.all(
    merged.tasks.map((task) => tx.store.put({ ...task, scope })),
  );
  await tx.done;
  return merged;
}
export function mergeSync(
  local: LocalTask[],
  remote: Task[],
  sent: LocalTask[],
): { tasks: LocalTask[]; conflicts: number } {
  const merged = new Map(local.map((t) => [t.id, t]));
  let conflicts = 0;
  for (const task of remote) {
    const current = merged.get(task.id),
      submitted = sent.find((t) => t.id === task.id);
    if (!current || !current.dirty) {
      merged.set(task.id, { ...task, dirty: false });
      continue;
    }
    if (current.mutationId === task.mutationId) {
      merged.set(task.id, { ...task, dirty: false });
      continue;
    }
    if (submitted?.mutationId === task.mutationId) {
      merged.set(task.id, { ...current, version: task.version });
      continue;
    }
    if (
      submitted?.mutationId === current.mutationId &&
      task.version !== submitted.version
    ) {
      // Keep both edits instead of silently overwriting another device's change.
      const copy = {
        ...current,
        id: crypto.randomUUID(),
        version: 0,
        mutationId: crypto.randomUUID(),
        dirty: true,
      };
      merged.set(copy.id, copy);
      merged.set(task.id, { ...task, dirty: false });
      conflicts++;
    }
  }
  return { tasks: [...merged.values()], conflicts };
}
