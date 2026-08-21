// ─────────────────────────────────────────────────────────
// これは「業務アプリの画面」です。宣伝ページ（LP）ではありません。
//
// 大学受験のスケジュール管理ツール。
// 1件 = 1つの予定（出願締切 / 試験日 / 合格発表 / 入学手続き）。
// 管理したい日付が4種類あるので、1件に4つ持たせるのではなく
// 「1件 = 1つの予定」にして、すべてを1本の期限順リストに並べている。
//
// 画面の骨格（この形は崩さない）:
//   左メニュー（.side）＋ 上部バー（.topbar）＋ 本体（.content）
//   一覧 / 新規登録 / 設定 の3画面を view で切り替える
// ─────────────────────────────────────────────────────────
"use client";

import { useEffect, useMemo, useState } from "react";

// ═══════════════════════════════════════════════════════════
//  画面の型 ── docs/03_spec.md「0. 画面の型」のとおり
//  ⚠ 新しいCSSは書かない。用意された選択肢から選ぶこと。
// ═══════════════════════════════════════════════════════════

/** 色み。業種の空気に合わせる
 *  "pine"   教育・サービス・その他（初期値）
 *  "indigo" 士業・不動産・BtoB
 *  "clay"   建設・工務店・現場仕事
 *  "sea"    医療・介護・公共
 *  "wine"   飲食・小売・美容
 */
const TONE = "pine";

/** 密度。1日に見る件数で決める
 *  "compact" 1日20件以上（多くの行を1画面に）
 *  "normal"  ふつう
 *  "roomy"   1日5件以下で、1件が重い（ゆったり）
 */
const DENSITY = "roomy";

/** 画面の型。3行目「何が一覧で見られると助かるか」で決める
 *  "queue" 待たせているものを、古い順に片づける
 *  "stage" いくつかの段階を順に進んでいく
 *  "due"   期限がある（締切・試験日・発表日・手続き期限）
 */
const LAYOUT: "queue" | "stage" | "due" = "due";

/** 数え方。1件 = 1つの予定なので「予定」で数える
 *  （「校」にすると、5校しか受けないのに「全14校」と出て誤解を招く） */
const UNIT = "予定";

/** 区分の選択肢。麻美さんが家族と共有したい4つの日付、そのまま */
const CATEGORIES = ["出願締切", "試験日", "合格発表", "入学手続き"];

// ═══════════════════════════════════════════════════════════

/** 1件のデータ = 1つの予定 */
type Record = {
  id: string;
  school: string; // 学校・学部・試験区分（例: 北山大学 経済 一般前期）
  kind: string;   // 区分（出願締切 / 試験日 / 合格発表 / 入学手続き）
  memo: string;   // メモ（受験科目・検定料・持ち物など）
  due: string;    // 期限日 YYYY-MM-DD
  done: boolean;  // 済んだか
};

type View = "list" | "new" | "settings";
type Filter = "open" | "done" | "all";

const KEY = "exam-schedule-data";
const NAME_KEY = "exam-schedule-appname";

/** 画面の型ごとの言葉。ここを直せば画面じゅうの文言が揃って変わる */
const TEXT = {
  queue: {
    sub: "未対応のものが、待たせている順に並びます",
    open: "未対応", done: "対応済",
    toTo: "対応済みにする", toBack: "未対応に戻す",
    dateLabel: "受けた日", catLabel: "区分",
    stat2: "3日以上 放置",
    headOpen: "未対応（待たせている順）",
  },
  stage: {
    sub: "どの段階で止まっているかが分かります",
    open: "進行中", done: "完了",
    toTo: "完了にする", toBack: "進行中に戻す",
    dateLabel: "受け入れた日", catLabel: "いまの段階",
    stat2: "7日以上 動きなし",
    headOpen: "進行中",
  },
  due: {
    sub: "出願・試験・発表・手続きの予定が、期限の近い順に並びます",
    open: "これから", done: "済み",
    toTo: "済みにする", toBack: "これからに戻す",
    dateLabel: "期限日", catLabel: "区分",
    stat2: "期限が過ぎている",
    headOpen: "これから（期限が近い順）",
  },
}[LAYOUT];

