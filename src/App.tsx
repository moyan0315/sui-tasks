import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CloudArrowUp,
  DownloadSimple,
  GoogleLogo,
  MagnifyingGlass,
  Note,
  SignOut,
  GearSix,
  Sparkle,
  Trash,
  UserCircle,
  User as UserIcon,
  WifiSlash,
  X,
} from "@phosphor-icons/react";
import {
  labels,
  statuses,
  type LocalTask,
  type Status,
  type User,
} from "../shared/model";
import { Composer } from "./components/Composer";
import { Sheet } from "./components/Sheet";
import { Skeleton } from "./components/Skeleton";
import { TaskRow } from "./components/TaskRow";
import { readTasks } from "./storage";
import { useTasks } from "./useTasks";

type Page = "memo" | "search" | "settings";
type Toast = { message: string; action?: () => void };
type AIState = {
  loading: boolean;
  error: string;
  items: string[];
  selected: Set<number>;
};
function App() {
  const [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState<Page>("memo"),
    [filter, setFilter] = useState<Status | "all">("all"),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState<Toast | null>(null),
    [editing, setEditing] = useState<LocalTask | null>(null),
    [editText, setEditText] = useState(""),
    [editStatus, setEditStatus] = useState<Status>("todo"),
    [confirmDelete, setConfirmDelete] = useState(false),
    [account, setAccount] = useState(false),
    [googleReady, setGoogleReady] = useState(false),
    [accountError, setAccountError] = useState(""),
    [ai, setAi] = useState<AIState | null>(null),
    [guestCount, setGuestCount] = useState(0),
    [imported, setImported] = useState(false),
    [busy, setBusy] = useState(false);
  const notify = useCallback((message: string) => setToast({ message }), []);
  const scope = user?.id || "guest";
  const {
    tasks,
    loading,
    syncState,
    add,
    edit,
    changeStatus,
    sync,
    importGuest,
  } = useTasks(scope, notify);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", { signal: controller.signal })
      .then(async (r) => {
        if (r.ok) {
          setUser(((await r.json()) as { user: User }).user);
          setAccountError("");
        } else if (r.status !== 401)
          setAccountError(
            "ログイン状態を取得できません。再接続して試してください。",
          );
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setAccountError("ネットワークに接続されていません。");
      });
    fetch("/api/status", { signal: controller.signal })
      .then((r) => r.json())
      .then((s) => setGoogleReady(Boolean((s as { google: boolean }).google)))
      .catch(() => setGoogleReady(false));
    const auth = new URLSearchParams(location.search).get("auth");
    if (auth) {
      setAccount(true);
      setAccountError(
        auth === "unconfigured"
          ? "Google認証はまだ設定されていません。"
          : "ログインできませんでした。もう一度試してください。",
      );
      history.replaceState(null, "", location.pathname);
    }
    return () => controller.abort();
  }, []);
  useEffect(() => {
    void readTasks("guest")
      .then((t) => setGuestCount(t.filter((t) => !t.deleted).length))
      .catch(() => {});
  }, [user, page, account]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.action ? 10000 : 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  const visible = useMemo(
    () =>
      tasks
        .filter(
          (t) =>
            !t.deleted &&
            (filter === "all" || t.status === filter) &&
            (page !== "search" ||
              t.text.toLocaleLowerCase().includes(query.toLocaleLowerCase())),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [tasks, filter, page, query],
  );
  const openEdit = (task: LocalTask) => {
    setEditing(task);
    setEditText(task.text);
    setEditStatus(task.status);
    setConfirmDelete(false);
  };
  const closeEdit = () => {
    setEditing(null);
    setConfirmDelete(false);
  };
  const onStatus = async (task: LocalTask, status: Status) => {
    if (await changeStatus(task.id, status)) {
      setToast({
        message: `${labels[status]}に変更`,
        action: () => void changeStatus(task.id, task.status),
      });
    }
  };
  const saveEdit = async () => {
    if (!editing || !editText.trim()) return;
    setBusy(true);
    if (await edit(editing.id, { text: editText.trim(), status: editStatus })) {
      closeEdit();
      notify("変更を保存しました。");
    }
    setBusy(false);
  };
  const remove = async () => {
    if (!editing) return;
    const task = editing;
    if (await edit(task.id, { deleted: true })) {
      closeEdit();
      setToast({
        message: "メモを削除しました。",
        action: () => void edit(task.id, { deleted: false }),
      });
    }
  };
  const logout = async () => {
    setBusy(true);
    try {
      const r = await fetch("/api/auth/logout", { method: "POST" });
      if (!r.ok) throw new Error();
      setUser(null);
      setAccount(false);
      setImported(false);
      notify("ログアウトしました。");
    } catch {
      setAccountError("ログアウトできませんでした。接続を確認してください。");
    } finally {
      setBusy(false);
    }
  };
  const askAI = async () => {
    if (!editText.trim()) return;
    if (!user) {
      setAccount(true);
      return;
    }
    const text = editText;
    setAi({ loading: true, error: "", items: [], selected: new Set() });
    try {
      const r = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(45000),
      });
      const data = await r.json();
      if (!r.ok)
        throw new Error(
          (data as { error?: string }).error || "AIを利用できません。",
        );
      const { candidatesSchema } = await import("../shared/validation");
      const items = candidatesSchema.parse(data).tasks.map((t) => t.text);
      setAi({
        loading: false,
        error: "",
        items,
        selected: new Set(items.map((_, i) => i)),
      });
    } catch (e) {
      setAi({
        loading: false,
        error:
          e instanceof Error && e.name !== "TimeoutError"
            ? e.message
            : "時間がかかっています。メモを保持したまま、もう一度試せます。",
        items: [],
        selected: new Set(),
      });
    }
  };
  const adopt = async () => {
    if (!ai) return;
    setBusy(true);
    let count = 0;
    for (const i of ai.selected) {
      if (await add(ai.items[i])) count++;
      else break;
    }
    setBusy(false);
    setAi(null);
    closeEdit();
    notify(`${count}件のタスクを追加しました。`);
  };
  const exportTasks = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          tasks.filter((t) => !t.deleted).map(({ dirty: _, ...t }) => t),
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `sui-${new Intl.DateTimeFormat("sv-SE").format(new Date())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const accountContent = (
    <>
      <div className="account-summary">
        <div className="account-avatar">
          <UserCircle size={38} />
        </div>
        {user ? (
          <div>
            <strong>{user.name}</strong>
            <p>{user.email}</p>
          </div>
        ) : (
          <span>未ログイン</span>
        )}
      </div>
      {accountError && (
        <p className="inline-error" role="alert">
          {accountError}
        </p>
      )}
      {!user ? (
        <>
          <a
            className={`button primary google ${!googleReady ? "unavailable" : ""}`}
            href={googleReady ? "/api/auth/login" : undefined}
            aria-disabled={!googleReady}
          >
            <GoogleLogo size={22} weight="bold" />
            Googleでログイン
          </a>
          {!googleReady && (
            <p className="helper">
              Google認証の接続設定が必要です。メモは端末に保存できます。
            </p>
          )}
        </>
      ) : (
        <>
          <p className="helper">
            {syncState === "synced"
              ? "クラウドと同期済み"
              : syncState === "syncing"
                ? "同期中…"
                : "端末の変更を同期できます。"}
          </p>
          <button
            className="button"
            onClick={() => void sync()}
            disabled={syncState === "syncing"}
          >
            <CloudArrowUp size={20} />
            今すぐ同期
          </button>
          {guestCount > 0 && !imported && (
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await importGuest();
                  setImported(true);
                } catch {
                  notify("取り込めませんでした。元のメモは保持されています。");
                } finally {
                  setBusy(false);
                }
              }}
            >
              端末の{guestCount}件を取り込む
            </button>
          )}
          <button
            className="button"
            disabled={busy}
            onClick={() => void logout()}
          >
            <SignOut size={20} />
            ログアウト
          </button>
        </>
      )}
    </>
  );
  return (
    <>
      <div className="ambient" aria-hidden="true" />
      <main className="app-shell">
        <header className="topbar">
          <a className="brand" href="/" aria-label="sui ホーム">
            <img src="/icon.svg" alt="" width="32" height="40" />
            <span>sui</span>
          </a>
          <button
            className="icon-button account-button glass"
            aria-label="アカウント"
            onClick={() => setAccount(true)}
          >
            <UserIcon size={26} />
          </button>
        </header>
        <AnimatePresence mode="wait" initial={false}>
          <motion.section
            key={page}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="page"
          >
            <div className="page-heading">
              <h1>
                {page === "memo" ? "メモ" : page === "search" ? "検索" : "設定"}
              </h1>
              {page === "memo" && (
                <time>
                  {new Intl.DateTimeFormat("ja-JP", {
                    month: "long",
                    day: "numeric",
                    weekday: "short",
                  }).format(new Date())}
                </time>
              )}
            </div>
            {page === "memo" && (
              <Composer
                key={scope}
                scope={scope}
                onAdd={add}
                notify={notify}
                syncState={syncState}
              />
            )}
            {page === "search" && (
              <label className="search-field glass">
                <MagnifyingGlass size={23} />
                <input
                  aria-label="メモを検索"
                  placeholder="メモを検索…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
                {query && (
                  <button
                    className="icon-button"
                    aria-label="検索をクリア"
                    onClick={() => setQuery("")}
                  >
                    <X size={18} />
                  </button>
                )}
              </label>
            )}
            {page !== "settings" ? (
              <>
                <div
                  className="filters glass"
                  aria-label="ステータスで絞り込む"
                >
                  {(["all", ...statuses] as const).map((status) => (
                    <button
                      key={status}
                      aria-pressed={filter === status}
                      onClick={() => setFilter(status)}
                    >
                      {filter === status && (
                        <motion.span
                          className="filter-selected"
                          layoutId="filter"
                          transition={{
                            type: "spring",
                            stiffness: 450,
                            damping: 35,
                          }}
                        />
                      )}
                      <span>
                        {status === "all" ? "すべて" : labels[status]}
                      </span>
                    </button>
                  ))}
                </div>
                <ul
                  className="task-list"
                  aria-label="タスク一覧"
                  aria-busy={loading}
                >
                  <AnimatePresence initial={false}>
                    {visible.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        onStatus={(status) => void onStatus(task, status)}
                        onEdit={() => openEdit(task)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
                {!loading && !visible.length && (
                  <motion.div
                    className="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    <Note size={30} weight="light" />
                    <p>
                      {page === "search" && query
                        ? "見つかりませんでした"
                        : filter === "all"
                          ? "メモはまだありません"
                          : `${labels[filter]}のメモはありません`}
                    </p>
                  </motion.div>
                )}
                {visible.length > 0 && (
                  <p className="swipe-hint">
                    <ArrowLeft size={15} />
                    戻す<span>·</span>進める
                    <ArrowRight size={15} />
                  </p>
                )}
              </>
            ) : (
              <div className="settings-content">
                <section className="settings-group glass">
                  <h2>アカウント</h2>
                  {accountContent}
                </section>
                <section className="settings-group glass">
                  <h2>データ</h2>
                  <button className="button" onClick={exportTasks}>
                    <DownloadSimple size={20} />
                    メモを書き出す
                  </button>
                  <p className="helper">
                    JSON形式 · {tasks.filter((t) => !t.deleted).length}件
                  </p>
                </section>
                <p className="version">sui 0.1.0</p>
              </div>
            )}
          </motion.section>
        </AnimatePresence>
        <nav className="bottom-nav glass" aria-label="メインナビゲーション">
          {(
            [
              { id: "memo", label: "メモ", Icon: Note },
              { id: "search", label: "検索", Icon: MagnifyingGlass },
              { id: "settings", label: "設定", Icon: GearSix },
            ] as const
          ).map(({ id, label, Icon }) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              aria-current={page === id ? "page" : undefined}
              onClick={() => setPage(id)}
            >
              {page === id && (
                <motion.span
                  className="nav-selected"
                  layoutId="navigation"
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                />
              )}
              <Icon size={25} weight={page === id ? "duotone" : "regular"} />
              <span>{label}</span>
              {page === id && <motion.i layoutId="nav-dot" />}
            </button>
          ))}
        </nav>
        {loading && <Skeleton />}
      </main>
      <AnimatePresence>
        {toast && (
          <motion.div
            className="toast glass"
            style={{ x: "-50%" }}
            role="status"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <span>{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => {
                  toast.action?.();
                  setToast(null);
                }}
              >
                元に戻す
              </button>
            )}
            <button
              className="icon-button"
              aria-label="通知を閉じる"
              onClick={() => setToast(null)}
            >
              <X size={18} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {editing && (
        <Sheet title="メモを編集" onClose={closeEdit}>
          <textarea
            className="edit-text"
            aria-label="メモの内容"
            maxLength={10000}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
          <fieldset className="status-picker">
            <legend>ステータス</legend>
            {statuses.map((status) => (
              <label
                key={status}
                className={editStatus === status ? "selected" : ""}
              >
                <input
                  type="radio"
                  name="edit-status"
                  checked={editStatus === status}
                  value={status}
                  onChange={() => setEditStatus(status)}
                />
                {editStatus === status && <Check size={15} />}
                <span>{labels[status]}</span>
              </label>
            ))}
          </fieldset>
          <div className="edit-actions">
            <button
              className="button"
              onClick={() => void askAI()}
              disabled={!editText.trim() || busy}
            >
              <Sparkle size={20} />
              AIでタスクに分ける
            </button>
            <button
              className="button primary"
              disabled={!editText.trim() || busy}
              onClick={() => void saveEdit()}
            >
              保存
            </button>
          </div>
          {confirmDelete ? (
            <div
              className="delete-confirm"
              role="group"
              aria-label="削除の確認"
            >
              <p>このメモを削除する？</p>
              <button
                className="button"
                onClick={() => setConfirmDelete(false)}
              >
                キャンセル
              </button>
              <button className="button danger" onClick={() => void remove()}>
                削除する
              </button>
            </div>
          ) : (
            <button
              className="text-button danger"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash size={18} />
              削除
            </button>
          )}
        </Sheet>
      )}
      {account && (
        <Sheet title="アカウント" onClose={() => setAccount(false)}>
          {accountContent}
        </Sheet>
      )}
      {ai && (
        <Sheet title="AIのタスク候補" onClose={() => setAi(null)}>
          {ai.loading ? (
            <div className="ai-loading" role="status">
              <Sparkle size={30} />
              <p>タスクに分けています…</p>
              {[0, 1, 2].map((i) => (
                <div className="skeleton-bar" key={i} />
              ))}
            </div>
          ) : ai.error ? (
            <p className="inline-error" role="alert">
              {ai.error}
            </p>
          ) : (
            <>
              <div className="ai-candidates">
                {ai.items.map((text, i) => (
                  <label key={i}>
                    <input
                      type="checkbox"
                      checked={ai.selected.has(i)}
                      onChange={() =>
                        setAi({
                          ...ai,
                          selected: new Set(
                            ai.selected.has(i)
                              ? [...ai.selected].filter((n) => n !== i)
                              : [...ai.selected, i],
                          ),
                        })
                      }
                    />
                    <span>{text}</span>
                  </label>
                ))}
              </div>
              <p className="helper">
                選択した候補を追加します。元のメモは残ります。
              </p>
              <button
                className="button primary"
                disabled={!ai.selected.size || busy}
                onClick={() => void adopt()}
              >
                {ai.selected.size}件追加
              </button>
            </>
          )}
        </Sheet>
      )}
      {!navigator.onLine && (
        <span className="offline-indicator" aria-label="オフライン">
          <WifiSlash size={17} />
        </span>
      )}
    </>
  );
}
export default App;
