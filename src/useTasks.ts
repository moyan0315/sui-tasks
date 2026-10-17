import { useCallback, useEffect, useRef, useState } from "react";
import {
  newTask,
  type LocalTask,
  type Status,
  type Task,
} from "../shared/model";
import { applySync, readTasks, writeMany, writeTask } from "./storage";
export type SyncState = "local" | "syncing" | "synced" | "offline" | "error";
export function useTasks(scope: string, notify: (message: string) => void) {
  const [tasks, setTasks] = useState<LocalTask[]>([]),
    [loading, setLoading] = useState(true),
    [syncState, setSyncState] = useState<SyncState>("local");
  const current = useRef(tasks),
    activeScope = useRef(scope),
    lock = useRef(false),
    generation = useRef(0);
  const update = useCallback((value: LocalTask[]) => {
    current.current = value;
    setTasks(value);
  }, []);
  useEffect(() => {
    const gen = ++generation.current;
    activeScope.current = scope;
    lock.current = false;
    setLoading(true);
    setSyncState("local");
    update([]);
    readTasks(scope)
      .then((value) => {
        if (gen === generation.current) {
          const byId = new Map(value.map((t) => [t.id, t]));
          for (const t of current.current) byId.set(t.id, t);
          update([...byId.values()]);
          setLoading(false);
        }
      })
      .catch(() => {
        if (gen === generation.current) {
          setLoading(false);
          setSyncState("error");
          notify(
            "端末に保存できません。ブラウザの保存設定を確認してください。",
          );
        }
      });
  }, [scope, update, notify]);
  const sync = useCallback(async () => {
    if (scope === "guest" || loading || lock.current) return;
    if (!navigator.onLine) {
      setSyncState("offline");
      return;
    }
    const gen = generation.current;
    lock.current = true;
    setSyncState("syncing");
    try {
      const sent = current.current.filter((t) => t.dirty).slice(0, 50);
      const response = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tasks: sent.map(({ dirty: _, ...task }) => task),
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "ログインし直してください。端末の変更は保持されています。"
            : "同期できません。端末の変更は保持されています。",
        );
      const data = (await response.json()) as { tasks: Task[] };
      if (gen !== generation.current) return;
      const merged = await applySync(scope, data.tasks, sent);
      if (gen !== generation.current) return;
      update(merged.tasks);
      setSyncState(merged.tasks.some((t) => t.dirty) ? "local" : "synced");
      if (merged.conflicts)
        notify("別の端末の変更がありました。両方のメモを残しました。");
    } catch (error) {
      if (gen === generation.current)
        setSyncState(navigator.onLine ? "error" : "offline");
    } finally {
      if (gen === generation.current) lock.current = false;
    }
  }, [scope, loading, update, notify]);
  useEffect(() => {
    void sync();
    const timer = setInterval(() => void sync(), 15000);
    const online = () => void sync();
    window.addEventListener("online", online);
    const offline = () => setSyncState(scope === "guest" ? "local" : "offline");
    window.addEventListener("offline", offline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [sync, scope]);
  const persist = useCallback(
    async (task: LocalTask) => {
      const targetScope = activeScope.current,
        gen = generation.current;
      try {
        const stored = await writeTask(targetScope, task);
        if (gen !== generation.current) return false;
        update([...current.current.filter((t) => t.id !== task.id), stored]);
        setSyncState("local");
        return true;
      } catch {
        notify("保存できませんでした。入力内容をコピーして保管してください。");
        setSyncState("error");
        return false;
      }
    },
    [update, notify],
  );
  const add = useCallback(
    async (text: string) => {
      if (!text.trim() || text.trim().length > 10000) return false;
      return persist(newTask(text));
    },
    [persist],
  );
  const edit = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Task, "text" | "status" | "deleted">>,
    ) => {
      const task = current.current.find((t) => t.id === id);
      if (!task) return false;
      return persist({
        ...task,
        ...patch,
        updatedAt: new Date().toISOString(),
        mutationId: crypto.randomUUID(),
        dirty: true,
      });
    },
    [persist],
  );
  const changeStatus = useCallback(
    (id: string, status: Status) => edit(id, { status }),
    [edit],
  );
  useEffect(() => {
    if (scope === "guest" || loading || !tasks.some((t) => t.dirty)) return;
    const timer = setTimeout(() => void sync(), 500);
    return () => clearTimeout(timer);
  }, [tasks, scope, loading, sync]);
  const importGuest = useCallback(async () => {
    const guests = await readTasks("guest");
    const copies = guests
      .filter((t) => !t.deleted)
      .map((t) => ({ ...newTask(t.text), status: t.status }));
    await writeMany(scope, copies);
    update([...current.current, ...copies]);
    notify(
      `${copies.length}件取り込みました。端末の元データも保持しています。`,
    );
  }, [scope, update, notify]);
  return {
    tasks,
    loading,
    syncState,
    add,
    edit,
    changeStatus,
    sync,
    importGuest,
  };
}
