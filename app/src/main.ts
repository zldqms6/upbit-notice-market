import "./style.css";
import {
  CONTRACT,
  EXPLORER,
  createBurner,
  exportPk,
  forgetBurner,
  fundAccount,
  getAccount,
  getBalance,
  getMarket,
  getMarketCount,
  getPreview,
  getStake,
  sendTx,
  type Candidate,
  type EventKey,
  type Market,
  type PreviewResult,
  type TxOutcome,
} from "./chain";
import { EXAMPLES } from "./examples";
import { CLASS_LABEL, EVENTS, esc, fromKstInput, gen, kst, nowSec, parseGen, relTime, short, toKstInput } from "./format";

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

const MAX_WINDOW = 60 * 86400;
const VOID_AFTER = 21 * 86400;
const PAGE = 12;

const app = $("#app");
const view = () => $("#view");

/* =====================================================================
   Shell
   ===================================================================== */

app.innerHTML = `
  <header class="top">
    <div class="top-inner">
      <a class="brand" href="#/markets">
        <span class="logo" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M9 21V11l7 6 7-6v10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
        <span class="brand-text"><b>업비트 공지 마켓</b><small>Upbit Notice Market</small></span>
      </a>
      <nav class="tabs" aria-label="화면">
        <a href="#/markets" data-tab="markets">마켓<small>Markets</small></a>
        <a href="#/create" data-tab="create">마켓 만들기<small>Create</small></a>
        <a href="#/preview" data-tab="preview">과거 구간 검증<small>Backtest</small></a>
      </nav>
      <div class="top-right">
        <span class="net" title="GenLayer Studionet. 테스트넷이며 실제 자산이 아닙니다."><i></i>Studionet</span>
        <button class="wallet-btn" id="wallet-btn" type="button"></button>
      </div>
    </div>
  </header>
  <main id="view" class="wrap"></main>
  <footer class="foot wrap">
    <div>
      <b>판정 방식</b> 마감 후 GenLayer 검증자 각자가 업비트 거래 공지를 직접 읽고 분류합니다. 후보 공지, 공지별 분류, 결과가 모두 일치해야 확정됩니다.
    </div>
    <div class="foot-meta">
      컨트랙트 <a href="${EXPLORER}/address/${CONTRACT}" target="_blank" rel="noopener"><code>${short(CONTRACT, 8)}</code></a>
      · GenLayer Studionet · 테스트넷 전용, 실제 자산 없음
    </div>
  </footer>
  <aside class="dock" id="dock" hidden></aside>
  <dialog class="sheet" id="wallet-sheet"></dialog>
`;

/* =====================================================================
   Wallet
   ===================================================================== */

let balance: bigint | null = null;

async function refreshBalance() {
  const acc = getAccount();
  if (!acc) {
    balance = null;
  } else {
    try {
      balance = await getBalance(acc.address);
    } catch {
      /* keep last */
    }
  }
  paintWalletBtn();
  if (($("#wallet-sheet") as HTMLDialogElement).open) paintWalletSheet();
}

function paintWalletBtn() {
  const acc = getAccount();
  const b = $("#wallet-btn");
  b.innerHTML = acc
    ? `<span class="dot"></span><span class="mono">${short(acc.address, 5)}</span><span class="bal">${balance === null ? "…" : gen(balance)} GEN</span>`
    : `지갑 만들기`;
  b.classList.toggle("empty", !acc);
}

function paintWalletSheet(msg = "") {
  const sheet = $("#wallet-sheet") as HTMLDialogElement;
  const acc = getAccount();
  sheet.innerHTML = `
    <form method="dialog" class="sheet-head">
      <div><h2>테스트넷 지갑</h2><p class="sub">Testnet burner wallet</p></div>
      <button class="icon-btn" aria-label="닫기">✕</button>
    </form>
    <div class="callout warn">
      브라우저에서 만든 <b>테스트넷 전용 임시 지갑</b>입니다. 개인키는 이 브라우저의 localStorage에만 저장됩니다.
      실제 자산을 넣지 마세요. Studionet GEN은 가치가 없는 테스트 토큰입니다.
    </div>
    ${
      acc
        ? `
      <dl class="kv">
        <dt>주소</dt><dd><code class="mono break">${acc.address}</code> <button class="link-btn" data-copy="${acc.address}" type="button">복사</button></dd>
        <dt>잔액</dt><dd><b class="big">${balance === null ? "…" : gen(balance, 4)}</b> GEN</dd>
      </dl>
      <div class="row gap">
        <button class="btn primary" id="fund-btn" type="button">테스트 GEN 100개 받기</button>
        <button class="btn ghost" id="bal-btn" type="button">잔액 새로고침</button>
      </div>
      <div id="fund-msg" class="fund-msg">${msg}</div>
      <details class="more">
        <summary>고급: 개인키 내보내기 / 지갑 초기화</summary>
        <p class="muted">다른 브라우저로 옮기거나 CLI에서 쓸 때만 필요합니다.</p>
        <div class="row gap">
          <button class="btn ghost sm" id="pk-btn" type="button">개인키 보기</button>
          <button class="btn danger sm" id="reset-btn" type="button">지갑 삭제</button>
        </div>
        <code class="mono break pk" id="pk-out" hidden></code>
      </details>`
        : `
      <p>베팅, 마켓 생성, 판정 실행에는 서명할 지갑이 필요합니다. 버튼 한 번으로 테스트넷 지갑을 만들고 테스트 GEN을 받을 수 있습니다.</p>
      <button class="btn primary wide" id="new-btn" type="button">테스트넷 지갑 만들기</button>`
    }
  `;
  $("#new-btn", sheet)?.addEventListener("click", async () => {
    createBurner();
    await refreshBalance();
    paintWalletSheet();
    rerender();
  });
  $("#fund-btn", sheet)?.addEventListener("click", onFund);
  $("#bal-btn", sheet)?.addEventListener("click", () => refreshBalance());
  $("#pk-btn", sheet)?.addEventListener("click", () => {
    const out = $("#pk-out", sheet);
    out.hidden = !out.hidden;
    out.textContent = exportPk() ?? "";
  });
  $("#reset-btn", sheet)?.addEventListener("click", async () => {
    if (!confirm("이 브라우저의 테스트넷 지갑을 삭제할까요? 개인키를 내보내지 않았다면 남은 테스트 GEN과 베팅 기록에 다시 접근할 수 없습니다.")) return;
    forgetBurner();
    await refreshBalance();
    paintWalletSheet();
    rerender();
  });
}

