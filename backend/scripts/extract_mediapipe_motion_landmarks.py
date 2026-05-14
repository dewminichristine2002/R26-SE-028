from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract MediaPipe hand/mouth landmarks from an intake video.")
    parser.add_argument("--video", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--frame-step", type=int, default=3)
    args = parser.parse_args()

    try:
        import cv2
    except Exception as error:
        raise RuntimeError("Install OpenCV first: pip install opencv-contrib-python") from error

    try:
        import mediapipe as mp
    except Exception:
        mp = None
    if mp is not None and not hasattr(mp, "solutions"):
        mp = None

    if not args.video.exists():
        raise FileNotFoundError(args.video)

    capture = cv2.VideoCapture(str(args.video))
    fps = capture.get(cv2.CAP_PROP_FPS) or 30
    frames = []
    frame_index = 0

    if mp is None:
        previous_gray = None
        last_face_box = None
        face_frame_count = 0
        hand_frame_count = 0
        face_cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        face_cascade = cv2.CascadeClassifier(face_cascade_path)

        def _detect_face(gray_frame):
            faces = face_cascade.detectMultiScale(gray_frame, scaleFactor=1.1, minNeighbors=5, minSize=(45, 45))
            if len(faces) == 0:
                return None
            return max(faces, key=lambda item: item[2] * item[3])

        def _face_landmarks(face_box, width, height):
            if face_box is None:
                return {
                    "mouthCenter": {"x": 0.5, "y": 0.42},
                    "leftCheek": {"x": 0.33, "y": 0.42},
                    "rightCheek": {"x": 0.67, "y": 0.42},
                }

            x, y, w, h = [float(value) for value in face_box]
            mouth_x = x + (w * 0.5)
            mouth_y = y + (h * 0.68)
            cheek_y = y + (h * 0.55)
            return {
                "mouthCenter": {"x": mouth_x / width, "y": mouth_y / height},
                "leftCheek": {"x": (x + w * 0.22) / width, "y": cheek_y / height},
                "rightCheek": {"x": (x + w * 0.78) / width, "y": cheek_y / height},
            }

        try:
            while True:
                ok, frame = capture.read()
                if not ok:
                    break
                if frame_index % max(1, args.frame_step) != 0:
                    frame_index += 1
                    continue

                height, width = frame.shape[:2]
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                gray = cv2.GaussianBlur(gray, (9, 9), 0)
                face_box = _detect_face(gray)
                if face_box is not None:
                    last_face_box = face_box
                    face_frame_count += 1

                output_frame = {
                    "timestampMs": round((frame_index / fps) * 1000, 2),
                }
                active_face_box = face_box if face_box is not None else last_face_box
                output_frame["face"] = _face_landmarks(active_face_box, width, height)

                if previous_gray is not None:
                    delta = cv2.absdiff(previous_gray, gray)
                    _, threshold = cv2.threshold(delta, 22, 255, cv2.THRESH_BINARY)
                    threshold = cv2.dilate(threshold, None, iterations=2)

                    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
                    skin_mask = cv2.inRange(hsv, (0, 25, 45), (25, 210, 255)) | cv2.inRange(hsv, (160, 25, 45), (180, 210, 255))
                    candidate_mask = cv2.bitwise_and(threshold, skin_mask)

                    if active_face_box is not None:
                        fx, fy, fw, fh = [int(value) for value in active_face_box]
                        pad_x = int(fw * 0.22)
                        pad_y = int(fh * 0.18)
                        x1 = max(0, fx - pad_x)
                        y1 = max(0, fy - pad_y)
                        x2 = min(width, fx + fw + pad_x)
                        y2 = min(height, fy + fh + pad_y)
                        candidate_mask[y1:y2, x1:x2] = 0

                    if int(candidate_mask.sum()) == 0:
                        candidate_mask = threshold
                        if active_face_box is not None:
                            fx, fy, fw, fh = [int(value) for value in active_face_box]
                            candidate_mask[max(0, fy - int(fh * 0.2)):min(height, fy + fh + int(fh * 0.2)), max(0, fx - int(fw * 0.2)):min(width, fx + fw + int(fw * 0.2))] = 0

                    contours, _ = cv2.findContours(candidate_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    contours = [contour for contour in contours if cv2.contourArea(contour) >= max(150, width * height * 0.002)]
                    if contours:
                        mouth = output_frame.get("face", {}).get("mouthCenter")

                        def _contour_score(contour):
                            moments = cv2.moments(contour)
                            if not moments["m00"]:
                                return float("inf")
                            cx = moments["m10"] / moments["m00"]
                            cy = moments["m01"] / moments["m00"]
                            area = cv2.contourArea(contour)
                            if mouth:
                                dx = (cx / width) - mouth["x"]
                                dy = (cy / height) - mouth["y"]
                                return (dx * dx + dy * dy) ** 0.5 - min(0.15, area / (width * height))
                            return -area

                        contour = min(contours, key=_contour_score)
                        moments = cv2.moments(contour)
                        if moments["m00"]:
                            cx = moments["m10"] / moments["m00"]
                            cy = moments["m01"] / moments["m00"]
                            output_frame["hand"] = {
                                "wrist": {"x": cx / width, "y": cy / height},
                            }
                            hand_frame_count += 1

                previous_gray = gray
                frames.append(output_frame)
                frame_index += 1
        finally:
            capture.release()

        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(
                {
                    "frames": frames,
                    "extractionMode": "opencv-motion-fallback",
                    "faceFrameCount": face_frame_count,
                    "handFrameCount": hand_frame_count,
                },
                indent=2,
            ),
            encoding="utf-8",
        )
        print(f"Wrote {len(frames)} fallback motion frames to {args.output}")
        return

    hands = mp.solutions.hands.Hands(static_image_mode=False, max_num_hands=1, min_detection_confidence=0.55)
    face_mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=False, max_num_faces=1, min_detection_confidence=0.55)

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_index % max(1, args.frame_step) != 0:
                frame_index += 1
                continue

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            hand_result = hands.process(rgb)
            face_result = face_mesh.process(rgb)
            output_frame = {"timestampMs": round((frame_index / fps) * 1000, 2)}

            if hand_result.multi_hand_landmarks:
                hand = hand_result.multi_hand_landmarks[0].landmark
                output_frame["hand"] = {
                    "wrist": {"x": hand[0].x, "y": hand[0].y},
                    "indexTip": {"x": hand[8].x, "y": hand[8].y},
                    "thumbTip": {"x": hand[4].x, "y": hand[4].y},
                }

            if face_result.multi_face_landmarks:
                face = face_result.multi_face_landmarks[0].landmark
                mouth_left = face[61]
                mouth_right = face[291]
                left_cheek = face[234]
                right_cheek = face[454]
                output_frame["face"] = {
                    "mouthCenter": {
                        "x": (mouth_left.x + mouth_right.x) / 2,
                        "y": (mouth_left.y + mouth_right.y) / 2,
                    },
                    "leftCheek": {"x": left_cheek.x, "y": left_cheek.y},
                    "rightCheek": {"x": right_cheek.x, "y": right_cheek.y},
                }

            frames.append(output_frame)
            frame_index += 1
    finally:
        capture.release()
        hands.close()
        face_mesh.close()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({"frames": frames}, indent=2), encoding="utf-8")
    print(f"Wrote {len(frames)} landmark frames to {args.output}")


if __name__ == "__main__":
    main()
