import type { EventKey } from "./chain";

// Real past windows already run through preview() on Studionet (see ../demo_result.json).
// Each one has a trap that a keyword match would get wrong.
export type Example = {
  label: string;
  trap: string;
  symbol: string;
  asset: string;
  event: EventKey;
  start: string; // KST, datetime-local format
  end: string;
  expected: "yes" | "no";
  notice: { id: number; title: string };
  tx: string;
};

export const EXAMPLES: Example[] = [
  {
    label: "돌핀(POD) 원화마켓 상장",
    trap: "실제 KRW 상장 공지",
    symbol: "POD",
    asset: "Dolphin (POD), Base network",
    event: "krw_listing",
    start: "2026-10-01T00:00",
    end: "2026-10-04T00:00",
    expected: "yes",
    notice: { id: 6635, title: "돌핀(POD) 신규 거래지원 안내 (KRW, BTC, USDT 마켓)" },
    tx: "0x9373e913e1f9598a44c25cb21e4c993f07faf144268488533f6d9876c3354e2c",
  },
  {
    label: "같은 티커, 다른 프로젝트",
    trap: "POD지만 솔라나의 Pod Protocol",
    symbol: "POD",
    asset: "Pod Protocol, a Solana project",
    event: "krw_listing",
    start: "2026-10-01T00:00",
    end: "2026-10-04T00:00",
    expected: "no",
    notice: { id: 6635, title: "돌핀(POD) 신규 거래지원 안내 (KRW, BTC, USDT 마켓)" },
    tx: "0x80e6a1ac5b041760438eddc348f6db75afdb86d53db45dd8f9d0ba2f6891c42d",
  },
  {
    label: "만트라 유의종목 '기간 연장'",
    trap: "연장은 신규 지정이 아님",
    symbol: "MANTRA",
    asset: "MANTRA (OM / MANTRA chain)",
    event: "caution",
    start: "2026-09-15T00:00",
    end: "2026-09-25T00:00",
    expected: "no",
    notice: { id: 6589, title: "만트라(MANTRA) 거래 유의 종목 지정 기간 연장 안내" },
    tx: "0x0e9099af21774fc66e74bf8b505d9dad32978bbfae3a3d95328412e4d25e0e33",
  },
  {
    label: "블라스트 유의종목 신규 지정",
    trap: "실제 신규 지정",
    symbol: "BLAST",
    asset: "Blast (BLAST), Ethereum L2",
    event: "caution",
    start: "2026-10-02T00:00",
    end: "2026-10-04T00:00",
    expected: "yes",
    notice: { id: 6637, title: "블라스트(BLAST) 거래 유의 종목 지정 안내" },
    tx: "0xea7c0c8e1500177b3f946659c0b6e0e3b3d72e1c183e1a48949e284340eb62e0",
  },
  {
    label: "아이콘 거래지원 종료",
    trap: "종료일은 10/19, 공지는 9월",
    symbol: "ICX",
    asset: "ICON (ICX)",
    event: "delisting",
    start: "2026-09-15T00:00",
    end: "2026-09-25T00:00",
    expected: "yes",
    notice: { id: 6591, title: "아이콘(ICX) 거래지원 종료 안내 (10/19 15:00)" },
    tx: "0xae435ace9b03d918d12baf20427239d2e01d62c8e259f65b0119c10a54c6cb04",
  },
];
