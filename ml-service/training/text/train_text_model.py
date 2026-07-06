import argparse
import json
from pathlib import Path
import sys

import numpy as np
from datasets import load_dataset
from sklearn.metrics import accuracy_score, f1_score
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
    DataCollatorWithPadding,
    Trainer,
    TrainingArguments,
)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if PROJECT_ROOT.as_posix() not in sys.path:
    sys.path.insert(0, PROJECT_ROOT.as_posix())

from app.utils.label_mapping import FINAL_LABELS, LABEL_TO_ID


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train ElderMeds text emotion classifier.")
    parser.add_argument("--train-file", required=True)
    parser.add_argument("--validation-file", required=True)
    parser.add_argument("--model-name", default="distilroberta-base")
    parser.add_argument("--output-dir", default="artifacts/text-model")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=8)
    return parser.parse_args()


def tokenize_dataset(dataset, tokenizer):
    def tokenize(batch):
        return tokenizer(batch["text"], truncation=True, max_length=256)

    return dataset.map(tokenize, batched=True)


def encode_labels(example):
    example["label"] = LABEL_TO_ID[example["label"]]
    return example


def compute_metrics(eval_pred):
    logits, labels = eval_pred
    predictions = np.argmax(logits, axis=-1)
    return {
        "accuracy": accuracy_score(labels, predictions),
        "macro_f1": f1_score(labels, predictions, average="macro"),
        "weighted_f1": f1_score(labels, predictions, average="weighted"),
    }


def main() -> None:
    args = parse_args()
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    dataset = load_dataset(
        "json",
        data_files={
            "train": args.train_file,
            "validation": args.validation_file,
        },
    )

    dataset = dataset.map(encode_labels)
    tokenizer = AutoTokenizer.from_pretrained(args.model_name)
    tokenized = tokenize_dataset(dataset, tokenizer)

    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=len(FINAL_LABELS),
        id2label={index: label for index, label in enumerate(FINAL_LABELS)},
        label2id=LABEL_TO_ID,
    )

    training_args = TrainingArguments(
        output_dir=output_dir.as_posix(),
        learning_rate=2e-5,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        num_train_epochs=args.epochs,
        weight_decay=0.01,
        eval_strategy="epoch",
        save_strategy="epoch",
        load_best_model_at_end=True,
        metric_for_best_model="macro_f1",
        greater_is_better=True,
        logging_dir=(output_dir / "logs").as_posix(),
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized["train"],
        eval_dataset=tokenized["validation"],
        tokenizer=tokenizer,
        data_collator=DataCollatorWithPadding(tokenizer=tokenizer),
        compute_metrics=compute_metrics,
    )

    trainer.train()
    metrics = trainer.evaluate()
    trainer.save_model(output_dir.as_posix())
    tokenizer.save_pretrained(output_dir.as_posix())

    metadata = {
        "modelName": args.model_name,
        "labels": FINAL_LABELS,
        "metrics": metrics,
    }

    with (output_dir / "training-metadata.json").open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, indent=2)

    print(json.dumps(metadata))


if __name__ == "__main__":
    main()
