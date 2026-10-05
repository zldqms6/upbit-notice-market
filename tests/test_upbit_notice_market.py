import json
from datetime import datetime, timezone
from pathlib import Path

CONTRACT = "contracts/upbit_notice_market.py"
GEN = 10**18
FIX = Path(__file__).parent / "fixtures"


def ts(s):
    return int(datetime.fromisoformat(s).timestamp())


def iso(t):
    return datetime.fromtimestamp(t, timezone.utc).isoformat()


def notice(nid):
    return json.loads((FIX / f"notice_{nid}.json").read_text(encoding="utf-8"))


def listing(*nids):
    """Page 1 of the trade notice list, newest first, as Upbit returns it."""
    rows = [notice(n)["data"] for n in nids]
    rows = sorted(rows, key=lambda r: r["listed_at"], reverse=True)
    return {"status": 200, "body": json.dumps({"success": True, "data": {"notices": rows}}, ensure_ascii=False)}


def mock_upbit(vm, *nids):
    vm.mock_web(r"announcements\?os=web&page=1&", listing(*nids))
    for n in nids:
        vm.mock_web(rf"announcements/{n}$", {"status": 200, "body": json.dumps(notice(n), ensure_ascii=False)})


def verdicts(*rows):
    return json.dumps({"notices": [{"id": i, "same_asset": s, "event": e} for i, s, e in rows]})


# POD got a KRW listing on 2026-10-02 13:37 KST (notice 6635)
CLOSE = ts("2026-10-01T00:00:00+09:00")
DEADLINE = ts("2026-10-04T00:00:00+09:00")
BEFORE = "2026-09-30T12:00:00+09:00"
AFTER = "2026-10-05T12:00:00+09:00"


def pod_market(vm, deploy, alice, bob, charlie, event="krw_listing", asset="Dolphin (POD), Base network"):
    vm.warp(BEFORE)
    c = deploy(CONTRACT)
    vm.sender = alice
    mid = c.create_market("pod", asset, event, CLOSE, DEADLINE)
    vm.value = 3 * GEN
    c.bet(mid, True)            # alice: 3 GEN on yes
    vm.sender = bob
    vm.value = 1 * GEN
    c.bet(mid, False)           # bob: 1 GEN on no
    vm.sender = charlie
    vm.value = 1 * GEN
    c.bet(mid, True)            # charlie: 1 GEN on yes
    vm.value = 0
    return c, mid


def test_create_market_validation(direct_vm, direct_deploy):
    direct_vm.warp(BEFORE)
    c = direct_deploy(CONTRACT)
    with direct_vm.expect_revert("ticker"):
        c.create_market("PO D", "Dolphin", "krw_listing", CLOSE, DEADLINE)
    with direct_vm.expect_revert("event must be"):
        c.create_market("POD", "Dolphin", "pump", CLOSE, DEADLINE)
    with direct_vm.expect_revert("window"):
        c.create_market("POD", "Dolphin", "krw_listing", ts(BEFORE) - 60, DEADLINE)
    with direct_vm.expect_revert("window"):
        c.create_market("POD", "Dolphin", "krw_listing", CLOSE, CLOSE + 61 * 86400)
    with direct_vm.expect_revert("3-200"):
        c.create_market("POD", "", "krw_listing", CLOSE, DEADLINE)
    assert c.create_market("pod", "Dolphin", "krw_listing", CLOSE, DEADLINE) == 0
    assert c.get_market(0)["symbol"] == "POD"


