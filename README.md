# UpbitNoticeMarket

Yes/no markets on Upbit trade announcements, resolved by GenLayer validators reading Upbit's own notice board.

## Why I built this

I trade Korean crypto, and a large share of the talk around me is about Upbit:
- will this coin get a KRW listing this month,
- will that one be flagged as a caution asset,
- is this one about to be delisted.

People bet on it informally all the time. Settling those bets is where it breaks down, because someone has to read a Korean notice and get the details right. The notices are full of near-misses:

| Notice title (real, Sept–Oct 2026) | Looks like | Actually |
|---|---|---|
| 캐시캣(CASHCAT) 신규 거래지원 안내 (KRW, BTC, USDT 마켓) | listing | KRW listing ✅ |
| 만트라(MANTRA) 거래 유의 종목 지정 **기간 연장** 안내 | caution | an *extension* of an existing caution, not a new one |
| 샌드박스(SAND) 거래 유의 종목 지정 **해제** 안내 | caution | the caution being *lifted* |
| 아이콘(ICX) 거래지원 종료 안내 (10/19 15:00) | delisting | delisting *announced*, effective weeks later |

Tickers also collide: two unrelated projects can both be "POD", and only the notice body (project name, network) tells them apart.

A keyword oracle gets these wrong, and a single person settling the market is a single point of trust. This is a judgment over public evidence, which is what GenLayer is for.

## How it works

```
create_market(symbol, asset, event, betting_close, deadline)
bet(market_id, yes)           payable, until betting_close
resolve(market_id)            anyone, after deadline   -> yes | no | refund
redeem(market_id)             winners split the pot pro rata
preview(symbol, asset, event, start, end)   dry-run resolution on a past window
void(market_id)               anyone, 21 days after deadline if never resolved -> refund
```

- `event` is one of three fixed rules:
  - `krw_listing`: new trading support that includes the KRW market.
  - `caution`: a new 거래 유의 종목 지정 (caution designation).
  - `delisting`: 거래지원 종료 (end of trading support) is announced.
- `asset` is free text that identifies the project, e.g. `"Dolphin (POD), Base network"`.
- **Only notices published between `betting_close` and `deadline` count.** Betting closes when the window opens, so nobody can bet after seeing the notice.

### Resolution, step by step

1. **Code: candidate list.** The leader pages through `api-manager.upbit.com/api/v1/announcements?category=trade`. It keeps notices whose first publish time is inside the window and whose title contains `(SYMBOL)`. It stops paging once it is past the window start.
   - If 10 pages are not enough to reach the window start, it fails with `[EXTERNAL]` instead of guessing.
2. **Code: notice bodies.** For each candidate it fetches the full notice and strips the HTML.
3. **LLM: classification.** The model sees the market's rule and asset description, and every candidate notice inside `<notice>` tags marked as data. For each notice it returns:
   - `same_asset`: true or false,
   - `event`: `krw_listing`, `caution`, `delisting` or `other`.
   If there are no candidates, the LLM is never called.
4. **Code: outcome.** The answer is `yes` if any candidate has `same_asset` true and `event` equal to the market's event.
5. **Validators.** Every validator does steps 1–4 itself. It accepts only if it got the same candidate set, the same `(same_asset, event)` for every candidate, and the same outcome.
   - Errors are classified the same way as in my other contracts (`[EXPECTED]`, `[EXTERNAL]`, `[TRANSIENT]`, `[LLM_ERROR]`). A bad model output forces a retry with fresh validators instead of being agreed on.

Every candidate and its classification is stored as evidence on the market, with a link to the notice. Anyone can check why it resolved the way it did.

### Money

- Pari-mutuel: the winning side splits the whole pot in proportion to stake.
- If either side has no bets, there is nothing to win, so everyone is refunded.
- `void` is the safety exit if Upbit's API changes or disappears.

## Live run on Studionet (2026-10-05)

Contract: `0xcBFAe21737493E5ce5cA22686D5D2AECA4140A8c`

**`preview` on five real past windows.** Each was picked because it has a trap.

| Market question | Notice found | Validators' classification | Outcome |
|---|---|---|---|
| POD gets a KRW listing, asset "Dolphin (POD), Base network" | 6635 돌핀(POD) 신규 거래지원 안내 (KRW, BTC, USDT 마켓) | same asset, `krw_listing` | **yes** |
| Same window, asset "Pod Protocol, a Solana project" | same notice | **not the same asset**, `krw_listing` | **no** |
| BLAST new caution designation | 6637 블라스트(BLAST) 거래 유의 종목 지정 안내 | same asset, `caution` | **yes** |
| MANTRA new caution designation, 9/15–9/25 | 6589 만트라(MANTRA) 거래 유의 종목 지정 **기간 연장** 안내 | same asset, **`other`** (an extension) | **no** |
| ICX delisting announced, 9/15–9/25 | 6591 아이콘(ICX) 거래지원 종료 안내 | same asset, `delisting` | **yes** |

**A full market, end to end.** "Bitcoin delisting announced" ran over a 3-minute window. One side bet 1 GEN on yes and the other 2 GEN on no. Paging found no candidate notices, so it resolved `no` without an LLM call, and the no-side redeemed 3 GEN.

**Rate limit on Studionet.** The first demo run hit `LLM_RATE_LIMITED` on Studionet's shared LLM provider.
- Those transactions still show as `ACCEPTED`, because validators agree that the call errored, but the leader's `execution_result` is `ERROR` and no state changes.
- The demo script now checks the leader result and retries after a pause. It no longer trusts the status alone.
- Every row above comes from a `SUCCESS` execution. Tx hashes are in `demo_result.json`.

Full output is in `demo_result.json`. Reproduce with `node scripts/live_demo.mjs <contract address>`.

## Tests

```bash
py -3.12 -m venv .venv && .venv/Scripts/pip install genlayer-test
.venv/Scripts/python -m pytest tests -v
```

12 direct-mode tests use real Upbit notices (`tests/fixtures/`, trimmed). They cover:
- input validation and the betting cut-off
- a real KRW listing resolving `yes` with pro-rata payout
- ticker collision resolving `no`
- a caution *extension* not counting as a designation
- no candidates → `no` without calling the LLM
- one-sided market refund
- validators rejecting a leader that lies about the outcome or hides a candidate
- a validator whose model classifies differently
- malformed model output → `[LLM_ERROR]`
- a window older than Upbit's list failing safely
- void and refund
- `preview` on a past window

`tests/conftest.py` only works around a Windows temp-file issue in gltest.

## Limits

- **Upbit's notice API is public but undocumented.** If its shape changes, resolution fails rather than resolving wrongly, and `void` refunds after 21 days.
- **Lookback.** Resolution reads up to 200 trade notices back, roughly two months. Resolve within a few weeks of the deadline.
- **Title filter.** Candidates are filtered by `(SYMBOL)` in the title. Upbit always writes `한글이름(TICKER)` in trade notice titles, but a notice that never names the ticker in its title would be missed.
- **Asset description.** `asset` should be specific (name and network). `preview` exists so a creator can check their wording against past notices before opening a market.
