import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  DeviceMobile,
  CloudCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import type { SyncState } from "../useTasks";
export function Composer({
  scope,
  onAdd,
  notify,
  syncState,
}: {
  scope: string;
  onAdd: (text: string) => Promise<boolean>;
  notify: (text: string) => void;
  syncState: SyncState;
}) {
  const readDraft = () => {
    try {
      return localStorage.getItem(`sui-draft:${scope}`) || "";
    } catch {
      return "";
    }
  };
  const [text, setText] = useState(readDraft),
    [saving, setSaving] = useState(false),
    [draftError, setDraftError] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null),
    textRef = useRef(text),
    scopeRef = useRef(scope),
    composing = useRef(false);
  useEffect(() => {
    if (scopeRef.current !== scope) {
      scopeRef.current = scope;
      setText(readDraft());
    }
  }, [scope]);
  const change = (value: string) => {
    textRef.current = value;
    setText(value);
    try {
      localStorage.setItem(`sui-draft:${scope}`, value);
      setDraftError(false);
    } catch {
      setDraftError(true);
    }
  };
  const submit = async () => {
    if (saving || !text.trim()) return;
    setSaving(true);
    const submitted = text;
    const saved = await onAdd(submitted);
    if (saved) {
      if (textRef.current === submitted) change("");
      ref.current?.focus();
    }
    setSaving(false);
  };
  const label = draftError
    ? "下書きを保存できません"
    : text.trim()
      ? "下書きを端末に保存"
      : syncState === "synced"
        ? "同期済み"
        : syncState === "syncing"
          ? "同期中"
          : syncState === "offline"
            ? "端末に保存・オフライン"
            : syncState === "error"
              ? "保存状態を確認してください"
              : "端末に保存";
  return (
    <form
      className="composer glass"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        ref={ref}
        aria-label="メモを書く"
        placeholder="メモを書く…"
        value={text}
        maxLength={10000}
        autoFocus
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={() => (composing.current = false)}
        onChange={(e) => change(e.target.value)}
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            (e.metaKey || e.ctrlKey) &&
            !e.nativeEvent.isComposing &&
            !composing.current
          ) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <div className="composer-footer">
        <span className={`save-state ${draftError ? "error" : ""}`}>
          {draftError ? (
            <WarningCircle size={16} />
          ) : syncState === "synced" ? (
            <CloudCheck size={16} />
          ) : (
            <DeviceMobile size={16} />
          )}
          <span>{label}</span>
        </span>
        <button
          type="submit"
          className="submit-button"
          aria-label="メモを追加"
          disabled={!text.trim() || saving}
        >
          {saving ? (
            <span className="spinner" />
          ) : (
            <ArrowUp size={25} weight="bold" />
          )}
        </button>
      </div>
      {text.length >= 9800 && (
        <small className="counter">{text.length}/10,000</small>
      )}
    </form>
  );
}
