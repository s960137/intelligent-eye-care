"""State transition used to count one blink per close/reopen cycle."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class BlinkCounter:
    threshold: float = 0.23
    consecutive_frames: int = 3
    total: int = 0
    closed_frames: int = 0

    def __post_init__(self) -> None:
        if self.threshold <= 0:
            raise ValueError("threshold must be positive")
        if self.consecutive_frames < 1:
            raise ValueError("consecutive_frames must be at least 1")

    def update(self, ear: float) -> bool:
        """Update state and return True only when a completed blink is counted."""
        if ear < self.threshold:
            self.closed_frames += 1
            return False

        blinked = self.closed_frames >= self.consecutive_frames
        if blinked:
            self.total += 1
        self.closed_frames = 0
        return blinked

    def reset_partial(self) -> None:
        """Discard an unfinished closure after tracking is interrupted."""
        self.closed_frames = 0
