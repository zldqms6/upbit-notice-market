// Everything that talks to Studionet lives here: the read client, the burner
// wallet, funding, and the write-and-wait loop with leader-error detection.
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionHashVariant, TransactionStatus } from "genlayer-js/types";

export const CONTRACT = "0xcBFAe21737493E5ce5cA22686D5D2AECA4140A8c" as const;
export const RPC_URL = studionet.rpcUrls.default.http[0];
export const EXPLORER = "https://explorer-studio.genlayer.com";
export const GEN = 10n ** 18n;

const PK_KEY = "unm.burner.pk";

export const reader = createClient({ chain: studionet });

/* ---------- burner wallet ---------- */

function loadPk(): `0x${string}` | null {
  try {
    const v = localStorage.getItem(PK_KEY);
    return v && /^0x[0-9a-fA-F]{64}$/.test(v) ? (v as `0x${string}`) : null;
  } catch {
    return null;
  }
}

let account = (() => {
  const pk = loadPk();
  return pk ? createAccount(pk) : null;
})();

export function getAccount() {
  return account;
}

export function createBurner() {
  const pk = generatePrivateKey();
  try {
    localStorage.setItem(PK_KEY, pk);
  } catch {
    /* private mode: the wallet lives for this tab only */
  }
  account = createAccount(pk);
  return account;
}

export function forgetBurner() {
  try {
    localStorage.removeItem(PK_KEY);
  } catch {
    /* ignore */
  }
  account = null;
}

export function exportPk(): string | null {
  return loadPk();
}

export async function getBalance(address: `0x${string}`): Promise<bigint> {
  return reader.getBalance({ address });
}

/** Studionet's faucet. CORS on studio.genlayer.com reflects any origin, so this works from the browser. */
export async function fundAccount(address: string, gen = 100n): Promise<void> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "sim_fundAccount",
      params: [address, Number(gen * GEN)],
    }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message ?? JSON.stringify(body.error));
}

/* ---------- contract reads ---------- */

export type Candidate = {
  id: number;
  title: string;
  at: number;
  same_asset: boolean;
  event: string;
  url?: string;
};

export type Market = {
  id: number;
  creator: string;
  symbol: string;
  asset: string;
  event: EventKey;
  event_rule: string;
  betting_close: number;
  deadline: number;
  yes_pool: bigint;
  no_pool: bigint;
  status: "open" | "yes" | "no" | "refund";
  evidence: Candidate[];
};

export type PreviewResult = {
  symbol: string;
  asset: string;
  event: EventKey;
  start: number;
  end: number;
  outcome: "yes" | "no";
  candidates: Candidate[];
};

export type EventKey = "krw_listing" | "caution" | "delisting";

// "latest-nonfinal": state as accepted by consensus, before the appeal window closes.
// Without it, a fresh write would not be visible for a long time on Studionet.
async function read(functionName: string, args: (string | number | boolean)[] = []): Promise<any> {
  const v = await reader.readContract({
    address: CONTRACT,
    functionName,
    args,
    transactionHashVariant: TransactionHashVariant.LATEST_NONFINAL,
  });
  return v instanceof Map ? Object.fromEntries(v) : v;
}

const big = (v: unknown) => BigInt(String(v ?? 0));

export async function getMarketCount(): Promise<number> {
  return Number(await read("get_market_count"));
}

export async function getMarket(id: number): Promise<Market> {
  const m = await read("get_market", [id]);
  return {
    ...m,
    id,
    betting_close: Number(m.betting_close),
    deadline: Number(m.deadline),
    yes_pool: big(m.yes_pool),
    no_pool: big(m.no_pool),
    evidence: (m.evidence ?? []).map(normCandidate),
  };
}

export async function getStake(id: number, who: string): Promise<{ yes: bigint; no: bigint }> {
  const s = await read("get_stake", [id, who]);
  return { yes: big(s.yes), no: big(s.no) };
}

export async function getPreview(who: string): Promise<PreviewResult | null> {
  const p = await read("get_preview", [who]);
  if (!p || !p.outcome) return null;
  return { ...p, start: Number(p.start), end: Number(p.end), candidates: (p.candidates ?? []).map(normCandidate) };
}

function normCandidate(c: any): Candidate {
  const x = c instanceof Map ? Object.fromEntries(c) : c;
  return { ...x, id: Number(x.id), at: Number(x.at) };
}

/* ---------- writes ---------- */

export type TxOutcome =
  | { ok: true; hash: string; status: string; returned?: string }
  | { ok: false; hash?: string; status?: string; code: string; message: string; rateLimited: boolean };

export type TxProgress = (phase: "signing" | "pending", hash?: string) => void;

/**
 * Send a write and wait until consensus accepts it. "ACCEPTED" alone is not
 * success: if the leader errored (e.g. LLM_RATE_LIMITED on Studionet's shared
 * provider, or a contract UserError), validators agree on the error and the
 * tx is still ACCEPTED with no state change. So look at the leader receipt.
 */
export async function sendTx(
  functionName: string,
  args: (string | number | boolean)[],
  value: bigint,
  onProgress: TxProgress,
): Promise<TxOutcome> {
  if (!account) throw new Error("no wallet");
  const writer = createClient({ chain: studionet, account });
  onProgress("signing");
  const hash = (await writer.writeContract({ account, address: CONTRACT, functionName, args, value })) as string;
  onProgress("pending", hash);
  const r: any = await reader.waitForTransactionReceipt({
    hash: hash as any,
    status: TransactionStatus.ACCEPTED,
    retries: 120,
    interval: 4000,
  });
  const leader = r?.consensus_data?.leader_receipt?.[0];
  const exec = leader?.execution_result;
  const status = r?.statusName ?? r?.status_name ?? "ACCEPTED";
  if (exec !== "ERROR") {
    return { ok: true, hash, status, returned: leader?.result?.payload?.readable };
  }
  const code: string = leader?.genvm_result?.error_code ?? "ERROR";
  const message: string =
    leader?.genvm_result?.error_description ||
    leader?.result?.payload?.readable ||
    leader?.genvm_result?.stderr ||
    code;
  return { ok: false, hash, status, code, message: cleanMsg(message), rateLimited: /RATE_LIMIT/i.test(code + message) };
}

function cleanMsg(s: string): string {
  return String(s).replace(/^"|"$/g, "").trim();
}
