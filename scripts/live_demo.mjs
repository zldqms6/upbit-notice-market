// Live run on Studionet against Upbit's real notice board.
//   node scripts/live_demo.mjs <contractAddress>
// 1) preview() five real past windows, chosen because each one has a trap
// 2) a full market: create, two bets, wait for the window, resolve, redeem
import { createClient, createAccount, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import fs from "node:fs";

const address = process.argv[2];
const GEN = 10n ** 18n;
const kst = (s) => Math.floor(Date.parse(s + "+09:00") / 1000);

function key(name) {
  const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
  const m = env.match(new RegExp(`^${name}=(0x[0-9a-f]+)`, "m"));
  if (m) return m[1];
  const pk = generatePrivateKey();
  fs.appendFileSync(".env", `${name}=${pk}\n`);
  return pk;
}

async function fund(addr) {
  await fetch(studionet.rpcUrls.default.http[0], {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "sim_fundAccount", params: [addr, Number(1000n * GEN)] }),
  });
}

const alice = createAccount(key("DEMO_ALICE_PK"));
const bob = createAccount(key("DEMO_BOB_PK"));
const client = createClient({ chain: studionet });
await fund(alice.address);
await fund(bob.address);

const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x instanceof Map ? Object.fromEntries(x) : x)));
// latest-nonfinal: the appeal window has not passed yet, but the state is what consensus accepted
const read = async (functionName, args) =>
  plain(await client.readContract({ address, functionName, args, transactionHashVariant: "latest-nonfinal" }));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Studionet's shared LLM provider rate-limits bursts. A rate-limited leader still reaches
// "ACCEPTED" (validators agree the call errored), so check the leader's execution result
// and retry after a pause instead of trusting the status alone.
async function write(account, functionName, args, value = 0n) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const hash = await client.writeContract({ account, address, functionName, args, value });
    const r = await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED, retries: 200, interval: 5000 });
    const leader = r?.consensus_data?.leader_receipt?.[0];
    const exec = leader?.execution_result;
    const err = leader?.genvm_result?.error_code;
    console.log(`${functionName}(${JSON.stringify(args)}) -> ${hash} ${r?.status_name ?? ""} ${exec ?? ""} ${err ?? ""}`);
    if (exec !== "ERROR") return { hash, status: r?.status_name, exec };
    if (err !== "LLM_RATE_LIMITED") return { hash, status: r?.status_name, exec, error: err };
    await sleep(90_000 * attempt);
  }
  throw new Error(`${functionName} kept hitting the LLM rate limit`);
}

const out = { contract: address, network: "studionet", previews: [], market: {} };

const cases = [
  ["POD", "Dolphin (POD), Base network", "krw_listing", "2026-10-01T00:00:00", "2026-10-04T00:00:00", "real KRW listing (notice 6635)"],
  ["POD", "Pod Protocol, a Solana project", "krw_listing", "2026-10-01T00:00:00", "2026-10-04T00:00:00", "same ticker, different project"],
  ["BLAST", "Blast (BLAST), Ethereum L2", "caution", "2026-10-02T00:00:00", "2026-10-04T00:00:00", "real new caution designation (6637)"],
  ["MANTRA", "MANTRA (OM / MANTRA chain)", "caution", "2026-09-15T00:00:00", "2026-09-25T00:00:00", "only an EXTENSION of caution (6589)"],
  ["ICX", "ICON (ICX)", "delisting", "2026-09-15T00:00:00", "2026-09-25T00:00:00", "real delisting announcement (6591)"],
];
for (const [sym, asset, event, s, e, why] of cases) {
  await sleep(30_000);
  const tx = await write(alice, "preview", [sym, asset, event, kst(s), kst(e)]);
  const res = await read("get_preview", [alice.address]);
  console.log(`  ${why}: outcome=${res.outcome}`, JSON.stringify(res.candidates));
  out.previews.push({ why, symbol: sym, asset, event, window: [s, e], tx: tx.hash, status: tx.status, result: res });
}

if (process.argv.includes("--previews-only")) {
  const prev = fs.existsSync("demo_result.json") ? JSON.parse(fs.readFileSync("demo_result.json", "utf8")) : {};
  out.market = prev.market ?? {};
  fs.writeFileSync("demo_result.json", JSON.stringify(out, null, 2));
  process.exit(0);
}

// a real market end to end, with a window that starts in ~2.5 minutes
const close = Math.floor(Date.now() / 1000) + 150;
const deadline = close + 180;
const before = Number(await read("get_market_count", []));
await write(alice, "create_market", ["BTC", "Bitcoin (BTC)", "delisting", close, deadline]);
await write(alice, "bet", [before, true], 1n * GEN);
await write(bob, "bet", [before, false], 2n * GEN);
const wait = (deadline + 20) * 1000 - Date.now();
console.log(`waiting ${Math.round(wait / 1000)}s for the market window to close...`);
await new Promise((r) => setTimeout(r, Math.max(wait, 0)));
const res = await write(bob, "resolve", [before]);
const red = await write(bob, "redeem", [before]);
out.market = { id: before, resolve_tx: res.hash, redeem_tx: red.hash, final: await read("get_market", [before]) };
console.log(JSON.stringify(out.market.final, null, 2));

fs.writeFileSync("demo_result.json", JSON.stringify(out, null, 2));
