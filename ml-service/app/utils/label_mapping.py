FINAL_LABELS = ["happy", "sad", "angry", "anxious", "lonely", "confused", "neutral"]
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
    "confusion": "confused",
    "fear": "anxious",
    "nervousness": "anxious",
    "realization": "confused",
    "anger": "angry",
    "annoyance": "angry",
    "disapproval": "angry",
}

MELD_TO_FINAL = {
    "joy": "happy",
    "neutral": "neutral",
    "sadness": "sad",
    "fear": "anxious",
    "anger": "angry",
    "disgust": "angry",
}

RAVDESS_TO_FINAL = {
    "calm": "neutral",
    "happy": "happy",
    "neutral": "neutral",
    "sad": "sad",
    "angry": "angry",
    "fearful": "anxious",
    "surprised": "confused",
    "disgust": "angry",
}

IEMOCAP_TO_FINAL = {
    "hap": "happy",
    "exc": "happy",
    "neu": "neutral",
    "sad": "sad",
    "ang": "angry",
    "fru": "angry",
    "fea": "anxious",
}


def normalize_label(label: str) -> str | None:
    cleaned = label.strip().lower()
    if cleaned == "stressed":
        return "anxious"
    if cleaned == "anger":
        return "angry"
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
