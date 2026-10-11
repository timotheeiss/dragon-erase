import json
from collections import Counter

from erasure.models import Label, Platform
from erasure.seed import build


def test_seed_shape(tmp_path):
    items = build(tmp_path)
    assert len(items) == 12
    assert {r.platform for r, _ in items} == set(Platform)
    labels = Counter(e.label for _, e in items)
    assert labels[Label.RETAIN] == 1
    assert labels[Label.NO_ACTION] == 2  # unrelated Slack msg + Sara Chen file


def test_expected_labels_file_matches_records(tmp_path):
    items = build(tmp_path)
    expected = json.loads((tmp_path / "expected_labels.json").read_text())
    assert {e["record_id"] for e in expected} == {r.id for r, _ in items}
    for r, _ in items:
        assert (tmp_path / r.platform.value / f"{r.id}.json").exists()
        if r.file:
            assert (tmp_path / r.file).exists()


def test_decoy_never_mentions_subject(tmp_path):
    items = build(tmp_path)
    decoy = next(r for r, _ in items if r.id == "drive-003")
    assert "Sarah Chen" not in json.dumps(decoy.metadata)
