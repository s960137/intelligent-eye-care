"""Display Dlib's 68 facial landmarks from a webcam."""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(description="Display 68 facial landmarks")
    parser.add_argument("--shape-predictor", required=True, type=Path)
    parser.add_argument("--camera-index", type=int, default=0)
    args = parser.parse_args()

    import cv2
    import dlib

    if not args.shape_predictor.is_file():
        raise FileNotFoundError(f"Landmark model not found: {args.shape_predictor}")

    detector = dlib.get_frontal_face_detector()
    predictor = dlib.shape_predictor(str(args.shape_predictor))
    camera = cv2.VideoCapture(args.camera_index)
    if not camera.isOpened():
        raise RuntimeError(f"Unable to open camera index {args.camera_index}")

    try:
        while True:
            ok, frame = camera.read()
            if not ok:
                break
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            for face in detector(gray, 0):
                landmarks = predictor(gray, face)
                for index in range(68):
                    point = landmarks.part(index)
                    cv2.circle(frame, (point.x, point.y), 1, (0, 255, 0), -1)
            cv2.imshow("Facial Landmarks", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        camera.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
