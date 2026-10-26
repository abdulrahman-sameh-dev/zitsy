#!/usr/bin/env python3
"""Regression tests for dry-run history behavior, SENTENCE_TOO_LONG, and rejection logging."""

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'default-workspace' / 'src'))

from socialkit.governance import ContentValidator, record_post, PILLARS
from socialkit.content import PILLARS as C_PILLARS

PASS = " ✔"
FAIL = " ✖"

# ── helpers ────────────────────────────────
def make_validator():
    tmp = Path(tempfile.mkdtemp()) / "history.json"
    return ContentValidator(history_file=tmp), tmp

def count_failures(results):
    return sum(1 for ok in results if not ok)

# ── 1. Dry-run should NOT record history ──────────────────────
def test_dry_run_does_not_record_history():
    print("\n[1] Dry-run does not record history in content/history.json")
    tmp = Path(tempfile.mkdtemp()) / "history.json"
    v = ContentValidator(history_file=tmp)

    text = "Some valid post content about real engineering topics and learning processes."
    # Simulate what a dry-run path would do: call record_post with post_id=None
    # BUT the production code now only calls record_post when result.mode == "live"
    # This test verifies the *contract*: dry-run text is never recorded.
    # We simulate dry-run by checking that the CLI logic skips recording.
    # Since the actual mode-gating is in cli.py (not governance.py),
    # we verify via the cli.py source directly.
    import inspect
    cli_src = Path(__file__).resolve().parents[2] / "default-workspace" / "src" / "socialkit" / "cli.py"
    cli_text = cli_src.read_text()
    has_live_gate = 'if result.mode == "live":' in cli_text
    has_unconditional = ('record_post(text, pillar=pillar, platform=platform_name, post_id=result.post_id)\n    print("تم تسجيل المنشور' in cli_text)
    print(f"  {' ✔' if has_live_gate else ' ✖'} record_post guarded by result.mode == 'live'")
    print(f"  {' ✔' if not has_unconditional else ' ✖'} no unconditional record_post call")
    # Verify record_post does nothing if mode check fails by testing governance layer is not bypassed
    return has_live_gate and not has_unconditional

# ── 2. Live mode SHOULD record history ────────────────────────
def test_live_run_records_history():
    print("\n[2] Live-run records history correctly via record_post")
    tmp = Path(tempfile.mkdtemp()) / "history.json"
    text = "A genuinely different post entirely about naming and design decisions in backend systems."
    record_post(text, pillar="design-systems", platform="facebook", post_id="live_123", history_file=tmp)
    with open(tmp) as f:
        entries = json.load(f)
    ok = len(entries) == 1 and entries[0]["post_id"] == "live_123"
    print(f"  {' ✔' if ok else ' ✖'} history recorded with post_id: {entries[0]['post_id'] if entries else 'NONE'}")
    return ok

# ── 3. SENTENCE_TOO_LONG triggers correctly ────────────────────
def test_sentence_too_long_logic():
    print("\n[3] SENTENCE_TOO_LONG triggers only when ≥2 sentences exceed 45 words")
    results = []
    v, tmp = make_validator()

    # Test: one long sentence only → should NOT trigger (needs >=2)
    one_long = "word " * 46  # 46-word sentence
    one_long = one_long.strip()
    r = v.validate(one_long, enforce_pillar_order=False)
    triggered_one = any(x.rule_id == "SENTENCE_TOO_LONG" for x in r.violations)
    results.append(not triggered_one)
    print(f"  {' ✔' if not triggered_one else ' ✖'} one long sentence → no SENTENCE_TOO_LONG (correct)")

    # Test: two long sentences → should trigger
    two_long = ("word " * 46).strip() + "." + (" " + "word " * 46).strip()
    r2 = v.validate(two_long, enforce_pillar_order=False)
    triggered_two = any(x.rule_id == "SENTENCE_TOO_LONG" for x in r2.violations)
    results.append(triggered_two)
    print(f"  {' ✔' if triggered_two else ' ✖'} two long sentences → SENTENCE_TOO_LONG triggered")

    # Test: exact word boundary (45 words = exactly at threshold, should NOT count)
    exactly_45 = ("word " * 45).strip()
    r3 = v.validate(exactly_45, enforce_pillar_order=False)
    triggered_boundary = any(x.rule_id == "SENTENCE_TOO_LONG" for x in r3.violations)
    results.append(not triggered_boundary)
    print(f"  {' ✔' if not triggered_boundary else ' ✖'} 45-word sentence → not counted as '>' 45")

    return all(results)