def test_betting_closes(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, mid = pod_market(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie)
    m = c.get_market(mid)
    assert (m["yes_pool"], m["no_pool"]) == (4 * GEN, 1 * GEN)
    assert c.get_stake(mid, "0x" + bytes(direct_alice).hex()) == {"yes": 3 * GEN, "no": 0}
    direct_vm.warp(iso(CLOSE))
    direct_vm.value = GEN
    with direct_vm.expect_revert("betting is closed"):
        c.bet(mid, True)


def test_real_krw_listing_resolves_yes_and_pays_pro_rata(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, mid = pod_market(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie)
    with direct_vm.expect_revert("not ended"):
        c.resolve(mid)

    direct_vm.warp(AFTER)
    mock_upbit(direct_vm, 6637, 6635, 6618)        # 6618 is older than the window: paging stops there
    direct_vm.mock_llm(r"Upbit, a Korean crypto exchange", verdicts((6635, True, "krw_listing")))
    assert c.resolve(mid) == "yes"

    ev = c.get_market(mid)["evidence"]
    assert [e["id"] for e in ev] == [6635]           # only the POD notice is a candidate
    assert ev[0]["url"].endswith("id=6635")
    assert direct_vm.run_validator() is True

    direct_vm.sender = direct_alice                 # 3/4 of the 5 GEN pot
    assert c.redeem(mid) == 3 * GEN * 5 // 4
    direct_vm.sender = direct_charlie               # 1/4 of the pot
    assert c.redeem(mid) == 1 * GEN * 5 // 4
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("nothing to redeem"):
        c.redeem(mid)


def test_same_ticker_other_project_is_no(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, mid = pod_market(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie,
                        asset="Pod Protocol, a Solana project")
    direct_vm.warp(AFTER)
    mock_upbit(direct_vm, 6637, 6635, 6618)
    direct_vm.mock_llm(r"Upbit, a Korean crypto exchange", verdicts((6635, False, "krw_listing")))
    assert c.resolve(mid) == "no"
    direct_vm.sender = direct_bob                    # bob alone on "no" takes the pot
    assert c.redeem(mid) == 5 * GEN


def test_caution_extension_is_not_a_new_designation(direct_vm, direct_deploy, direct_alice, direct_bob):
    direct_vm.warp("2026-09-10T00:00:00+09:00")
    c = direct_deploy(CONTRACT)
    mid = c.create_market("MANTRA", "MANTRA (OM)", "caution",
                          ts("2026-09-15T00:00:00+09:00"), ts("2026-09-25T00:00:00+09:00"))
    direct_vm.sender, direct_vm.value = direct_alice, GEN
    c.bet(mid, True)
    direct_vm.sender, direct_vm.value = direct_bob, GEN
    c.bet(mid, False)
    direct_vm.value = 0

    direct_vm.warp("2026-09-26T00:00:00+09:00")
    mock_upbit(direct_vm, 6618, 6591, 6589)          # oldest on page 1 is 9/18, so page 2 is read too
    direct_vm.mock_web(r"announcements\?os=web&page=2&",
                       {"status": 200, "body": json.dumps({"success": True, "data": {"notices": []}})})
    direct_vm.mock_llm(r"Upbit, a Korean crypto exchange", verdicts((6589, True, "other")))
    assert c.resolve(mid) == "no"
    assert c.get_market(mid)["evidence"][0]["event"] == "other"


def test_no_candidates_skips_llm(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, mid = pod_market(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie)
    direct_vm.warp(AFTER)
    direct_vm.mock_web(r"announcements\?os=web&page=1&", listing(6637, 6618))
    direct_vm.strict_mocks = True                    # no LLM mock registered: the LLM must not be called
    assert c.resolve(mid) == "no"
    assert c.get_market(mid)["evidence"] == []


def test_one_sided_market_refunds(direct_vm, direct_deploy, direct_alice):
    direct_vm.warp(BEFORE)
    c = direct_deploy(CONTRACT)
    mid = c.create_market("POD", "Dolphin (POD), Base", "krw_listing", CLOSE, DEADLINE)
    direct_vm.sender, direct_vm.value = direct_alice, 2 * GEN
    c.bet(mid, True)
    direct_vm.value = 0
    direct_vm.warp(AFTER)
    mock_upbit(direct_vm, 6637, 6635, 6618)
    direct_vm.mock_llm(r"Upbit, a Korean crypto exchange", verdicts((6635, True, "krw_listing")))
    assert c.resolve(mid) == "refund"
    assert c.redeem(mid) == 2 * GEN


def test_validators_reject_wrong_outcome_or_classification(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, mid = pod_market(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie)
    direct_vm.warp(AFTER)
    mock_upbit(direct_vm, 6637, 6635, 6618)
    direct_vm.mock_llm(r"Upbit, a Korean crypto exchange", verdicts((6635, True, "krw_listing")))
    c.resolve(mid)

    # a leader claiming "no" while the notice is a KRW listing is rejected
    lie = {"candidates": [{"id": 6635, "title": "x", "at": 0, "same_asset": True, "event": "other"}], "outcome": "no"}
    assert direct_vm.run_validator(leader_result=lie) is False
    # a leader that hides the candidate entirely is rejected
    assert direct_vm.run_validator(leader_result={"candidates": [], "outcome": "no"}) is False

    # a validator whose model reads the notice differently disagrees
    direct_vm.clear_mocks()
    mock_upbit(direct_vm, 6637, 6635, 6618)
    direct_vm.mock_llm(r"Upbit, a Korean crypto exchange", verdicts((6635, False, "krw_listing")))
    assert direct_vm.run_validator() is False


def test_malformed_model_output_is_an_llm_error(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, mid = pod_market(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie)
    direct_vm.warp(AFTER)
    mock_upbit(direct_vm, 6637, 6635, 6618)
    direct_vm.mock_llm(r"Upbit, a Korean crypto exchange", json.dumps({"notices": [{"id": 6635, "event": "listing"}]}))
    with direct_vm.expect_revert("[LLM_ERROR]"):
        c.resolve(mid)


def test_window_older_than_listing_fails_safely(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, mid = pod_market(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie)
    direct_vm.warp(AFTER)
    newer = {"status": 200, "body": json.dumps({"success": True, "data": {"notices": [notice(6637)["data"]]}},
                                               ensure_ascii=False)}
    direct_vm.mock_web(r"announcements\?os=web&page=\d+&", newer)   # every page newer than the window
    with direct_vm.expect_revert("older than the notices"):
        c.resolve(mid)


def test_void_after_grace_refunds_everyone(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    c, mid = pod_market(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie)
    direct_vm.warp(iso(DEADLINE + 86400))
    with direct_vm.expect_revert("21 days"):
        c.void(mid)
    direct_vm.warp(iso(DEADLINE + 21 * 86400))
    c.void(mid)
    direct_vm.sender = direct_bob
    assert c.redeem(mid) == 1 * GEN
    with direct_vm.expect_revert("already settled"):
        c.resolve(mid)


def test_preview_runs_resolution_on_a_past_window(direct_vm, direct_deploy, direct_alice):
    direct_vm.warp(AFTER)
    c = direct_deploy(CONTRACT)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("past window"):
        c.preview("POD", "Dolphin (POD), Base", "krw_listing", CLOSE, ts(AFTER) + 3600)
    mock_upbit(direct_vm, 6637, 6635, 6618)
    direct_vm.mock_llm(r"Upbit, a Korean crypto exchange", verdicts((6635, True, "krw_listing")))
    assert c.preview("POD", "Dolphin (POD), Base", "krw_listing", CLOSE, DEADLINE)["outcome"] == "yes"
    saved = c.get_preview("0x" + bytes(direct_alice).hex())
    assert saved["symbol"] == "POD" and saved["candidates"][0]["id"] == 6635
    assert c.get_market_count() == 0                 # no market was touched
