# Intelligent Eye Care (智慧 EYE 護)

An archived research prototype for monitoring blink frequency and screen-related eye-care habits. The project combines a Dlib/OpenCV blink monitor, an eye-care diary web prototype, presentation materials, a report, sample measurements, and a recorded demonstration.

> 這是一份研究與展示用途的封存專案，不是醫療器材，也不能取代專業診斷或治療。

![Blink detection demo](docs/images/program-running.png)

## What it does

- Detects a face and 68 facial landmarks with Dlib.
- Uses six landmarks around each eye to calculate the Eye Aspect Ratio (EAR).
- Counts one blink after the eyes reopen following a configurable number of closed-eye frames.
- Reports the running blink count and the number of blinks in the most recent minute.
- Optionally saves a blink-count chart when the program exits.
- Provides a Node.js / Express prototype for local user registration and eye-care diary entries.

![EAR formula](docs/images/ear-formula.png)

## Repository layout

```text
.
├── archive/original/       # Original 2024 prototype scripts
├── data/                   # Sample head-angle measurements
├── docs/                   # Presentation, report, video, and images
├── references/             # Research references
├── src/                    # Cleaned and testable blink monitor
├── tests/                  # Unit tests for metrics and blink state
└── web/                    # Express eye-care diary prototype
```

The [presentation](docs/intelligent-eye-care-presentation.pptx), [project report](docs/intelligent-eye-care-report.pdf), and [demo video](docs/blink-detection-demo.mp4) preserve the published project results. The original scripts are retained under `archive/original`; the runnable version under `src` fixes counting and path-handling issues while preserving the EAR-based approach.

## Set up the blink monitor

The cleaned implementation targets Python 3.11.

```bash
python -m venv .venv
```

Activate the environment, then install the dependencies:

```bash
python -m pip install -r requirements.txt
```

Download and decompress Dlib's official landmark model:

<http://dlib.net/files/shape_predictor_68_face_landmarks.dat.bz2>

The model is intentionally not committed because it is about 95 MiB. Dlib notes that it was trained on the iBUG 300-W dataset, whose license excludes commercial use. Review the upstream terms before using it outside research or education.

## Run the blink monitor

```bash
python src/blink_monitor.py --shape-predictor shape_predictor_68_face_landmarks.dat --plot-output blink-count.png
```

Press `q` to stop. Useful options include `--camera-index`, `--ear-threshold`, and `--consecutive-frames`.

To display all 68 facial landmarks without blink counting:

```bash
python src/face_landmarks_demo.py --shape-predictor shape_predictor_68_face_landmarks.dat
```

## Run the web prototype

Requirements: Node.js 18 or later.

```bash
cd web
npm ci
npm start
```

Then open <http://localhost:3000>. The server creates `web/data.json` locally when a user is registered. That file is ignored by Git to prevent personal information from being published.

## Tests

```bash
python -m unittest discover -s tests -v
```

The tests cover EAR/MAR calculations and the blink state transition without requiring a webcam.

## Privacy and publication notes

- Do not commit real names, identity numbers, dates of birth, phone numbers, medical histories, or other health-related data.
- `web/data.example.json` contains fictional data only.
- The included face images and video should be published only with the depicted participants' permission.
- Third-party research PDFs are intentionally not redistributed; citations are listed in [references/README.md](references/README.md).
- The source archive does not contain the head-pose estimation implementation that produced the angle spreadsheet, so that portion is preserved as data and documentation only.

## Research status

The presentation reports a strabismus-recognition accuracy of 96.34% and notes reduced accuracy at low head-rotation angles. The archived material does not include the evaluation dataset or executable experiment code needed to independently verify that figure, so it should be treated as a reported project result rather than a reproduced benchmark.

## Attribution and license

The EAR approach follows Soukupová and Čech (2016). The archived prototype also adapts code from Adrian Rosebrock's PyImageSearch blink-detection tutorial. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [references/README.md](references/README.md).

No project-wide open-source license has been selected. Unless a license is added by the project owner, the original project code and media remain under the owner's default copyright; third-party components remain under their respective terms.
