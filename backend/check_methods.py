"""
Small validation helpers used by app.py
"""
from typing import Set


def allowed_file(filename: str, allowed: Set[str]) -> bool:
    if "." not in filename:
        return False
    ext = filename.rsplit(".", 1)[1].lower()
    return ext in allowed