async function onFund() {
  const acc = getAccount();
  if (!acc) return;
  const btn = $("#fund-btn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "받는 중…";
  try {
    const before = balance ?? 0n;
    await fundAccount(acc.address, 100n);
    for (let i = 0; i < 10; i++) {
      await refreshBalance();
      if ((balance ?? 0n) > before) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    paintWalletSheet(`<span class="ok">100 GEN을 받았습니다.</span>`);
  } catch (e: any) {
    paintWalletSheet(`
      <div class="callout err">
        브라우저에서 파우셋 호출이 실패했습니다 (${esc(e?.message ?? e)}). 터미널에서 아래 명령으로 받을 수 있습니다.
        <pre class="cmd">curl -X POST https://studio.genlayer.com/api -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"sim_fundAccount","params":["${acc.address}",100000000000000000000]}'</pre>
      </div>`);
  }
}

function openWallet() {
  paintWalletSheet();
  ($("#wallet-sheet") as HTMLDialogElement).showModal();
}

$("#wallet-btn").addEventListener("click", openWallet);
$("#wallet-sheet").addEventListener("click", (e) => {
  const t = e.target as HTMLElement;
  if (t.id === "wallet-sheet") ($("#wallet-sheet") as HTMLDialogElement).close();
});
document.addEventListener("click", (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>("[data-copy]");
  if (!t) return;
  navigator.clipboard?.writeText(t.dataset.copy!).then(() => {
    const old = t.textContent;
    t.textContent = "복사됨";
    setTimeout(() => (t.textContent = old), 1200);
  });
});

/* =====================================================================
   Transactions: one at a time, shown in a dock that survives navigation
   ===================================================================== */

type TxJob = {
  label: string;
  fn: string;
  args: (string | number | boolean)[];
  value?: bigint;
  slow?: boolean; // runs validator LLM consensus
  onSuccess?: (r: Extract<TxOutcome, { ok: true }>) => void | Promise<void>;
  onFail?: () => void;
};

let busy = false;

function setBusy(v: boolean) {
  busy = v;
  document.body.toggleAttribute("data-busy", v);
}

function needWallet(): boolean {
  if (getAccount()) return true;
  openWallet();
  return false;
}

async function runTx(job: TxJob) {
  if (busy || !needWallet()) return;
  const dock = $("#dock");
  const t0 = Date.now();
  let phase = "트랜잭션 서명·전송 중";
  let hash = "";
  const paint = () => {
    const s = Math.floor((Date.now() - t0) / 1000);
    dock.className = "dock pending";
    dock.hidden = false;
    dock.innerHTML = `
      <div class="dock-head"><span class="spinner"></span><b>${esc(job.label)}</b><span class="elapsed mono">${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}</span></div>
      <div class="dock-body">${phase}${job.slow ? `<div class="muted">검증자들이 업비트 공지를 직접 읽고 합의합니다. 보통 수십 초에서 3분 정도 걸립니다.</div>` : ""}</div>
      ${hash ? txLink(hash) : ""}`;
  };
  setBusy(true);
  paint();
  const timer = setInterval(paint, 1000);
  let r: TxOutcome;
  try {
    r = await sendTx(job.fn, job.args, job.value ?? 0n, (p, h) => {
      phase = p === "signing" ? "트랜잭션 서명·전송 중" : "검증자 합의 진행 중";
      if (h) hash = h;
      paint();
    });
  } catch (e: any) {
    r = { ok: false, hash, code: "SEND_FAILED", message: String(e?.shortMessage ?? e?.message ?? e), rateLimited: false };
  }
  clearInterval(timer);
  setBusy(false);
  const secs = Math.floor((Date.now() - t0) / 1000);

  if (r.ok) {
    dock.className = "dock ok";
    dock.innerHTML = `
      <div class="dock-head"><span class="check">✓</span><b>${esc(job.label)} 완료</b><span class="elapsed mono">${secs}초</span><button class="icon-btn" data-close>✕</button></div>
      <div class="dock-body">합의 완료 (${esc(r.status)}). 화면을 최신 상태로 다시 읽었습니다.</div>
      ${txLink(r.hash)}`;
    refreshBalance();
    try {
      await job.onSuccess?.(r);
    } catch (e) {
      console.error(e);
    }
  } else {
    const friendly = r.rateLimited
      ? `Studionet 공용 LLM 호출 한도에 걸렸습니다 (<code>LLM_RATE_LIMITED</code>). 검증자들은 '오류가 났다'는 데 합의했기 때문에 상태는 ACCEPTED로 보이지만 <b>아무것도 바뀌지 않았습니다.</b> 1~2분 뒤 다시 시도하세요.`
      : `${explainError(r.message)}`;
    dock.className = "dock err";
    dock.innerHTML = `
      <div class="dock-head"><span class="x">!</span><b>${esc(job.label)} 실패</b><span class="elapsed mono">${secs}초</span><button class="icon-btn" data-close>✕</button></div>
      <div class="dock-body">${friendly}</div>
      ${r.hash ? txLink(r.hash) : ""}
      <div class="row gap"><button class="btn sm primary" data-retry type="button">다시 시도</button></div>`;
    $("[data-retry]", dock).addEventListener("click", () => runTx(job));
    refreshBalance();
    job.onFail?.();
  }
  $("[data-close]", dock)?.addEventListener("click", () => (dock.hidden = true));
}

function txLink(hash: string) {
  return `<div class="dock-hash"><span class="muted">tx</span> <a class="mono" href="${EXPLORER}/tx/${hash}" target="_blank" rel="noopener">${short(hash, 10)}</a> <button class="link-btn" data-copy="${hash}" type="button">복사</button></div>`;
}

function explainError(msg: string): string {
  const m = esc(msg);
  if (/insufficient|balance|funds/i.test(msg)) return `잔액이 부족합니다. 지갑에서 테스트 GEN을 받으세요.<div class="muted mono">${m}</div>`;
  if (msg.includes("[EXPECTED]")) return `컨트랙트가 요청을 거절했습니다.<div class="mono err-msg">${m}</div>`;
  if (msg.includes("[EXTERNAL]") || msg.includes("[TRANSIENT]"))
    return `업비트 공지 API를 읽지 못했습니다. 잠시 뒤 다시 시도하세요.<div class="mono err-msg">${m}</div>`;
  if (msg.includes("[LLM_ERROR]")) return `모델 출력이 형식에 맞지 않아 검증자들이 받아들이지 않았습니다. 다시 시도하면 새 검증자로 재실행됩니다.<div class="mono err-msg">${m}</div>`;
  return `<div class="mono err-msg">${m}</div>`;
}

/* =====================================================================
   Router
   ===================================================================== */

let renderSeq = 0;

function route() {
  const h = location.hash.replace(/^#\/?/, "") || "markets";
  const [name, arg] = h.split("/");
  const tab = name === "market" ? "markets" : name;
  $$("[data-tab]").forEach((a) => a.classList.toggle("on", a.dataset.tab === tab));
  const seq = ++renderSeq;
  window.scrollTo({ top: 0 });
  if (name === "market" && /^\d+$/.test(arg ?? "")) return renderMarket(Number(arg), seq);
  if (name === "create") return renderCreate();
  if (name === "preview") return renderPreview(arg);
  return renderMarkets(seq);
}

function rerender() {
  const h = location.hash.replace(/^#\/?/, "") || "markets";
  if (h.startsWith("market/")) return renderMarket(Number(h.split("/")[1]), ++renderSeq, true);
  if (h.startsWith("markets") || h === "") return renderMarkets(++renderSeq);
  paintWalletBtn();
}

window.addEventListener("hashchange", route);

/* =====================================================================
   Shared bits
   ===================================================================== */

type Phase = { key: string; ko: string; en: string; tone: string };

function phaseOf(m: Market, now = nowSec()): Phase {
  if (m.status === "yes") return { key: "yes", ko: "YES 확정", en: "Resolved YES", tone: "yes" };
  if (m.status === "no") return { key: "no", ko: "NO 확정", en: "Resolved NO", tone: "no" };
  if (m.status === "refund") return { key: "refund", ko: "환불", en: "Refunded", tone: "muted" };
  if (now < m.betting_close) return { key: "betting", ko: "베팅 중", en: "Betting open", tone: "live" };
  if (now <= m.deadline) return { key: "watching", ko: "관찰 중", en: "Window running", tone: "wait" };
  return { key: "resolvable", ko: "판정 가능", en: "Ready to resolve", tone: "act" };
}

const badge = (p: Phase) => `<span class="badge ${p.tone}" title="${p.en}">${p.ko}</span>`;
const eventChip = (e: EventKey) => `<span class="chip ev-${e}">${EVENTS[e].ko}<small>${EVENTS[e].en}</small></span>`;

function oddsBar(yes: bigint, no: bigint) {
  const total = yes + no;
  const pct = total === 0n ? null : Number((yes * 1000n) / total) / 10;
  return `
    <div class="odds">
      <div class="odds-labels">
        <span class="y">YES <b>${pct === null ? "—" : pct.toFixed(pct % 1 ? 1 : 0) + "%"}</b></span>
        <span class="n"><b>${pct === null ? "—" : (100 - pct).toFixed(pct % 1 ? 1 : 0) + "%"}</b> NO</span>
      </div>
      <div class="bar${pct === null ? " empty" : ""}"><i style="width:${pct ?? 50}%"></i></div>
      <div class="odds-pool muted">풀 ${gen(total)} GEN · YES ${gen(yes)} · NO ${gen(no)}</div>
    </div>`;
}

function question(m: { asset: string; event: EventKey }) {
  const q: Record<EventKey, string> = {
    krw_listing: "원화마켓 신규 거래지원을 공지할까?",
    caution: "거래 유의 종목으로 새로 지정할까?",
    delisting: "거래지원 종료를 공지할까?",
  };
  return `업비트가 <b>${esc(m.asset)}</b>의 ${q[m.event]}`;
}

function candidatesTable(cands: Candidate[], event: EventKey) {
  if (!cands.length) return "";
  return `
    <div class="table-wrap">
      <table class="ev-table">
        <thead><tr><th>공지</th><th>제목</th><th>같은 자산</th><th>분류</th><th>반영</th></tr></thead>
        <tbody>
          ${cands
            .map((c) => {
              const hit = c.same_asset && c.event === event;
              return `<tr class="${hit ? "hit" : ""}">
                <td data-l="공지"><a href="${c.url ?? `https://upbit.com/service_center/notice?id=${c.id}`}" target="_blank" rel="noopener" class="mono">#${c.id}</a><div class="muted tiny">${kst(c.at)}</div></td>
                <td data-l="제목" class="title-cell">${esc(c.title)}</td>
                <td data-l="같은 자산">${c.same_asset ? `<span class="pill ok">같음</span>` : `<span class="pill bad">다름</span>`}</td>
                <td data-l="분류"><span class="pill ${c.event === event ? "ok" : "neutral"}">${CLASS_LABEL[c.event] ?? esc(c.event)}</span></td>
                <td data-l="반영">${hit ? `<b class="yes-t">YES 근거</b>` : `<span class="muted">해당 없음</span>`}</td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;
}

const consensusLine = `<p class="consensus"><span class="shield" aria-hidden="true"></span>검증자마다 업비트 공지를 따로 읽고 분류합니다. 후보 공지 목록, 공지별 분류, 결과가 모두 같아야 확정됩니다.</p>`;

function errorBox(e: any, retry: string) {
  return `<div class="callout err">Studionet에서 데이터를 읽지 못했습니다. <span class="muted">${esc(e?.shortMessage ?? e?.message ?? e)}</span>
    <div><button class="btn sm ghost" onclick="${retry}" type="button">다시 읽기</button></div></div>`;
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k]);
      }
    }),
  );
  return out;
}

