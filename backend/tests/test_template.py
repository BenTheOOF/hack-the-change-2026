import json
import sys
from math import cos, pi
from pathlib import Path

import pytest

from app.physio import PoseFrame
from app.template import Segmenter, TemplateModel, classify_template

ML = Path(__file__).resolve().parents[2] / "ml"
sys.path.insert(0, str(ML / "fixtures"))
from make_demo_curl import curl_frame  # noqa: E402

FIXTURE = json.loads((ML / "fixtures" / "demo_curl.json").read_text())
EXPECTED = json.loads((ML / "fixtures" / "demo_curl.expected.json").read_text())
MODEL = TemplateModel.model_validate(EXPECTED)


def rep(peak: float, ms: int = 2400, rest: float = 165, lead: int = 3, shape=None, one_arm: bool = False,
        visibility: float = 0.9) -> list[PoseFrame]:
    """A curl rep at 10 fps, cut out of a stream by the same segmenter the app uses."""
    steps = ms // 100
    angles = [rest] * lead
    for i in range(steps + 1):
        x = i / steps
        w = shape(x) if shape else 0.5 * (1 - cos(2 * pi * x))
        angles.append(rest - (rest - peak) * w)
    angles += [rest] * 5
    segmenter = Segmenter(MODEL.spec)
    for i, a in enumerate(angles):
        frame = curl_frame(a, i * 100, visibility)
        if one_arm:
            frame["points"][16] = curl_frame(rest, 0, visibility)["points"][16]
        done = segmenter.push(PoseFrame.model_validate(frame))
        if done:
            return done
    raise AssertionError("no rep segmented")


def test_template_routes_reps_like_the_browser() -> None:
    assert classify_template(MODEL, rep(50)).label == "correct"
    assert classify_template(MODEL, rep(50, lead=25)).label == "correct"  # lead-in is ignored
    assert classify_template(MODEL, rep(115)).error_type == "range_of_motion"
    assert classify_template(MODEL, rep(50, one_arm=True)).error_type == "range_of_motion"
    # Drop straight to the bottom, hold, then return: right range, wrong shape.
    jerky = rep(50, ms=3000, shape=lambda x: 1.0 if 0.05 < x < 0.95 else 0.0)
    assert classify_template(MODEL, jerky).error_type == "movement_pattern"
    assert classify_template(MODEL, rep(50, ms=800)).error_type == "tempo"
    assert classify_template(MODEL, rep(50, visibility=0.55)).label == "inconclusive"


def test_python_fitter_matches_the_shared_fixture() -> None:
    pytest.importorskip("numpy")
    sys.path.insert(0, str(ML))
    from fit_template import FitError, fit_template

    model = fit_template([PoseFrame.model_validate(f) for f in FIXTURE["frames"]], FIXTURE["view"])
    got = model.model_dump(by_alias=True)
    for key in ("combine", "direction"):
        assert got["spec"][key] == EXPECTED["spec"][key]
    for key in ("rest", "move", "bandStart", "bandEnd"):
        assert got["spec"][key] == pytest.approx(EXPECTED["spec"][key], abs=0.5)
    assert got["active"] == EXPECTED["active"] and got["demoReps"] == 4
    with pytest.raises(FitError):
        fit_template([PoseFrame.model_validate(curl_frame(165, i * 100)) for i in range(40)], "front")