/** n日前の日付。マイナスを渡すとn日後 */
const ago = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
const today = () => ago(0);

/** 今日との差。0=今日、-3=3日過ぎている、+2=あと2日 */
const diff = (d: string) =>
  Math.round(
    (new Date(d + "T00:00:00").getTime() - new Date(today() + "T00:00:00").getTime()) / 86400000
  );

/** 何日過ぎているか */
const waiting = (d: string) => Math.max(0, -diff(d));

/**
 * 見本データ。学校名はすべて架空。
 * 実在の大学名に架空の日程を付けると、事実でない入試情報を表示することになるため。
 */
const SAMPLE: Record[] = [
  // これから（9件）
  { id: "s01", school: "東雲学院大学 国際 総合型",   kind: "合格発表",   memo: "Web発表 10:00〜　結果を家族に共有する",       due: ago(3),   done: false },
  { id: "s02", school: "桜川女子大学 文 学校推薦",   kind: "試験日",     memo: "面接20分＋小論文60分　自己PRカードは提出済み", due: ago(1),   done: false },
  { id: "s03", school: "北山大学 経済 一般前期",     kind: "出願締切",   memo: "Web出願は23:59まで　検定料35,000円",          due: ago(0),   done: false },
  { id: "s04", school: "南野大学 文 共テ利用",       kind: "出願締切",   memo: "共通テストの成績のみで判定　検定料18,000円",   due: ago(-1),  done: false },
  { id: "s05", school: "青嶺工科大学 情報 一般前期", kind: "出願締切",   memo: "英・数ⅠAⅡB・物理　検定料35,000円",           due: ago(-3),  done: false },
  { id: "s06", school: "桜川女子大学 文 学校推薦",   kind: "合格発表",   memo: "Web発表 14:00〜　受験番号は控えてある",       due: ago(-5),  done: false },
  { id: "s07", school: "北山大学 法 一般前期",       kind: "出願締切",   memo: "経済と同時出願なら2学部目は20,000円",         due: ago(-6),  done: false },
  { id: "s08", school: "東雲学院大学 国際 総合型",   kind: "入学手続き", memo: "第一次手続金 250,000円　振込期限に注意",      due: ago(-9),  done: false },
  { id: "s09", school: "北山大学 経済 一般前期",     kind: "試験日",     memo: "9:30集合　英・国・数ⅠA　昼食持参",           due: ago(-12), done: false },
  // 済み（5件）
  { id: "s10", school: "南野大学 国際 学校推薦",     kind: "合格発表",   memo: "補欠。繰り上げの連絡は2月末まで待つ",         due: ago(7),   done: true },
  { id: "s11", school: "東雲学院大学 国際 総合型",   kind: "試験日",     memo: "面接30分　手ごたえはあったとのこと",          due: ago(10),  done: true },
  { id: "s12", school: "桜川女子大学 文 学校推薦",   kind: "出願締切",   memo: "推薦書を高校に依頼　書類一式を郵送済み",      due: ago(15),  done: true },
  { id: "s13", school: "青嶺工科大学 情報 総合型",   kind: "合格発表",   memo: "結果を確認済み　一般前期に切り替える",        due: ago(19),  done: true },
  { id: "s14", school: "東雲学院大学 国際 総合型",   kind: "出願締切",   memo: "志望理由書は担任に見てもらってから提出",      due: ago(21),  done: true },
];

/** 一覧をどう束ねるか。LAYOUT ごとに変わる */
type Group = { key: string; label: string; mark?: "late" | "now"; items: Record[] };

