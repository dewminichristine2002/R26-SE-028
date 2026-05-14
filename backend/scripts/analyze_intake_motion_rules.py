from __future__ import annotations

import json
import math
import sys
from typing import Any


def _point(frame: dict[str, Any], path: list[str]) -> dict[str, float] | None:
    current: Any = frame
    for key in path:
        if not isinstance(current, dict) or key not in current:
            return None
        current = current[key]
    if not isinstance(current, dict):
        return None

    try:
        return {
            "x": float(current["x"]),
            "y": float(current["y"]),
        }
    except (KeyError, TypeError, ValueError):
        return None


def _distance(a: dict[str, float], b: dict[str, float]) -> float:
    return math.hypot(a["x"] - b["x"], a["y"] - b["y"])


def _timestamp(frame: dict[str, Any], fallback_index: int) -> float:
    try:
        return float(frame.get("timestampMs", fallback_index * 100))
    except (TypeError, ValueError):
        return fallback_index * 100


def _longest_near_pause_ms(usable: list[dict[str, Any]], near_threshold: float) -> float:
    longest = 0.0
    segment_start = None
    previous_timestamp = None

    for item in usable:
        timestamp = float(item["timestampMs"])
        is_near = item["distanceToMouth"] <= near_threshold
        if not is_near:
            if segment_start is not None and previous_timestamp is not None:
                longest = max(longest, previous_timestamp - segment_start)
            segment_start = None
            previous_timestamp = None
            continue

        if segment_start is None:
            segment_start = timestamp
        elif previous_timestamp is not None and timestamp - previous_timestamp > 450:
            longest = max(longest, previous_timestamp - segment_start)
            segment_start = timestamp

        previous_timestamp = timestamp

    if segment_start is not None and previous_timestamp is not None:
        longest = max(longest, previous_timestamp - segment_start)

    return longest


def analyze_motion(frames: list[dict[str, Any]], swallow_confirmed: bool = False) -> dict[str, Any]:
    usable: list[dict[str, Any]] = []
    for index, frame in enumerate(frames):
        mouth = _point(frame, ["face", "mouthCenter"])
        face_left = _point(frame, ["face", "leftCheek"])
        face_right = _point(frame, ["face", "rightCheek"])
        if not mouth:
            continue

        hand_candidates: list[dict[str, float]] = []
        for key in ("wrist", "indexTip", "thumbTip"):
            point = _point(frame, ["hand", key])
            if point:
                hand_candidates.append(point)

        if not hand_candidates:
            continue

        hand_point = min(hand_candidates, key=lambda point: _distance(point, mouth))

        face_scale = 0.28
        if face_left and face_right:
            face_scale = max(0.08, _distance(face_left, face_right))

        usable.append(
            {
                "timestampMs": _timestamp(frame, index),
                "distanceToMouth": _distance(hand_point, mouth) / face_scale,
            }
        )

    if len(usable) < 6:
        return {
            "status": "uncertain",
            "confidence": 0,
            "handToMouthDetected": False,
            "mouthPauseDetected": False,
            "swallowConfirmed": bool(swallow_confirmed),
            "message": "Not enough hand and mouth landmark frames for rule-based motion analysis.",
            "framesUsed": len(usable),
        }

    distances = [item["distanceToMouth"] for item in usable]
    first_window = distances[: max(2, len(distances) // 4)]
    last_window = distances[-max(2, len(distances) // 4) :]
    start_distance = sum(first_window) / len(first_window)
    closest_index = min(range(len(usable)), key=lambda index: usable[index]["distanceToMouth"])
    closest_distance = distances[closest_index]
    end_distance = sum(last_window) / len(last_window)
    closest_progress = closest_index / max(1, len(usable) - 1)

    near_threshold = 0.8
    approach_delta = 0.5
    approach_ratio = start_distance / max(closest_distance, 0.001)
    hand_to_mouth_detected = (
        start_distance - closest_distance >= approach_delta
        and closest_distance <= near_threshold
        and approach_ratio >= 1.6
        and closest_progress >= 0.18
    )

    pause_ms = _longest_near_pause_ms(usable, near_threshold)
    mouth_pause_detected = pause_ms >= 600

    moved_away_after_pause = end_distance - closest_distance >= 0.25
    completed = hand_to_mouth_detected and mouth_pause_detected and swallow_confirmed
    motion_available = hand_to_mouth_detected and mouth_pause_detected
    confidence_parts = [
        0.45 if hand_to_mouth_detected else max(0.0, min(0.35, (start_distance - closest_distance) / 1.8)),
        0.3 if mouth_pause_detected else max(0.0, min(0.2, pause_ms / 2200)),
        0.15 if moved_away_after_pause else 0,
        0.1 if swallow_confirmed else 0,
    ]
    confidence = round(sum(confidence_parts), 4)

    return {
        "status": "completed" if completed else "needs-confirmation",
        "confidence": confidence,
        "motionAvailable": motion_available,
        "handToMouthDetected": hand_to_mouth_detected,
        "mouthPauseDetected": mouth_pause_detected,
        "movedAwayAfterPause": moved_away_after_pause,
        "swallowConfirmed": bool(swallow_confirmed),
        "message": (
            "Hand-to-mouth motion is available in the video."
            if motion_available
            else "Hand-to-mouth motion was not clearly detected in the video."
        ),
        "framesUsed": len(usable),
        "metrics": {
            "startDistance": round(start_distance, 4),
            "closestDistance": round(closest_distance, 4),
            "endDistance": round(end_distance, 4),
            "closestProgress": round(closest_progress, 4),
            "pauseMs": round(pause_ms, 2),
        },
    }


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        frames = payload.get("frames") or []
        if not isinstance(frames, list):
            raise ValueError("frames must be a list of landmark frames.")
        print(json.dumps(analyze_motion(frames, bool(payload.get("swallowConfirmed")))))
    except Exception as error:
        print(json.dumps({"status": "uncertain", "confidence": 0, "error": str(error)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