/* =====================================================================
   1. Markets list
   ===================================================================== */

let shown = PAGE;

async function renderMarkets(seq: number) {
  view().innerHTML = `
    <section class="hero">
      <div>
        <p class="eyebrow">GenLayer Intelligent Contract · Studionet</p>
        <h1>업비트 공지로 정산되는 예/아니오 마켓</h1>
        <p class="lede">원화마켓 상장, 유의종목 지정, 거래지원 종료. 마감 후 GenLayer 검증자들이 업비트 공지사항을 직접 읽고 판정합니다. 공지를 대신 읽어 줄 심판이 필요 없습니다.</p>
        <p class="lede-en">Yes/no markets on Upbit trade notices, settled by validators that read Upbit's notice board themselves.</p>
      </div>
      <ol class="steps">
        <li><b>1</b><div><strong>마켓 열기</strong><span>티커, 자산 설명, 이벤트, 관찰 구간</span></div></li>
        <li><b>2</b><div><strong>베팅</strong><span>관찰 구간이 시작되면 베팅 마감</span></div></li>
        <li><b>3</b><div><strong>판정·정산</strong><span>검증자 합의로 YES/NO, 이긴 쪽이 풀을 나눔</span></div></li>
      </ol>
    </section>
    <section>
      <div class="section-head">
        <h2>마켓 <small>Markets</small></h2>
        <div class="row gap">
          <button class="btn ghost sm" id="reload" type="button">새로고침</button>
          <a class="btn primary sm" href="#/create">+ 마켓 만들기</a>
        </div>
      </div>
      <div id="stats" class="stats"></div>
      <div id="list" class="grid">${skeletonCards(3)}</div>
    </section>`;
  $("#reload").addEventListener("click", () => renderMarkets(++renderSeq));
  paintWalletBtn();

  try {
    const count = await getMarketCount();
    if (seq !== renderSeq) return;
    const ids = Array.from({ length: Math.min(count, shown) }, (_, i) => count - 1 - i);
    const markets = await pool(ids, 4, getMarket);
    if (seq !== renderSeq) return;
    const now = nowSec();
    const open = markets.filter((m) => m.status === "open").length;
    const tvl = markets.reduce((a, m) => a + (m.status === "open" ? m.yes_pool + m.no_pool : 0n), 0n);
    $("#stats").innerHTML = `
      <div><span>전체 마켓</span><b>${count}</b></div>
      <div><span>진행 중</span><b>${open}</b></div>
      <div><span>진행 중 마켓 풀</span><b>${gen(tvl)} <small>GEN</small></b></div>
      <div><span>판정 완료</span><b>${markets.length - open}</b></div>`;
    $("#list").innerHTML = markets.length
      ? markets.map((m) => marketCard(m, now)).join("") +
        (count > shown ? `<button class="btn ghost more-btn" id="more" type="button">이전 마켓 더 보기 (${count - shown})</button>` : "")
      : `<div class="empty-state">아직 마켓이 없습니다. <a href="#/create">첫 마켓을 만들어 보세요.</a></div>`;
    $("#more")?.addEventListener("click", () => {
      shown += PAGE;
      renderMarkets(++renderSeq);
    });
  } catch (e) {
    if (seq !== renderSeq) return;
    $("#list").innerHTML = errorBox(e, "location.reload()");
  }
}