function grouped(list: Record[], filter: Filter): Group[] {
  const head = filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて";

  if (LAYOUT === "stage" && filter === "open") {
    return CATEGORIES.map((c) => ({
      key: c,
      label: c,
      mark: undefined,
      items: list.filter((i) => i.kind === c),
    })).filter((g) => g.items.length > 0);
  }

  if (LAYOUT === "due" && filter === "open") {
    const buckets: Group[] = [
      { key: "late",  label: "期限が過ぎている", mark: "late", items: [] },
      { key: "now",   label: "今日・明日",       mark: "now",  items: [] },
      { key: "week",  label: "今週のうち",                     items: [] },
      { key: "later", label: "それ以降",                       items: [] },
    ];
    list.forEach((i) => {
      const d = diff(i.due);
      if (d < 0) buckets[0].items.push(i);
      else if (d <= 1) buckets[1].items.push(i);
      else if (d <= 7) buckets[2].items.push(i);
      else buckets[3].items.push(i);
    });
    return buckets.filter((b) => b.items.length > 0);
  }

  return [{ key: "all", label: head, items: list }];
}

/** 行の右に出す小さなバッジ */
function rowBadge(r: Record): { text: string; kind: "warn" | "danger" } | null {
  if (r.done) return null;
  if (LAYOUT === "due") {
    const d = diff(r.due);
    if (d < 0) return { text: `${-d}日 超過`, kind: "danger" };
    if (d === 0) return { text: "今日", kind: "warn" };
    if (d === 1) return { text: "明日", kind: "warn" };
    return null;
  }
  const w = waiting(r.due);
  const limit = LAYOUT === "stage" ? 7 : 3;
  return w >= limit ? { text: `${w}日`, kind: "warn" } : null;
}

