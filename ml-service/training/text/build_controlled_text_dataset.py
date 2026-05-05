import argparse
import ast
import json
import math
import random
import re
from collections import Counter, defaultdict
from pathlib import Path
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if PROJECT_ROOT.as_posix() not in sys.path:
    sys.path.insert(0, PROJECT_ROOT.as_posix())

from app.utils.label_mapping import FINAL_LABELS

KAGGLE_LABEL_MAP = {
    "0": "sad",
    "1": "happy",
    "2": "happy",
    "3": "angry",
    "4": "anxious",
}

GOEMOTIONS_INDEX_TO_LABEL = {
    0: "admiration",
    1: "amusement",
    2: "anger",
    3: "annoyance",
    4: "approval",
    5: "caring",
    6: "confusion",
    7: "curiosity",
    8: "desire",
    9: "disappointment",
    10: "disapproval",
    11: "disgust",
    12: "embarrassment",
    13: "excitement",
    14: "fear",
    15: "gratitude",
    16: "grief",
    17: "joy",
    18: "love",
    19: "nervousness",
    20: "optimism",
    21: "pride",
    22: "realization",
    23: "relief",
    24: "remorse",
    25: "sadness",
    26: "surprise",
    27: "neutral",
}

GOEMOTIONS_TO_FINAL = {
    "admiration": "happy",
    "amusement": "happy",
    "approval": "happy",
    "caring": "happy",
    "gratitude": "happy",
    "joy": "happy",
    "love": "happy",
    "optimism": "happy",
    "pride": "happy",
    "relief": "happy",
    "neutral": "neutral",
    "disappointment": "sad",
    "grief": "sad",
    "remorse": "sad",
    "sadness": "sad",
    "confusion": "confused",
    "fear": "anxious",
    "nervousness": "anxious",
    "realization": "confused",
    "anger": "angry",
    "annoyance": "angry",
    "disapproval": "angry",
}

LONELY_KEYWORDS = [
    "alone",
    "lonely",
    "isolated",
    "left out",
    "no one",
    "nobody",
    "miss someone",
    "wish someone would talk",
    "empty house",
]