function skeletonCards(n: number) {
  return Array.from({ length: n }, () => `<div class="card skel"><i></i><i></i><i></i></div>`).join("");
}

function marketCard(m: Market, now: number) {
  const p = phaseOf(m, now);
  const timeNote =
    p.key === "betting"
      ? `베팅 마감 ${relTime(m.betting_close)}`
      : p.key === "watching"
        ? `관찰 종료 ${relTime(m.deadline)}`
        : p.key === "resolvable"
          ? `누구나 판정 실행 가능`
          : `정산 완료`;
  return `
    <a class="card market-card" href="#/market/${m.id}">
      <div class="card-top">
        <span class="sym">${esc(m.symbol)}</span>
        ${eventChip(m.event)}
        <span class="spacer"></span>
        ${badge(p)}
      </div>
      <p class="q">${question(m)}</p>
      <div class="window"><span class="muted">관찰 구간</span> ${kst(m.betting_close)} → ${kst(m.deadline)} <small class="muted">KST</small></div>
      ${oddsBar(m.yes_pool, m.no_pool)}
      <div class="card-foot"><span class="muted">#${m.id}</span><span>${timeNote}</span></div>
    </a>`;
}

/* =====================================================================
   2. Market detail
   ===================================================================== */

async function renderMarket(id: number, seq: number, keepScroll = false) {
  if (!keepScroll || !$("#mk")) {
    view().innerHTML = `
      <a class="back" href="#/markets">← 마켓 목록</a>
      <div id="mk"><div class="card skel tall"><i></i><i></i><i></i></div></div>`;
  }
  paintWalletBtn();
  try {
    const acc = getAccount();
    const [m, stake] = await Promise.all([getMarket(id), acc ? getStake(id, acc.address) : Promise.resolve(null)]);
    if (seq !== renderSeq) return;
    paintMarket(m, stake);
  } catch (e: any) {
    if (seq !== renderSeq) return;
    $("#mk").innerHTML = /unknown market/.test(String(e?.message))
      ? `<div class="empty-state">#${id} 마켓이 없습니다. <a href="#/markets">목록으로</a></div>`
      : errorBox(e, "location.reload()");
  }
}

