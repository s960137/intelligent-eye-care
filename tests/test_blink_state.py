import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from blink_state import BlinkCounter


class BlinkCounterTests(unittest.TestCase):
    def test_counts_once_after_reopening(self) -> None:
        counter = BlinkCounter(threshold=0.23, consecutive_frames=3)
        for ear in (0.30, 0.20, 0.18, 0.19, 0.17, 0.30):
            counter.update(ear)
        self.assertEqual(counter.total, 1)

    def test_short_closure_is_not_a_blink(self) -> None:
        counter = BlinkCounter(threshold=0.23, consecutive_frames=3)
        for ear in (0.20, 0.21, 0.30):
            counter.update(ear)
        self.assertEqual(counter.total, 0)

    def test_long_closure_does_not_repeat_count(self) -> None:
        counter = BlinkCounter(threshold=0.23, consecutive_frames=3)
        for ear in (0.20,) * 20:
            counter.update(ear)
        self.assertEqual(counter.total, 0)
        self.assertTrue(counter.update(0.30))
        self.assertEqual(counter.total, 1)


if __name__ == "__main__":
    unittest.main()
