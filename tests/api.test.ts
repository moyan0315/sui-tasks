import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
import app, { type Env } from "../worker/index";
import { newTask, type Task } from "../shared/model";
let mf: Miniflare, db: D1Database;
let aiOutput: unknown = {
  response: '{"tasks":[{"text":"参考を集める"},{"text":"下書きを作る"}]}',
};
const origin = "https://sui.test";
const hash = async (v: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
const env = () =>
  ({ DB: db, AI: { run: async () => aiOutput } }) as unknown as Env;
const request = (
  path: string,
  body?: unknown,
  token = "test-session-a",
  source = origin,
) =>
  app.request(
    `${origin}${path}`,
    {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Cookie: `sui_session=${token}`,
        Origin: source,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    env(),
  );
const sync = async (tasks: Task[] = [], token?: string) => {
  const r = await request("/api/sync", { tasks }, token);
  expect(r.status).toBe(200);
  return ((await r.json()) as { tasks: Task[] }).tasks;
};
beforeAll(async () => {
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default {fetch(){return new Response("test");}}',
      d1Databases: ["DB"],
      compatibilityDate: "2026-10-17",
    }),
  );
  db = (await mf.getD1Database("DB")) as unknown as D1Database;
  await db.exec(
    await readFile(
      new URL("../migrations/0001_init.sql", import.meta.url),
      "utf8",
    ),
  );
  await db
    .prepare("INSERT INTO users VALUES(?,?,?)")
    .bind("a", "a@example.test", "A")
    .run();
  await db
    .prepare("INSERT INTO users VALUES(?,?,?)")
    .bind("b", "b@example.test", "B")
    .run();
  for (const id of ["a", "b"])
    await db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .bind(await hash(`test-session-${id}`), id, Date.now() + 3600000)
      .run();
}, 30000);
afterAll(() => mf?.dispose());
describe("API・D1の実行テスト", () => {
  it("偽造セッションと期限切れセッションを拒否", async () => {
    expect((await request("/api/me", undefined, "forged")).status).toBe(401);
    await db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .bind(await hash("expired"), "a", 0)
      .run();
    expect((await request("/api/me", undefined, "expired")).status).toBe(401);
  });
  it("別Originからの変更を拒否", async () => {
    expect(
      (
        await request(
          "/api/sync",
          { tasks: [] },
          undefined,
          "https://attacker.test",
        )
      ).status,
    ).toBe(403);
  });
  it("空入力・不正ステータス・51件以上を拒否", async () => {
    const t = newTask("x");
    for (const tasks of [
      [{ ...t, text: " " }],
      [{ ...t, status: "invalid" }],
      Array.from({ length: 51 }, () => newTask("x")),
    ])
      expect((await request("/api/sync", { tasks })).status).toBe(400);
  });
  it("D1へ保存して他ユーザーからは見えない", async () => {
    const t = newTask("個人のメモ");
    await sync([t]);
    const own = await sync();
    expect(own.find((r) => r.id === t.id)?.text).toBe("個人のメモ");
    expect((await sync([], "test-session-b")).some((r) => r.id === t.id)).toBe(
      false,
    );
  });
  it("同じidを他ユーザーが使っても所有者のデータを変更できない", async () => {
    const t = newTask("Aのメモ");
    await sync([t]);
    await sync([{ ...t, text: "Bのメモ" }], "test-session-b");
    expect((await sync()).find((r) => r.id === t.id)?.text).toBe("Aのメモ");
  });
  it("再送を重複更新せず、古いversionで他端末の編集を上書きしない", async () => {
    const t = newTask("初期");
    const created = (await sync([t])).find((r) => r.id === t.id)!;
    expect(created.version).toBe(1);
    const retried = (await sync([t])).find((r) => r.id === t.id)!;
    expect(retried.version).toBe(1);
    const update = {
      ...created,
      text: "端末Aの更新",
      mutationId: crypto.randomUUID(),
    };
    const saved = (await sync([update])).find((r) => r.id === t.id)!;
    expect(saved.version).toBe(2);
    const stale = {
      ...created,
      text: "端末Bの更新",
      mutationId: crypto.randomUUID(),
    };
    const result = (await sync([stale])).find((r) => r.id === t.id)!;
    expect(result.text).toBe("端末Aの更新");
    expect(result.version).toBe(2);
  });
  it("削除の墓標を保存して古い端末から復活させない", async () => {
    const t = newTask("削除テスト");
    const created = (await sync([t])).find((r) => r.id === t.id)!;
    await sync([
      { ...created, deleted: true, mutationId: crypto.randomUUID() },
    ]);
    const result = (
      await sync([
        { ...created, text: "古い端末の更新", mutationId: crypto.randomUUID() },
      ])
    ).find((r) => r.id === t.id)!;
    expect(result.deleted).toBe(true);
  });
  it("SQLを含むメモを文字列として保存", async () => {
    const text = "');DROP TABLE users;--";
    const t = newTask(text);
    expect((await sync([t])).find((r) => r.id === t.id)?.text).toBe(text);
    expect((await request("/api/me")).status).toBe(200);
  });
  it("Google OAuth未設定ではログイン成功を装わない", async () => {
    const r = await request("/api/auth/login");
    expect(r.status).toBe(302);
    expect(r.headers.get("Location")).toBe("/?auth=unconfigured");
    const status = await request("/api/status");
    expect(((await status.json()) as { google: boolean }).google).toBe(false);
  });
  it("不正stateのOAuth callbackを拒否", async () => {
    const r = await request("/api/auth/callback?state=forged&code=forged");
    expect(r.headers.get("Location")).toBe("/?auth=failed");
  });
  it("AIの構造化候補を検証する（推論のみスタブ）", async () => {
    const r = await request("/api/ai", { text: "参考を集めて下書きを作る" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({
      tasks: [{ text: "参考を集める" }, { text: "下書きを作る" }],
    });
  });
  it("AIが不正JSONを返してもメモを破壊しない", async () => {
    aiOutput = { response: "壊れたJSON" };
    expect((await request("/api/ai", { text: "元のメモ" })).status).toBe(502);
    aiOutput = { response: '{"tasks":[{"text":"作業"}]}' };
  });
  it("Workers AIがJSONをオブジェクトとして返す場合も候補を取り出す", async () => {
    aiOutput = {
      response: { tasks: [{ text: "参考を集める" }, { text: "下書きを作る" }] },
    };
    const response = await request("/api/ai", {
      text: "参考を集めて下書きを作る",
    });
    expect(response.status).toBe(200);
    expect(
      ((await response.json()) as { tasks: unknown[] }).tasks,
    ).toHaveLength(2);
    aiOutput = { response: '{"tasks":[{"text":"作業"}]}' };
  });
  it("AI利用回数をD1で制限", async () => {
    await db
      .prepare(
        "INSERT INTO ai_usage VALUES(?,?,29) ON CONFLICT(user_id,day) DO UPDATE SET count=29",
      )
      .bind("a", new Date().toISOString().slice(0, 10))
      .run();
    expect((await request("/api/ai", { text: "メモ" })).status).toBe(200);
    expect((await request("/api/ai", { text: "メモ" })).status).toBe(429);
  });
  it("ログアウト後のセッションを無効化", async () => {
    expect(
      (await request("/api/auth/logout", {}, "test-session-b")).status,
    ).toBe(200);
    expect((await request("/api/me", undefined, "test-session-b")).status).toBe(
      401,
    );
  });
});