function paintMarket(m: Market, stake: { yes: bigint; no: bigint } | null) {
  const now = nowSec();
  const p = phaseOf(m, now);
  const acc = getAccount();
  const total = m.yes_pool + m.no_pool;
  const canBet = m.status === "open" && now < m.betting_close;
  const canResolve = m.status === "open" && now > m.deadline;
  const canVoid = m.status === "open" && now >= m.deadline + VOID_AFTER;

  let payout = 0n;
  if (stake && m.status !== "open") {
    if (m.status === "refund") payout = stake.yes + stake.no;
    else {
      const mine = m.status === "yes" ? stake.yes : stake.no;
      const win = m.status === "yes" ? m.yes_pool : m.no_pool;
      payout = mine && win ? (mine * total) / win : 0n;
    }
  }
  const hasStake = !!stake && stake.yes + stake.no > 0n;

  const steps = [
    { t: null as number | null, ko: "마켓 생성", done: true },
    { t: m.betting_close, ko: "베팅 마감 · 관찰 시작", done: now >= m.betting_close },
    { t: m.deadline, ko: "관찰 종료", done: now > m.deadline },
    { t: null, ko: m.status === "open" ? "판정 대기" : `판정: ${p.ko}`, done: m.status !== "open" },
  ];

  $("#mk").innerHTML = `
    <section class="detail-head card">
      <div class="card-top">
        <span class="sym lg">${esc(m.symbol)}</span>
        ${eventChip(m.event)}
        <span class="spacer"></span>
        ${badge(p)}
      </div>
      <h1 class="q lg">${question(m)}</h1>
      <p class="muted">관찰 구간 <b>${kst(m.betting_close)}</b> → <b>${kst(m.deadline)}</b> KST · 마켓 #${m.id} · 생성자 <a class="mono" href="${EXPLORER}/address/${m.creator}" target="_blank" rel="noopener">${short(m.creator, 6)}</a></p>
      ${oddsBar(m.yes_pool, m.no_pool)}
    </section>

    <div class="detail-grid mk-grid">
      <div class="col">
        <section class="card">
          <h3>판정 기준 <small>Rule</small></h3>
          <p>${EVENTS[m.event].rule}</p>
          <p class="muted small">해당 없음: ${EVENTS[m.event].not}</p>
          <p class="muted small en">${esc(m.event_rule)}</p>
          <p class="muted small">관찰 구간 안에 처음 게시되고 제목에 <code>(${esc(m.symbol)})</code>가 들어간 업비트 거래 공지만 후보가 됩니다.</p>
        </section>

        <section class="card">
          <h3>진행 단계 <small>Timeline</small></h3>
          <ol class="timeline">
            ${steps
              .map(
                (s) =>
                  `<li class="${s.done ? "done" : ""}"><i></i><div><b>${s.ko}</b>${s.t ? `<span class="muted">${kst(s.t)} · ${relTime(s.t)}</span>` : ""}</div></li>`,
              )
              .join("")}
          </ol>
        </section>

        <section class="card">
          <h3>판정 근거 <small>Evidence</small></h3>
          ${consensusLine}
          ${
            m.status === "open"
              ? `<div class="empty-state sm">아직 판정 전입니다. 판정이 끝나면 검증자들이 확인한 후보 공지와 분류가 여기에 기록됩니다.</div>`
              : m.evidence.length
                ? candidatesTable(m.evidence, m.event)
                : `<div class="empty-state sm">관찰 구간 안에 제목에 <code>(${esc(m.symbol)})</code>가 들어간 거래 공지가 없었습니다. LLM 호출 없이 <b>NO</b>로 판정됐습니다.${m.status === "refund" ? " 한쪽에만 베팅이 있어 전원 환불됐습니다." : ""}</div>`
          }
        </section>
      </div>

      <div class="col side">
        <section class="card">
          <h3>베팅 <small>Bet</small></h3>
          ${
            canBet
              ? `
            <div class="side-toggle" role="radiogroup">
              <label><input type="radio" name="side" value="yes" checked><span class="y">YES<small>공지 나온다</small></span></label>
              <label><input type="radio" name="side" value="no"><span class="n">NO<small>안 나온다</small></span></label>
            </div>
            <label class="field">
              <span>금액 (GEN)</span>
              <div class="amount"><input id="amt" inputmode="decimal" value="1" autocomplete="off"><span>GEN</span></div>
              <div class="quick">${[1, 5, 10, 25].map((v) => `<button type="button" data-amt="${v}">${v}</button>`).join("")}</div>
            </label>
            <p class="est muted" id="est"></p>
            <button class="btn primary wide" id="bet-btn" data-tx type="button">베팅하기</button>
            <p class="muted tiny">베팅 마감 ${kst(m.betting_close)} KST (${relTime(m.betting_close)}). 마감 후에는 취소할 수 없습니다.</p>`
              : `<p class="muted">${m.status === "open" ? "관찰 구간이 시작되어 베팅이 마감됐습니다." : "정산이 끝난 마켓입니다."}</p>`
          }
        </section>

        <section class="card">
          <h3>내 포지션 <small>Your stake</small></h3>
          ${
            !acc
              ? `<p class="muted">지갑을 연결하면 내 베팅을 볼 수 있습니다.</p><button class="btn ghost wide" id="w-open" type="button">테스트넷 지갑 만들기</button>`
              : `
            <div class="stake">
              <div><span class="y">YES</span><b>${gen(stake?.yes ?? 0n, 4)}</b></div>
              <div><span class="n">NO</span><b>${gen(stake?.no ?? 0n, 4)}</b></div>
            </div>
            ${
              m.status !== "open"
                ? payout > 0n
                  ? `<p>받을 금액 <b class="big">${gen(payout, 4)} GEN</b></p>`
                  : `<p class="muted">${hasStake ? "진 쪽에 베팅해 받을 금액이 없습니다." : "남은 포지션이 없습니다. 정산금을 이미 받았거나 베팅하지 않은 마켓입니다."}</p>`
                : ""
            }
            <button class="btn ${payout > 0n ? "primary" : "ghost"} wide" id="redeem-btn" data-tx type="button" ${payout > 0n ? "" : "disabled"}>정산금 받기 <small>Redeem</small></button>`
          }
        </section>

        <section class="card">
          <h3>판정 실행 <small>Resolve</small></h3>
          <p class="muted small">${
            canResolve
              ? "관찰 구간이 끝났습니다. 누구나 판정을 실행할 수 있습니다. 검증자들이 업비트 공지를 읽고 합의하는 데 수십 초~3분 걸립니다."
              : m.status === "open"
                ? `관찰 종료(${kst(m.deadline)} KST) 후에 열립니다.`
                : "판정이 끝났습니다."
          }</p>
          <button class="btn ${canResolve ? "primary" : "ghost"} wide" id="resolve-btn" data-tx type="button" ${canResolve ? "" : "disabled"}>판정 실행</button>
          ${
            m.status === "open" && now > m.deadline
              ? `<button class="btn ghost wide sm mt" id="void-btn" data-tx type="button" ${canVoid ? "" : "disabled"}>무효 처리 · 전원 환불 <small>Void</small></button>
                 <p class="muted tiny">업비트 데이터로 판정이 안 될 때의 비상구. 관찰 종료 21일 뒤(${kst(m.deadline + VOID_AFTER)})부터 가능.</p>`
              : ""
          }
        </section>
      </div>
    </div>`;

  const reload = () => renderMarket(m.id, ++renderSeq, true);

  $("#w-open")?.addEventListener("click", openWallet);

  if (canBet) {
    const amt = $("#amt") as HTMLInputElement;
    const est = () => {
      const v = parseGen(amt.value);
      const yes = ($("input[name=side]:checked") as HTMLInputElement).value === "yes";
      const btn = $("#bet-btn") as HTMLButtonElement;
      if (!v || v <= 0n) {
        $("#est").textContent = "금액을 입력하세요.";
        btn.disabled = true;
        return;
      }
      btn.disabled = false;
      const side = yes ? m.yes_pool : m.no_pool;
      const mine = (yes ? stake?.yes : stake?.no) ?? 0n;
      const ret = ((mine + v) * (total + v)) / (side + v);
      const other = yes ? m.no_pool : m.yes_pool;
      $("#est").innerHTML =
        other === 0n
          ? `반대쪽 베팅이 아직 없습니다. 끝까지 없으면 전액 환불됩니다.`
          : `${yes ? "YES" : "NO"} 적중 시 약 <b>${gen(ret, 3)} GEN</b> 수령 (현재 풀 기준, 배당 ${(Number((ret * 1000n) / (mine + v)) / 1000).toFixed(2)}x)`;
      btn.textContent = `${yes ? "YES" : "NO"}에 ${gen(v, 4)} GEN 베팅`;
    };
    amt.addEventListener("input", est);
    $$("input[name=side]").forEach((r) => r.addEventListener("change", est));
    $$("[data-amt]").forEach((b) =>
      b.addEventListener("click", () => {
        amt.value = b.dataset.amt!;
        est();
      }),
    );
    est();
    $("#bet-btn").addEventListener("click", () => {
      const v = parseGen(amt.value);
      if (!v) return;
      const yes = ($("input[name=side]:checked") as HTMLInputElement).value === "yes";
      runTx({ label: `#${m.id} ${yes ? "YES" : "NO"} ${gen(v, 4)} GEN 베팅`, fn: "bet", args: [m.id, yes], value: v, onSuccess: reload });
    });
  }
  $("#redeem-btn")?.addEventListener("click", () => runTx({ label: `#${m.id} 정산금 받기`, fn: "redeem", args: [m.id], onSuccess: reload }));
  $("#resolve-btn")?.addEventListener("click", () =>
    runTx({ label: `#${m.id} 판정 실행`, fn: "resolve", args: [m.id], slow: true, onSuccess: reload }),
  );
  $("#void-btn")?.addEventListener("click", () => runTx({ label: `#${m.id} 무효 처리`, fn: "void", args: [m.id], onSuccess: reload }));
}