URL_PATTERN = re.compile(r"https?://|www\.", re.IGNORECASE)
SPACE_PATTERN = re.compile(r"\s+")
NON_WORD_PATTERN = re.compile(r"[^A-Za-z0-9\s.,!?'\-]")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a controlled 7-label dataset from Kaggle + GoEmotions without training."
    )
    parser.add_argument("--kaggle-input", required=True, help="Path to Kaggle CSV/JSON/JSONL source file")
    parser.add_argument(
        "--goemotions-input",
        required=True,
        nargs="+",
        help="One or more GoEmotions CSV/JSON/JSONL source files",
    )
    parser.add_argument("--output-csv", default="data/processed/review/controlled_text_dataset.csv")
    parser.add_argument("--output-jsonl", default="data/processed/review/controlled_text_dataset.jsonl")
    parser.add_argument("--summary-output", default="data/processed/review/controlled_text_dataset_summary.json")
    parser.add_argument("--samples-output", default="data/processed/review/controlled_text_dataset_samples.json")
    parser.add_argument("--kaggle-text-column", default="text")
    parser.add_argument("--kaggle-label-column", default="label")
    parser.add_argument("--goemotions-text-column", default="text")
    parser.add_argument("--goemotions-label-column", default="labels")
    parser.add_argument("--max-per-label", type=int, default=2500)
    parser.add_argument("--min-text-length", type=int, default=5)
    parser.add_argument("--max-text-length", type=int, default=280)
    parser.add_argument("--sample-preview-per-label", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def load_dataframe(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Input file not found: {path}")
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path)
    if path.suffix.lower() == ".json":
        return pd.read_json(path)
    if path.suffix.lower() == ".jsonl":
        return pd.read_json(path, lines=True)
    raise ValueError(f"Unsupported input file: {path}")


def normalize_text(text: str) -> str:
    return SPACE_PATTERN.sub(" ", str(text or "").strip())


def text_has_lonely_signal(text: str) -> bool:
    normalized = normalize_text(text).lower()
    return any(keyword in normalized for keyword in LONELY_KEYWORDS)


def passes_quality_filters(text: str, min_text_length: int, max_text_length: int) -> tuple[bool, str | None]:
    normalized = normalize_text(text)
    lowered = normalized.lower()

    if len(normalized) < min_text_length:
        return False, "too_short"
    if len(normalized) > max_text_length:
        return False, "too_long"
    if URL_PATTERN.search(lowered):
        return False, "contains_url"
    if normalized.count("@") > 2 or normalized.count("#") > 3:
        return False, "social_noise"
    if NON_WORD_PATTERN.search(normalized):
        return False, "non_word_noise"
    alpha_ratio = sum(ch.isalpha() for ch in normalized) / max(len(normalized), 1)
    if alpha_ratio < 0.45:
        return False, "low_alpha_ratio"
    return True, None


def parse_goemotions_raw_labels(raw_label: object) -> list[str]:
    if isinstance(raw_label, list):
        values = raw_label
    else:
        if pd.isna(raw_label):
            return []

        raw_str = str(raw_label).strip()
        if not raw_str:
            return []

        if raw_str.startswith("[") and raw_str.endswith("]"):
            try:
                parsed = ast.literal_eval(raw_str)
                values = parsed if isinstance(parsed, list) else [parsed]
            except Exception:
                values = [part.strip() for part in raw_str.strip("[]").split(",") if part.strip()]
        elif "|" in raw_str:
            values = [part.strip() for part in raw_str.split("|") if part.strip()]
        elif "," in raw_str:
            values = [part.strip() for part in raw_str.split(",") if part.strip()]
        else:
            values = [raw_str]

    labels = []
    for value in values:
        if isinstance(value, int) or (isinstance(value, str) and value.strip().isdigit()):
            label_name = GOEMOTIONS_INDEX_TO_LABEL.get(int(value))
            if label_name:
                labels.append(label_name)
        else:
            labels.append(str(value).strip().lower())
    return labels


def extract_goemotions_raw_label(row: pd.Series, label_column: str) -> object:
    if label_column in row.index:
        return row.get(label_column)

    active_labels = []
    for label in GOEMOTIONS_INDEX_TO_LABEL.values():
        value = row.get(label)
        if pd.isna(value):
            continue
        if value is True or str(value).strip() in {"1", "1.0", "true", "True"}:
            active_labels.append(label)
    return active_labels


def map_goemotions_to_final(text: str, raw_label: object) -> tuple[str | None, str | None]:
    raw_labels = parse_goemotions_raw_labels(raw_label)
    if not raw_labels:
        return None, "empty_label"

    mapped_labels = []
    for raw in raw_labels:
        mapped = GOEMOTIONS_TO_FINAL.get(raw)
        if mapped:
            mapped_labels.append(mapped)

    if text_has_lonely_signal(text):
        return "lonely", None

    unique_mapped = sorted(set(mapped_labels))
    if len(unique_mapped) != 1:
        return None, "ambiguous_multilabel"

    return unique_mapped[0], None


def map_kaggle_to_final(text: str, raw_label: object) -> tuple[str | None, str | None]:
    if pd.isna(raw_label):
        return None, "empty_label"

    label_key = str(raw_label).strip().lower()
    if text_has_lonely_signal(text):
        return "lonely", None

    if label_key in KAGGLE_LABEL_MAP:
        return KAGGLE_LABEL_MAP[label_key], None

    string_map = {
        "sadness": "sad",
        "sad": "sad",
        "joy": "happy",
        "happy": "happy",
        "happiness": "happy",
        "love": "happy",
        "anger": "angry",
        "angry": "angry",
        "fear": "anxious",
        "worry": "anxious",
        "anxiety": "anxious",
        "confusion": "confused",
        "confused": "confused",
        "neutral": "neutral",
    }
    mapped = string_map.get(label_key)
    if not mapped:
        return None, "unmapped_label"
    return mapped, None


def build_rows_from_source(
    frame: pd.DataFrame,
    source: str,
    text_column: str,
    label_column: str,
    min_text_length: int,
    max_text_length: int,
) -> tuple[list[dict], Counter]:
    dropped = Counter()
    rows = []

    for _, row in frame.iterrows():
        if source == "goemotions" and str(row.get("example_very_unclear", "")).strip().lower() == "true":
            dropped["example_very_unclear"] += 1
            continue

        text = normalize_text(row.get(text_column, ""))
        if not text:
            dropped["empty_text"] += 1
            continue

        passes, reason = passes_quality_filters(text, min_text_length, max_text_length)
        if not passes:
            dropped[reason] += 1
            continue

        if source == "kaggle":
            mapped_label, drop_reason = map_kaggle_to_final(text, row.get(label_column))
        else:
            raw_label = extract_goemotions_raw_label(row, label_column)
            mapped_label, drop_reason = map_goemotions_to_final(text, raw_label)

        if not mapped_label:
            dropped[drop_reason or "unmapped_label"] += 1
            continue

        rows.append(
            {
                "text": text,
                "label": mapped_label,
                "source": source,
            }
        )

    return rows, dropped


def deduplicate_rows(rows: list[dict]) -> tuple[list[dict], int]:
    seen = set()
    deduped = []
    dropped = 0

    for row in rows:
        key = normalize_text(row["text"]).lower()
        if key in seen:
            dropped += 1
            continue
        seen.add(key)
        deduped.append(row)

    return deduped, dropped


def compute_target_count(label_counts: Counter, max_per_label: int) -> int:
    nonzero_counts = sorted(count for count in label_counts.values() if count > 0)
    if not nonzero_counts:
        return 0

    median_count = int(nonzero_counts[len(nonzero_counts) // 2])
    return min(max_per_label, median_count)


def balance_rows(rows: list[dict], max_per_label: int, seed: int) -> tuple[list[dict], dict]:
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["label"]].append(row)

    randomizer = random.Random(seed)
    label_counts = Counter({label: len(grouped[label]) for label in FINAL_LABELS})
    target_count = compute_target_count(label_counts, max_per_label)
    balanced = []
    balance_report = {}

    for label in FINAL_LABELS:
        items = grouped.get(label, [])
        randomizer.shuffle(items)

        if target_count == 0:
            selected = items
        elif len(items) > target_count:
            selected = items[:target_count]
        else:
            selected = items

        balanced.extend(selected)
        balance_report[label] = {
            "before": len(items),
            "after": len(selected),
            "target": target_count,
        }

    randomizer.shuffle(balanced)
    return balanced, balance_report


def write_outputs(
    rows: list[dict],
    output_csv: Path,
    output_jsonl: Path,
) -> None:
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    output_jsonl.parent.mkdir(parents=True, exist_ok=True)

    frame = pd.DataFrame(rows)
    frame.to_csv(output_csv, index=False)

    with output_jsonl.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")


def build_preview_samples(rows: list[dict], per_label: int) -> dict[str, list[dict]]:
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["label"]].append(row)

    samples = {}
    for label in FINAL_LABELS:
        samples[label] = grouped.get(label, [])[:per_label]
    return samples


def resolve_default_output(path_value: str) -> Path:
    path = Path(path_value)
    if path.is_absolute():
        return path
    return PROJECT_ROOT / path


def main() -> None:
    args = parse_args()

    kaggle_path = Path(args.kaggle_input)
    goemotions_paths = [Path(path) for path in args.goemotions_input]
    output_csv = resolve_default_output(args.output_csv)
    output_jsonl = resolve_default_output(args.output_jsonl)
    summary_output = resolve_default_output(args.summary_output)
    samples_output = resolve_default_output(args.samples_output)

    kaggle_frame = load_dataframe(kaggle_path)
    goemotions_frames = [load_dataframe(path) for path in goemotions_paths]
    goemotions_frame = pd.concat(goemotions_frames, ignore_index=True)

    kaggle_rows, kaggle_dropped = build_rows_from_source(
        kaggle_frame,
        source="kaggle",
        text_column=args.kaggle_text_column,
        label_column=args.kaggle_label_column,
        min_text_length=args.min_text_length,
        max_text_length=args.max_text_length,
    )
    goemotions_rows, goemotions_dropped = build_rows_from_source(
        goemotions_frame,
        source="goemotions",
        text_column=args.goemotions_text_column,
        label_column=args.goemotions_label_column,
        min_text_length=args.min_text_length,
        max_text_length=args.max_text_length,
    )

    combined_rows = kaggle_rows + goemotions_rows
    deduped_rows, duplicate_drop_count = deduplicate_rows(combined_rows)
    balanced_rows, balance_report = balance_rows(deduped_rows, args.max_per_label, args.seed)

    write_outputs(balanced_rows, output_csv, output_jsonl)

    summary_output.parent.mkdir(parents=True, exist_ok=True)
    samples_output.parent.mkdir(parents=True, exist_ok=True)

    final_counts = Counter(row["label"] for row in balanced_rows)
    source_counts = Counter(row["source"] for row in balanced_rows)

    summary = {
        "labels": FINAL_LABELS,
        "inputs": {
            "kaggleInput": kaggle_path.as_posix(),
            "goemotionsInputs": [path.as_posix() for path in goemotions_paths],
        },
        "rawRows": {
            "kaggle": int(len(kaggle_frame)),
            "goemotions": int(len(goemotions_frame)),
        },
        "acceptedRowsBeforeDedup": {
            "kaggle": len(kaggle_rows),
            "goemotions": len(goemotions_rows),
        },
        "droppedRows": {
            "kaggle": dict(kaggle_dropped),
            "goemotions": dict(goemotions_dropped),
            "duplicates": duplicate_drop_count,
        },
        "balanceReport": balance_report,
        "finalCountsByLabel": {label: final_counts.get(label, 0) for label in FINAL_LABELS},
        "finalCountsBySource": dict(source_counts),
        "outputCsv": output_csv.as_posix(),
        "outputJsonl": output_jsonl.as_posix(),
        "notes": [
            "Only seven output labels are used: happy, sad, angry, anxious, lonely, confused, neutral.",
            "Lonely is derived only from strict loneliness lexical signals in source text.",
            "Ambiguous GoEmotions multi-label rows are dropped instead of force-mapped.",
            "Surprise and unrelated/noisy categories are excluded.",
            "This script prepares the review dataset only. It does not train a model.",
        ],
    }

    samples = build_preview_samples(balanced_rows, args.sample_preview_per_label)

    with summary_output.open("w", encoding="utf-8") as handle:
        json.dump(summary, handle, indent=2)

    with samples_output.open("w", encoding="utf-8") as handle:
        json.dump(samples, handle, indent=2)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
