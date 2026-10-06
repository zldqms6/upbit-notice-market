import { GEN, type EventKey } from "./chain";

export const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const EVENTS: Record<EventKey, { ko: string; en: string; rule: string; not: string; contract: string }> = {
  krw_listing: {
    ko: "원화마켓 상장",
    en: "KRW listing",
    rule: "업비트가 이 자산의 원화(KRW) 마켓 신규 거래지원을 공지하면 YES. 다른 마켓에 이미 있던 자산에 KRW 마켓이 추가되는 경우도 포함.",
    not: "BTC·USDT 마켓만 열리는 상장은 해당 없음",
    contract:
      "Upbit announces new trading support for the asset on the KRW market (a new listing that includes KRW, or adding a KRW market to an asset already listed elsewhere).",
  },
  caution: {
    ko: "유의종목 지정",
    en: "New caution",
    rule: "업비트가 이 자산을 거래 유의 종목으로 새로 지정하면 YES.",
    not: "유의 기간 연장, 지정 해제 공지는 해당 없음",
    contract: "Upbit newly designates the asset as a trading caution asset (거래 유의 종목 지정).",
  },
  delisting: {
    ko: "거래지원 종료",
    en: "Delisting",
    rule: "업비트가 이 자산의 거래지원 종료를 공지하면 YES. 실제 종료일이 구간 뒤여도 공지 시점이 구간 안이면 인정.",
    not: "입출금 중단, 네트워크 점검 공지는 해당 없음",
    contract: "Upbit announces the end of trading support (거래지원 종료) for the asset.",
  },
};

export const CLASS_LABEL: Record<string, string> = {
  krw_listing: "원화마켓 상장",
  caution: "유의종목 지정",
  delisting: "거래지원 종료",
  other: "기타",
};

const KST_FMT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** "2026.10.01 09:00" in KST */
export function kst(unix: number): string {
  const p = Object.fromEntries(KST_FMT.formatToParts(new Date(unix * 1000)).map((x) => [x.type, x.value]));
  return `${p.year}.${p.month}.${p.day} ${p.hour === "24" ? "00" : p.hour}:${p.minute}`;
}

/** value of an <input type="datetime-local"> read as KST -> unix seconds */
export function fromKstInput(v: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return null;
  const t = Date.parse(v.slice(0, 16) + ":00+09:00");
  return Number.isFinite(t) ? Math.floor(t / 1000) : null;
}

/** unix seconds -> value for <input type="datetime-local"> in KST */
export function toKstInput(unix: number): string {
  const d = new Date((unix + 9 * 3600) * 1000);
  return d.toISOString().slice(0, 16);
}

export function gen(wei: bigint, digits = 2): string {
  const neg = wei < 0n;
  const v = neg ? -wei : wei;
  const whole = v / GEN;
  const frac = ((v % GEN) * 10n ** BigInt(digits)) / GEN;
  const f = digits ? "." + frac.toString().padStart(digits, "0") : "";
  return (neg ? "-" : "") + whole.toLocaleString("en-US") + f.replace(/\.?0+$/, "");
}

export function parseGen(s: string): bigint | null {
  const m = String(s).trim().match(/^(\d+)(?:\.(\d{1,18}))?$/);
  if (!m) return null;
  return BigInt(m[1]) * GEN + BigInt((m[2] ?? "").padEnd(18, "0") || "0");
}

export const short = (a: string, n = 6) => (a.length > 2 * n ? `${a.slice(0, n)}…${a.slice(-4)}` : a);

export function relTime(unix: number): string {
  const d = unix - Math.floor(Date.now() / 1000);
  const a = Math.abs(d);
  const unit =
    a < 60 ? `${a}초` : a < 3600 ? `${Math.round(a / 60)}분` : a < 86400 ? `${Math.round(a / 3600)}시간` : `${Math.round(a / 86400)}일`;
  return d >= 0 ? `${unit} 후` : `${unit} 전`;
}

export const nowSec = () => Math.floor(Date.now() / 1000);