/* =====================================================================
   Event picker (create + preview)
   ===================================================================== */

function eventPicker(name: string, selected: EventKey) {
  return `<div class="ev-pick" role="radiogroup">
    ${(Object.keys(EVENTS) as EventKey[])
      .map(
        (k) => `<label>
        <input type="radio" name="${name}" value="${k}" ${k === selected ? "checked" : ""}>
        <span><b>${EVENTS[k].ko}</b><small>${EVENTS[k].en} · <code>${k}</code></small><em>${EVENTS[k].rule}</em><em class="not">해당 없음: ${EVENTS[k].not}</em></span>
      </label>`,
      )
      .join("")}
  </div>`;
}

const SYMBOL_RE = /^[A-Z0-9]{1,15}$/;

const dur = (sec: number) =>
  sec < 3600 ? `${Math.round(sec / 60)}분` : sec < 86400 ? `${Math.round((sec / 3600) * 10) / 10}시간` : `${Math.round((sec / 86400) * 10) / 10}일`;

function fieldErr(form: HTMLElement, name: string, msg: string) {
  const el = $(`[data-err="${name}"]`, form);
  if (el) el.textContent = msg;
  $(`[name="${name}"]`, form)?.toggleAttribute("aria-invalid", !!msg);
}

/* =====================================================================
   3. Create market
   ===================================================================== */

