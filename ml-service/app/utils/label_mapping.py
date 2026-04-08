FINAL_LABELS = ["happy", "neutral", "sad", "lonely", "stressed"]
LABEL_TO_ID = {label: index for index, label in enumerate(FINAL_LABELS)}
ID_TO_LABEL = {index: label for label, index in LABEL_TO_ID.items()}

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
    "confusion": "stressed",
    "fear": "stressed",
    "nervousness": "stressed",
    "realization": "stressed",
}

MELD_TO_FINAL = {
    "joy": "happy",
    "neutral": "neutral",
    "sadness": "sad",
    "fear": "stressed",
    "anger": "stressed",
    "disgust": "stressed",
}

RAVDESS_TO_FINAL = {
    "calm": "neutral",
    "happy": "happy",
    "neutral": "neutral",
    "sad": "sad",
    "angry": "stressed",
    "fearful": "stressed",
    "surprised": "stressed",
    "disgust": "stressed",
}

IEMOCAP_TO_FINAL = {
    "hap": "happy",
    "exc": "happy",
    "neu": "neutral",
    "sad": "sad",
    "ang": "stressed",
    "fru": "stressed",
    "fea": "stressed",
}


def normalize_label(label: str) -> str | None:
    cleaned = label.strip().lower()
    if cleaned in FINAL_LABELS:
        return cleaned
    return None


def map_goemotions_label(label: str) -> str | None:
    return GOEMOTIONS_TO_FINAL.get(label.strip().lower())


def map_meld_label(label: str) -> str | None:
    return MELD_TO_FINAL.get(label.strip().lower())


def map_ravdess_label(label: str) -> str | None:
    return RAVDESS_TO_FINAL.get(label.strip().lower())


def map_iemocap_label(label: str) -> str | None:
    return IEMOCAP_TO_FINAL.get(label.strip().lower())