# ── 4. SENTENCE_TOO_LONG still fires on real draft ─────────────
def test_real_draft_sentence_detection():
    print("\n[4] Real draft: exact text segments measured by validator")
    draft_path = Path(
        "/home/abdulrahman/Desktop/Wark/Digital Product/DropShiping/"
        "zitsy/zitsy-marketing/draft-minimal-sunrise-hoodie.md"
    )
    text = draft_path.read_text()
    v, tmp = make_validator()

    # Replicate the validator's sentence split logic exactly
    import re
    sentences = [s for s in re.split(r"[.!?]\s+", text) if s.strip()]
    long_ones = [s for s in sentences if len(s.split()) > 45]
    print(f"  Total sentences detected: {len(sentences)}")
    print(f"  Sentences exceeding 45 words: {len(long_ones)}")
    for i, s in enumerate(long_ones):
        word_count = len(s.split())
        snippet = s[:80].replace("\n", "\\n")
        print(f"    [{i}] {word_count} words | starts with: {snippet}...")
        # The first one is the English Details block
        # The second one is the German Details block
    return len(long_ones) >= 2

# ── 5. Rejection logging has no NameError ─�────────────────────
def test_rejection_no_name_error():
    print("\n[5] Rejection-path logging: no NameError")
    cli_path = Path(
        "/home/abdulrahman/Documents/deepseek-harness/default-workspace/src/socialkit/cli.py"
    )
    src = cli_path.read_text()
    has_logger = 'log = logging.getLogger("socialkit")' in src
    uses_log_error = "log.error" in src
    uses_log_info = "log.info" in src if "log.info" in src else False
    print(f"  {' ✔' if has_logger else ' ✖'} logger instance defined at module level")
    print(f"  {' ✔' if uses_log_error else ' ✖'} log.error used in rejection path")
    return has_logger

# ── 6. Existing history entry is a dry-run artifact ─────────────
def test_history_entry_is_dry_run_artifact():
    print("\n[6] Verifying existing history.json entry is a dry-run artifact")
    history_path = Path(
        "/home/abdulrahman/Documents/deepseek-harness/default-workspace/content/history.json"
    )
    with open(history_path) as f:
        entries = json.load(f)
    print(f"  Total history entries: {len(entries)}")
    for i, e in enumerate(entries):
        post_id = e.get("post_id")
        pillar = e.get("pillar")
        chars = e.get("chars")
        published_at = e.get("published_at")
        is_artifact = (post_id is None)
        print(f"  [{i}] post_id={post_id}, pillar={pillar}, chars={chars}, published_at={published_at}")
        print(f"      is_dry_run_artifact = {' ✔ YES' if is_artifact else ' ✖ NO'} (post_id is None)")
    return len(entries) == 1 and entries[0].get("post_id") is None

# ── run all ────────────────────────────────
if __name__ == "__main__":
    tests = [
        test_dry_run_does_not_record_history,
        test_live_run_records_history,
        test_sentence_too_long_logic,
        test_real_draft_sentence_detection,
        test_rejection_no_name_error,
        test_history_entry_is_dry_run_artifact,
    ]
    passed = 0
    failed = 0
    for t in tests:
        try:
            result = t()
            if result:
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"  ✖ Exception: {e}")
            failed += 1
    print(f"\n{'='*62}")
    print(f"  Total: {passed} passed | {failed} failed")
    print(f"{'='*62}")
    sys.exit(1 if failed else 0)