function renderCreate() {
  paintWalletBtn();
  const now = nowSec();
  const close = Math.ceil((now + 3600) / 600) * 600;
  const deadline = close + 7 * 86400;
  view().innerHTML = `
    <div class="page-head">
      <h1>마켓 만들기 <small>Create a market</small></h1>
      <p class="lede">질문 하나를 엽니다: <i>"업비트가 이 기간에 이 자산에 대해 이 공지를 낼까?"</i> 베팅은 관찰 구간이 시작될 때 닫히므로, 공지를 본 뒤에는 아무도 베팅할 수 없습니다.</p>
    </div>
    <form class="card form" id="cf" novalidate>
      <div class="two">
        <label class="field">
          <span>티커 <small>Symbol</small></span>
          <input name="symbol" placeholder="예: POD" autocomplete="off" maxlength="15" style="text-transform:uppercase">
          <em class="hint">업비트 공지 제목의 괄호 안 표기 그대로. 예: 돌핀(<b>POD</b>)</em>
          <em class="err" data-err="symbol"></em>
        </label>
        <label class="field">
          <span>자산 설명 <small>Asset</small></span>
          <input name="asset" placeholder="예: Dolphin (POD), Base network" maxlength="200" autocomplete="off">
          <em class="hint"><b>프로젝트 이름 + 네트워크</b>. 같은 티커를 쓰는 다른 프로젝트와 구분하는 기준입니다.</em>
          <em class="err" data-err="asset"></em>
        </label>
      </div>
      <div class="field">
        <span>이벤트 <small>Event</small></span>
        ${eventPicker("event", "krw_listing")}
      </div>
      <div class="two">
        <label class="field">
          <span>베팅 마감 = 관찰 시작 <small>Betting close (KST)</small></span>
          <input type="datetime-local" name="close" value="${toKstInput(close)}">
          <em class="hint">이 시각부터 게시된 공지만 판정에 쓰입니다.</em>
          <em class="err" data-err="close"></em>
        </label>
        <label class="field">
          <span>관찰 종료 <small>Deadline (KST)</small></span>
          <input type="datetime-local" name="deadline" value="${toKstInput(deadline)}">
          <em class="hint">관찰 구간은 최대 60일. 종료 후 누구나 판정을 실행할 수 있습니다.</em>
          <em class="err" data-err="deadline"></em>
        </label>
      </div>
      <div class="summary" id="c-sum"></div>
      <div class="row gap end">
        <a class="btn ghost" href="#/preview">먼저 과거 구간으로 검증해 보기</a>
        <button class="btn primary" data-tx type="submit">마켓 만들기</button>
      </div>
    </form>`;

  const f = $("#cf") as HTMLFormElement;
  const val = () => {
    const fd = new FormData(f);
    const symbol = String(fd.get("symbol") ?? "").trim().toUpperCase();
    const asset = String(fd.get("asset") ?? "").trim();
    const event = String(fd.get("event")) as EventKey;
    const c = fromKstInput(String(fd.get("close")));
    const d = fromKstInput(String(fd.get("deadline")));
    const n = nowSec();
    const errs: Record<string, string> = { symbol: "", asset: "", close: "", deadline: "" };
    if (!SYMBOL_RE.test(symbol)) errs.symbol = "영문 대문자·숫자 1~15자";
    if (asset.length < 3 || asset.length > 200) errs.asset = "3~200자로 이름과 네트워크를 적어 주세요";
    if (c === null) errs.close = "날짜와 시각을 입력하세요";
    else if (c <= n + 120) errs.close = "지금으로부터 2분 이상 뒤여야 합니다 (트랜잭션 처리 시간)";
    if (d === null) errs.deadline = "날짜와 시각을 입력하세요";
    else if (c !== null && d <= c) errs.deadline = "베팅 마감보다 뒤여야 합니다";
    else if (c !== null && d - c > MAX_WINDOW) errs.deadline = "관찰 구간은 최대 60일입니다";
    return { symbol, asset, event, c, d, errs, ok: Object.values(errs).every((x) => !x) };
  };
  const paintSum = () => {
    const v = val();
    $("#c-sum").innerHTML =
      v.symbol && v.asset && v.c && v.d && v.d > v.c
        ? `<span class="muted">미리보기</span> <b>${esc(v.symbol)}</b> · ${question({ asset: v.asset, event: v.event })} <span class="muted">(${kst(v.c)} → ${kst(v.d)} KST, ${dur(v.d - v.c)})</span>`
        : "";
  };
  f.addEventListener("input", paintSum);
  paintSum();
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const v = val();
    Object.entries(v.errs).forEach(([k, m]) => fieldErr(f, k, m));
    if (!v.ok) return;
    runTx({
      label: `${v.symbol} ${EVENTS[v.event].ko} 마켓 생성`,
      fn: "create_market",
      args: [v.symbol, v.asset, v.event, v.c!, v.d!],
      onSuccess: async (r) => {
        const id = Number(String(r.returned ?? "").replace(/\D/g, ""));
        location.hash = Number.isFinite(id) && String(r.returned ?? "").match(/\d/) ? `#/market/${id}` : "#/markets";
      },
    });
  });
}

/* =====================================================================
   4. Preview (backtest a past window)
   ===================================================================== */

