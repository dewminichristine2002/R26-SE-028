from pathlib import Path

import librosa
import numpy as np


def extract_audio_features(audio_path: str) -> dict[str, float]:
    path = Path(audio_path)
    if not path.exists():
        raise FileNotFoundError(f"Audio file not found: {audio_path}")

    signal, sample_rate = librosa.load(path.as_posix(), sr=16000)
    mfcc = librosa.feature.mfcc(y=signal, sr=sample_rate, n_mfcc=13)
    rms = librosa.feature.rms(y=signal)
    spectral_centroid = librosa.feature.spectral_centroid(y=signal, sr=sample_rate)

    return {
        "mfcc_mean": float(np.mean(mfcc)),
        "mfcc_std": float(np.std(mfcc)),
        "rms_mean": float(np.mean(rms)),
        "spectral_centroid_mean": float(np.mean(spectral_centroid)),
    }
