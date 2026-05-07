import argparse
import json
import random
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Split prepared JSONL into train and validation sets.")
    parser.add_argument("--input", required=True)
    parser.add_argument("--train-output", required=True)
    parser.add_argument("--validation-output", required=True)
    parser.add_argument("--validation-ratio", type=float, default=0.2)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    input_path = Path(args.input)
    train_output = Path(args.train_output)
    validation_output = Path(args.validation_output)
    train_output.parent.mkdir(parents=True, exist_ok=True)
    validation_output.parent.mkdir(parents=True, exist_ok=True)

    with input_path.open("r", encoding="utf-8") as handle:
        rows = [json.loads(line) for line in handle if line.strip()]

    random.Random(args.seed).shuffle(rows)
    split_index = max(1, int(len(rows) * (1 - args.validation_ratio)))
    train_rows = rows[:split_index]
    validation_rows = rows[split_index:]

    with train_output.open("w", encoding="utf-8") as handle:
        for row in train_rows:
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")

    with validation_output.open("w", encoding="utf-8") as handle:
        for row in validation_rows:
            handle.write(json.dumps(row, ensure_ascii=True) + "\n")

    print(
        json.dumps(
            {
                "inputRows": len(rows),
                "trainRows": len(train_rows),
                "validationRows": len(validation_rows),
                "trainOutput": train_output.as_posix(),
                "validationOutput": validation_output.as_posix(),
            }
        )
    )


if __name__ == "__main__":
    main()
