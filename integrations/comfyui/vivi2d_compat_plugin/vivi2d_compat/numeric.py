from __future__ import annotations

import math
from typing import Any

MAX_SAFE_INTEGER = (1 << 53) - 1


def is_safe_integer(value: Any) -> bool:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    if isinstance(value, float) and (not math.isfinite(value) or not value.is_integer()):
        return False
    return -MAX_SAFE_INTEGER <= value <= MAX_SAFE_INTEGER
