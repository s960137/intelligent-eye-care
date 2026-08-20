"""Webcam blink monitor for the Intelligent Eye Care prototype."""

from __future__ import annotations

import argparse
import time
from pathlib import Path

from blink_state import BlinkCounter
from landmark_metrics import eye_aspect_ratio


RIGHT_EYE = slice(36, 42)
LEFT_EYE = slice(42, 48)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Count blinks using Dlib facial landmarks")
    parser.add_argument("--shape-predictor", required=True, type=Path)
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--ear-threshold", type=float, default=0.23)
    parser.add_argument("--consecutive-frames", type=int, default=3)
    parser.add_argument("--plot-output", type=Path)
    parser.add_argument("--show-plot", action="store_true")
    return parser


def save_plot(times: list[float], counts: list[int], output: Path | None, show: bool) -> None:
    if not output and not show:
        return

    import matplotlib.pyplot as plt

    figure, axis = plt.subplots(figsize=(9, 5))
    axis.step(times, counts, where="post")
    axis.set(xlabel="Elapsed time (seconds)", ylabel="Blink count", title="Blink Count Over Time")
    axis.grid(alpha=0.25)
    figure.tight_layout()
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        figure.savefig(output, dpi=150)
    if show:
        plt.show()
    plt.close(figure)


def run(args: argparse.Namespace) -> None:
    import cv2
    import dlib
    import numpy as np

    if not args.shape_predictor.is_file():
        raise FileNotFoundError(f"Landmark model not found: {args.shape_predictor}")

    detector = dlib.get_frontal_face_detector()
    predictor = dlib.shape_predictor(str(args.shape_predictor))
    counter = BlinkCounter(args.ear_threshold, args.consecutive_frames)
    camera = cv2.VideoCapture(args.camera_index)
    if not camera.isOpened():
        raise RuntimeError(f"Unable to open camera index {args.camera_index}")

    session_start = time.monotonic()
    minute_start = session_start
    minute_blinks = 0
    last_minute_blinks = 0
    history_times = [0.0]
    history_counts = [0]
    last_sample = session_start

    cv2.namedWindow("Intelligent Eye Care", cv2.WINDOW_NORMAL)
    try:
        while True:
            ok, frame = camera.read()
            if not ok:
                break

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = detector(gray, 0)
            ear = None

            if faces:
                face = max(faces, key=lambda rect: rect.width() * rect.height())
                shape = predictor(gray, face)
                points = np.array([(shape.part(index).x, shape.part(index).y) for index in range(68)])
                left_eye = points[LEFT_EYE]
                right_eye = points[RIGHT_EYE]
                ear = (eye_aspect_ratio(left_eye) + eye_aspect_ratio(right_eye)) / 2.0

                if counter.update(ear):
                    minute_blinks += 1

                cv2.drawContours(frame, [cv2.convexHull(left_eye)], -1, (0, 255, 0), 1)
                cv2.drawContours(frame, [cv2.convexHull(right_eye)], -1, (0, 255, 0), 1)
            else:
                counter.reset_partial()

            now = time.monotonic()
            elapsed = now - session_start
            if now - minute_start >= 60.0:
                last_minute_blinks = minute_blinks
                minute_blinks = 0
                minute_start = now

            if now - last_sample >= 1.0:
                history_times.append(elapsed)
                history_counts.append(counter.total)
                last_sample = now

            cv2.putText(frame, f"Blinks: {counter.total}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            ear_text = f"EAR: {ear:.2f}" if ear is not None else "EAR: no face"
            cv2.putText(frame, ear_text, (250, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
            cv2.putText(frame, f"Current minute: {minute_blinks}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)
            cv2.putText(frame, f"Previous minute: {last_minute_blinks}", (10, 88), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)
            runtime = time.strftime("%H:%M:%S", time.gmtime(elapsed))
            cv2.putText(frame, f"Runtime: {runtime}", (10, 116), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)

            cv2.imshow("Intelligent Eye Care", frame)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        camera.release()
        cv2.destroyAllWindows()
        history_times.append(time.monotonic() - session_start)
        history_counts.append(counter.total)
        save_plot(history_times, history_counts, args.plot_output, args.show_plot)


def main() -> None:
    run(build_parser().parse_args())


if __name__ == "__main__":
    main()
