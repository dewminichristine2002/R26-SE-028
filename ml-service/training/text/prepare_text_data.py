import argparse
import json
from pathlib import Path
import sys

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if PROJECT_ROOT.as_posix() not in sys.path:
    sys.path.insert(0, PROJECT_ROOT.as_posix())

from app.utils.label_mapping import (
    map_goemotions_label,
    map_meld_label,
    normalize_label,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Prepare mapped text emotion data for ElderMeds.")
    parser.add_argument("--dataset-type", choices=["goemotions", "meld", "custom"], required=True)
    parser.add_argument("--input", required=True, help="Path to source CSV/JSON/JSONL file")
    parser.add_argument("--output", required=True, help="Path to output JSONL file")
    parser.add_argument("--text-column", default="text")
    parser.add_argument("--label-column", default="label")
    return parser.parse_args()


def load_dataframe(path: Path) -> pd.DataFrame:
    if path.suffix.lower() == ".csv":
        return pd.read_csv(path)
    if path.suffix.lower() == ".json":
        return pd.read_json(path)
    if path.suffix.lower() == ".jsonl":
        return pd.read_json(path, lines=True)
    raise ValueError(f"Unsupported input file: {path}")


def map_label(dataset_type: str, label: str) -> str | None:
    if dataset_type == "goemotions":
        return map_goemotions_label(label)
    if dataset_type == "meld":
        return map_meld_label(label)
    if dataset_type == "custom":
        return normalize_label(label)
    return None


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    frame = load_dataframe(input_path)
    prepared = []

    for _, row in frame.iterrows():
        text = str(row.get(args.text_column, "")).strip()
        label = str(row.get(args.label_column, "")).strip()
        mapped = map_label(args.dataset_type, label)

        if text and mapped:
            prepared.append({"text": text, "label": mapped})

    with output_path.open("w", encoding="utf-8") as handle:
        for item in prepared:
            handle.write(json.dumps(item, ensure_ascii=True) + "\n")

    print(
        json.dumps(
            {
                "datasetType": args.dataset_type,
                "inputRows": int(len(frame)),
                "outputRows": int(len(prepared)),
                "outputFile": output_path.as_posix(),
            }
        )
    )


if __name__ == "__main__":
    main()