export default function Home() {
  const [items, setItems] = useState<Record[]>([]);
  const [appName, setAppName] = useState("受験スケジュール");
  const [loaded, setLoaded] = useState(false);

  const [view, setView] = useState<View>("list");
  const [filter, setFilter] = useState<Filter>("open");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Record | null>(null);

  const [form, setForm] = useState({ school: "", kind: CATEGORIES[0], memo: "", due: today() });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      setItems(raw ? (JSON.parse(raw) as Record[]) : SAMPLE);
      const n = localStorage.getItem(NAME_KEY);
      if (n) setAppName(n);
    } catch {
      setItems(SAMPLE);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(KEY, JSON.stringify(items));
    localStorage.setItem(NAME_KEY, appName);
  }, [items, appName, loaded]);

  // 見本データのまま触っていない状態か（1件でも足す・消すと false になる）
  const isSample = items.length === SAMPLE.length && items.every((i) => i.id.startsWith("s"));

  const counts = useMemo(
    () => ({
      open: items.filter((i) => !i.done).length,
      done: items.filter((i) => i.done).length,
      all: items.length,
    }),
    [items]
  );

  /** 2つ目の統計 = 期限が過ぎている数 */
  const attention = useMemo(() => {
    const open = items.filter((i) => !i.done);
    if (LAYOUT === "due") return open.filter((i) => diff(i.due) < 0).length;
    const limit = LAYOUT === "stage" ? 7 : 3;
    return open.filter((i) => waiting(i.due) >= limit).length;
  }, [items]);

  const shown = useMemo(() => {
    const k = q.trim().toLowerCase();
    return items
      .filter((i) => (filter === "all" ? true : filter === "open" ? !i.done : i.done))
      .filter((i) => !k || (i.school + i.memo + i.kind).toLowerCase().includes(k))
      .sort((a, b) => a.due.localeCompare(b.due));
  }, [items, filter, q]);

  const groups = useMemo(() => grouped(shown, filter), [shown, filter]);

  function resetForm() {
    setForm({ school: "", kind: CATEGORIES[0], memo: "", due: today() });
    setEditing(null);
  }

  function save() {
    const school = form.school.trim();
    if (!school) return;
    if (editing) {
      setItems(items.map((i) => (i.id === editing.id ? { ...i, ...form, school } : i)));
    } else {
      setItems([...items, { id: String(Date.now()), ...form, school, done: false }]);
    }
    resetForm();
    setView("list");
  }

  function startEdit(r: Record) {
    setEditing(r);
    setForm({ school: r.school, kind: r.kind, memo: r.memo, due: r.due });
    setView("new");
  }

  const toggle = (id: string) => setItems(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id: string) => setItems(items.filter((i) => i.id !== id));

  const NAV: { k: View; label: string; count?: number }[] = [
    { k: "list", label: "一覧", count: counts.open },
    { k: "new", label: "新規登録" },
    { k: "settings", label: "設定" },
  ];

  const titles: { [K in View]: [string, string] } = {
    list: ["一覧", TEXT.sub],
    new: [editing ? "編集" : "新規登録", "入力して保存すると、一覧に追加されます"],
    settings: ["設定", "表示名の変更と、データの初期化"],
  };

  return (
    <div className="shell" data-tone={TONE} data-density={DENSITY}>
      {/* ───────── 左メニュー ───────── */}
      <nav className="side">
        <div className="side-brand">
          <div className="n">{appName}</div>
          <div className="s">この端末に保存</div>
        </div>
        <div className="side-label">メニュー</div>
        <div className="side-nav">
          {NAV.map((n) => (
            <button
              key={n.k}
              className="side-item"
              aria-current={view === n.k ? "page" : undefined}
              onClick={() => { if (n.k !== "new") resetForm(); setView(n.k); }}
            >
              {n.label}
              {typeof n.count === "number" && <span className="c">{n.count}</span>}
            </button>
          ))}
        </div>
        <div className="side-foot">入試要項で確認した日付を、その都度ここに入れていきます</div>
      </nav>

      {/* ───────── 本体 ───────── */}
      <div className="main">
        <header className="topbar">
          <span className="t">{titles[view][0]}</span>
          <span className="d">{titles[view][1]}</span>
          {view === "list" && (
            <span className="right">
              <button className="btn" onClick={() => { resetForm(); setView("new"); }}>新規登録</button>
            </span>
          )}
        </header>

        <div className="content">
          {/* ── 一覧 ── */}
          {view === "list" && (
            <>
              {isSample && (
                <div className="notice">
                  表示中のデータは<b>見本</b>です。そのまま触って試せます。
                  消したいときは、左メニューの<b>設定</b>から。
                </div>
              )}

              <div className="stats">
                <div className="stat"><div className="n accent">{counts.open}</div><div className="l">{TEXT.open}</div></div>
                <div className="stat"><div className="n">{attention}</div><div className="l">{TEXT.stat2}</div></div>
                <div className="stat"><div className="n">{counts.all}</div><div className="l">全{UNIT}</div></div>
              </div>

              <div className="filters">
                <div className="search">
                  <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
                    placeholder="学校名・区分・メモで検索" />
                </div>
                <div className="seg">
                  {(["open", "done", "all"] as Filter[]).map((f) => (
                    <button key={f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                      {f === "open" ? `${TEXT.open} ${counts.open}`
                        : f === "done" ? `${TEXT.done} ${counts.done}`
                        : `全部 ${counts.all}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="list">
                {shown.length === 0 ? (
                  <>
                    <div className="list-head">
                      {filter === "open" ? TEXT.headOpen : filter === "done" ? TEXT.done : "すべて"}
                      <span className="count">0 {UNIT}</span>
                    </div>
                    <div className="empty">
                      <div className="t">{q ? "見つかりませんでした" : "ここに表示するものがありません"}</div>
                      <div className="d">
                        {q ? "学校名の一部だけで探してみてください。"
                           : "右上の「新規登録」から、出願締切や試験日を追加できます。"}
                      </div>
                    </div>
                  </>
                ) : (
                  groups.map((g) => (
                    <div key={g.key}>
                      <div className={"group-head" + (g.mark ? ` is-${g.mark}` : "")}>
                        {g.mark && <span className="dot" />}
                        {g.label}
                        <span className="count">{g.items.length} {UNIT}</span>
                      </div>
                      {g.items.map((r) => {
                        const b = rowBadge(r);
                        return (
                          <div className="row" key={r.id}>
                            <div className="row-main">
                              <div className="row-title">{r.school}</div>
                              {r.memo && <div className="row-sub">{r.memo}</div>}
                            </div>
                            <div className="row-meta">
                              {b && <span className={`badge badge-${b.kind}`}>{b.text}</span>}
                              <span className="badge">{r.kind}</span>
                              <span className="row-time">{r.due.slice(5).replace("-", "/")}</span>
                              <button className="btn-ghost" onClick={() => startEdit(r)}>編集</button>
                              <button className="btn-ghost" onClick={() => toggle(r.id)}>
                                {r.done ? TEXT.toBack : TEXT.toTo}
                              </button>
                              <button className="btn-ghost danger-btn" onClick={() => remove(r.id)}>削除</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
              <p className="note">データはこの端末のブラウザにだけ保存されます。外部には送信されません。</p>
            </>
          )}

          {/* ── 新規登録・編集 ── */}
          {view === "new" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-school">学校・学部・試験区分<span className="req">必須</span></label>
                <input id="f-school" className="field" value={form.school}
                  onChange={(e) => setForm({ ...form, school: e.target.value })}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  placeholder="例：北山大学 経済 一般前期" />
                <span className="hint">あとで見て、どの学校のどの入試か分かる書き方にします</span>
              </div>

              <div className="form-row">
                <div className="inline">
                  <div>
                    <label className="label" htmlFor="f-cat">{TEXT.catLabel}</label>
                    <select id="f-cat" className="select" value={form.kind}
                      onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                      {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="f-due">{TEXT.dateLabel}</label>
                    <input id="f-due" className="field" type="date" value={form.due}
                      onChange={(e) => setForm({ ...form, due: e.target.value })} />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <label className="label" htmlFor="f-memo">メモ</label>
                <textarea id="f-memo" className="field" value={form.memo}
                  onChange={(e) => setForm({ ...form, memo: e.target.value })}
                  placeholder="受験科目・検定料・持ち物・集合時間など" />
              </div>

              <div className="form-actions">
                <button className="btn" onClick={save} disabled={!form.school.trim()}>
                  {editing ? "保存する" : "一覧に追加"}
                </button>
                <button className="btn-ghost" onClick={() => { resetForm(); setView("list"); }}>やめる</button>
                <span className="spacer" />
                {editing && (
                  <button className="btn-ghost danger-btn"
                    onClick={() => { remove(editing.id); resetForm(); setView("list"); }}>
                    この予定を削除
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── 設定 ── */}
          {view === "settings" && (
            <div className="panel">
              <div className="form-row">
                <label className="label" htmlFor="f-app">画面の表示名</label>
                <input id="f-app" className="field" value={appName}
                  onChange={(e) => setAppName(e.target.value)} />
                <span className="hint">左上に表示されます。変えるとすぐ反映されます</span>
              </div>

              <div className="form-row">
                <label className="label">データ</label>
                <div className="inline">
                  <button className="btn-ghost" onClick={() => setItems(SAMPLE)}>見本データを入れ直す</button>
                  <button className="btn-ghost danger-btn"
                    onClick={() => { if (confirm("全部消します。よろしいですか？")) setItems([]); }}>
                    全部消す
                  </button>
                </div>
                <span className="hint">
                  現在 {counts.all} {UNIT}（{TEXT.open} {counts.open} / {TEXT.done} {counts.done}）
                </span>
              </div>

              <p className="note">
                データはこの端末のブラウザにだけ保存されます。
                別の端末や他の人とは共有されません（共有は第3回で扱います）。
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
