"""Compatibility entry point for the current shared-board integration checks."""
from pathlib import Path
import runpy

runpy.run_path(str(Path(__file__).with_name("check_shared_backend.py")), run_name="__main__")