function renderPreview(exampleIdx?: string) {
  paintWalletBtn();
  const ex = EXAMPLES[Number(exampleIdx ?? 0)] ?? EXAMPLES[0];
  view().innerHTML = `
    <div class="page-head">
      <h1>과거 구간 검증 <small>Backtest a past window</small></h1>
      <p class="lede">마켓을 열기 전에, 같은 판정 로직을 이미 지나간 구간에 돌려 봅니다. 자산 설명을 어떻게 적어야 원하는 공지를 정확히 잡는지 확인하는 용도입니다.</p>
      <div class="callout info">
        <b>실제 검증자 합의가 돌아가는 쓰기 트랜잭션입니다.</b> 각 검증자가 업비트 공지를 읽고 LLM으로 분류한 뒤 합의하므로 <b>수십 초~3분</b> 걸립니다. 마켓 상태는 바꾸지 않고, 결과는 내 주소에 저장됩니다.
      </div>
    </div>

    <div class="examples">
      <span class="muted">실제 사례로 채우기</span>
      ${EXAMPLES.map(
        (x, i) =>
          `<button type="button" class="ex ${x === ex ? "on" : ""}" data-ex="${i}"><b>${esc(x.label)}</b><small>${esc(x.trap)} → <span class="${x.expected}-t">${x.expected.toUpperCase()}</span></small></button>`,
      ).join("")}
    </div>

    <div class="detail-grid">
      <form class="card form col" id="pf" novalidate>
        <div class="two">
          <label class="field"><span>티커 <small>Symbol</small></span><input name="symbol" maxlength="15" style="text-transform:uppercase" autocomplete="off"><em class="err" data-err="symbol"></em></label>
          <label class="field"><span>자산 설명 <small>Asset</small></span><input name="asset" maxlength="200" autocomplete="off"><em class="hint">이름 + 네트워크</em><em class="err" data-err="asset"></em></label>
        </div>
        <div class="field"><span>이벤트 <small>Event</small></span>${eventPicker("event", ex.event)}</div>
        <div class="two">
          <label class="field"><span>시작 <small>Start (KST)</small></span><input type="datetime-local" name="start"><em class="err" data-err="start"></em></label>
          <label class="field"><span>종료 <small>End (KST)</small></span><input type="datetime-local" name="end"><em class="hint">과거 시각만, 최대 60일. 약 두 달 이내 공지까지 조회됩니다.</em><em class="err" data-err="end"></em></label>
        </div>
        <div class="row gap end"><button class="btn primary" data-tx type="submit">검증 실행</button></div>
      </form>

      <div class="col side">
        <section class="card" id="pv-out">
          <h3>결과 <small>Result</small></h3>
          <div class="empty-state sm">검증을 실행하면 결과가 여기에 표시됩니다.</div>
        </section>
        <section class="card ref">
          <h3>이 사례의 기록 <small>On-chain record</small></h3>
          <p class="small">2026-10-05 Studionet 실행 결과: <b class="${ex.expected}-t">${ex.expected.toUpperCase()}</b></p>
          <p class="small">공지 <a href="https://upbit.com/service_center/notice?id=${ex.notice.id}" target="_blank" rel="noopener">#${ex.notice.id}</a> ${esc(ex.notice.title)}</p>
          <p class="small"><a class="mono" href="${EXPLORER}/tx/${ex.tx}" target="_blank" rel="noopener">tx ${short(ex.tx, 10)}</a></p>
        </section>
      </div>
    </div>`;

  const f = $("#pf") as HTMLFormElement;
  const fill = (x: (typeof EXAMPLES)[number]) => {
    (f.elements.namedItem("symbol") as HTMLInputElement).value = x.symbol;
    (f.elements.namedItem("asset") as HTMLInputElement).value = x.asset;
    (f.elements.namedItem("start") as HTMLInputElement).value = x.start;
    (f.elements.namedItem("end") as HTMLInputElement).value = x.end;
    ($(`input[name=event][value=${x.event}]`, f) as HTMLInputElement).checked = true;
  };
  fill(ex);
  $$("[data-ex]").forEach((b) => b.addEventListener("click", () => (location.hash = `#/preview/${b.dataset.ex}`)));

  const showResult = (res: PreviewResult, title: string) => {
    $("#pv-out").innerHTML = `
      <h3>${title}</h3>
      <div class="outcome ${res.outcome}">
        <span>${res.outcome.toUpperCase()}</span>
        <div><b>${esc(res.symbol)}</b> · ${EVENTS[res.event]?.ko ?? esc(res.event)}<div class="muted small">${esc(res.asset)}</div><div class="muted tiny">${kst(res.start)} → ${kst(res.end)} KST</div></div>
      </div>
      ${consensusLine}
      ${
        res.candidates.length
          ? candidatesTable(res.candidates, res.event)
          : `<div class="empty-state sm">구간 안에 제목에 <code>(${esc(res.symbol)})</code>가 들어간 거래 공지가 없어 LLM 호출 없이 NO.</div>`
      }`;
  };

  // show my last stored preview, if any
  const acc = getAccount();
  if (acc) {
    getPreview(acc.address)
      .then((p) => p && $("#pv-out") && showResult(p, `내 최근 검증 결과 <small>Last preview</small>`))
      .catch(() => {});
  }

  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(f);
    const symbol = String(fd.get("symbol") ?? "").trim().toUpperCase();
    const asset = String(fd.get("asset") ?? "").trim();
    const event = String(fd.get("event")) as EventKey;
    const s = fromKstInput(String(fd.get("start")));
    const en = fromKstInput(String(fd.get("end")));
    const n = nowSec();
    const errs: Record<string, string> = { symbol: "", asset: "", start: "", end: "" };
    if (!SYMBOL_RE.test(symbol)) errs.symbol = "영문 대문자·숫자 1~15자";
    if (asset.length < 3 || asset.length > 200) errs.asset = "3~200자";
    if (s === null) errs.start = "날짜와 시각을 입력하세요";
    if (en === null) errs.end = "날짜와 시각을 입력하세요";
    else if (en > n) errs.end = "이미 지난 시각이어야 합니다";
    else if (s !== null && en <= s) errs.end = "시작보다 뒤여야 합니다";
    else if (s !== null && en - s > MAX_WINDOW) errs.end = "구간은 최대 60일입니다";
    Object.entries(errs).forEach(([k, m]) => fieldErr(f, k, m));
    if (Object.values(errs).some(Boolean)) return;
    $("#pv-out").innerHTML = `<h3>결과 <small>Result</small></h3><div class="empty-state sm"><span class="spinner"></span> 검증자 합의 진행 중… 화면 아래 진행 상태를 확인하세요.</div>`;
    runTx({
      label: `${symbol} ${EVENTS[event].ko} 과거 구간 검증`,
      fn: "preview",
      args: [symbol, asset, event, s!, en!],
      slow: true,
      onFail: () => {
        if ($("#pv-out")) $("#pv-out").innerHTML = `<h3>결과 <small>Result</small></h3><div class="empty-state sm">검증이 완료되지 않았습니다. 화면 아래 안내를 확인하고 다시 시도하세요.</div>`;
      },
      onSuccess: async () => {
        const p = await getPreview(getAccount()!.address);
        if (p && $("#pv-out")) showResult(p, `검증 결과 <small>Preview result</small>`);
      },
    });
  });
}

/* ===================================================================== */

paintWalletBtn();
refreshBalance();
route();
