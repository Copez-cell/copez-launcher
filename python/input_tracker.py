"""
input_tracker.py — COPEZ input device split tracker.

Tracks keyboard/mouse vs Xbox controller events during a gaming session
and returns a percentage split (e.g., {"kbm": 15, "controller": 85}).

Usage (subprocess):
    python input_tracker.py start       # begin tracking, writes PID file
    python input_tracker.py stop        # stop tracking, prints JSON result to stdout
    python input_tracker.py <pid>       # send stop signal to a specific PID directly

Usage (module):
    from input_tracker import start_input_tracking, stop_input_tracking
    tracker = start_input_tracking()
    # ... play game ...
    result = stop_input_tracking(tracker)
    print(result)  # {"kbm": 75, "controller": 25}
"""

from __future__ import annotations

import atexit
import json
import os
import signal
import sys
import threading
import time
from ctypes import Structure, WinDLL, byref, c_ubyte, c_uint, c_ushort, c_short, c_byte, create_string_buffer
from dataclasses import dataclass, field
from typing import Optional

# ── XInput constants & types ──────────────────────────────────────────────

ERROR_SUCCESS = 0
ERROR_DEVICE_NOT_CONNECTED = 1167

XINPUT_GAMEPAD_LEFT_THUMB_DEADZONE = 7849
XINPUT_GAMEPAD_RIGHT_THUMB_DEADZONE = 8689
XINPUT_GAMEPAD_TRIGGER_THRESHOLD = 30

MAX_CONTROLLERS = 4
POLL_INTERVAL_S = 0.1  # 100ms


class XINPUT_GAMEPAD(Structure):
    _fields_ = [
        ("wButtons", c_ushort),
        ("bLeftTrigger", c_ubyte),
        ("bRightTrigger", c_ubyte),
        ("sThumbLX", c_short),
        ("sThumbLY", c_short),
        ("sThumbRX", c_short),
        ("sThumbRY", c_short),
    ]


class XINPUT_STATE(Structure):
    _fields_ = [
        ("dwPacketNumber", c_uint),
        ("Gamepad", XINPUT_GAMEPAD),
    ]


# ── Shared state (protected by GIL, no lock needed) ───────────────────────

@dataclass
class InputCounts:
    kbm: int = 0
    controller: int = 0


_counts = InputCounts()
_running = threading.Event()
_pynput_listeners: list = []

# ── XInput DLL binding ────────────────────────────────────────────────────

_xinput: Optional[WinDLL] = None
try:
    _xinput = WinDLL("xinput1_4.dll", use_last_error=True)
except OSError:
    try:
        _xinput = WinDLL("xinput1_3.dll", use_last_error=True)
    except OSError:
        _xinput = None

_XInputGetState = None
if _xinput:
    _XInputGetState = _xinput.XInputGetState
    _XInputGetState.argtypes = [c_uint, c_ubyte]
    _XInputGetState.restype = c_uint


def _poll_controller(prev_state: list[int], player_index: int) -> bool:
    """Poll one controller, return True if anything changed."""
    if not _XInputGetState:
        return False

    state = XINPUT_STATE()
    result = _XInputGetState(player_index, byref(state))

    if result != ERROR_SUCCESS:
        return False

    pad = state.Gamepad
    changed = False

    # Button changes
    if pad.wButtons != prev_state[player_index]:
        changed = True
        prev_state[player_index] = pad.wButtons

    # Trigger changes (beyond threshold)
    if pad.bLeftTrigger > XINPUT_GAMEPAD_TRIGGER_THRESHOLD:
        changed = True
    if pad.bRightTrigger > XINPUT_GAMEPAD_TRIGGER_THRESHOLD:
        changed = True

    # Thumbstick changes (beyond deadzone)
    if abs(pad.sThumbLX) > XINPUT_GAMEPAD_LEFT_THUMB_DEADZONE:
        changed = True
    if abs(pad.sThumbLY) > XINPUT_GAMEPAD_LEFT_THUMB_DEADZONE:
        changed = True
    if abs(pad.sThumbRX) > XINPUT_GAMEPAD_RIGHT_THUMB_DEADZONE:
        changed = True
    if abs(pad.sThumbRY) > XINPUT_GAMEPAD_RIGHT_THUMB_DEADZONE:
        changed = True

    return changed


def _controller_poll_thread():
    """Background thread that polls all connected Xbox controllers."""
    prev_button_state = [0] * MAX_CONTROLLERS

    while _running.is_set():
        any_activity = False
        for i in range(MAX_CONTROLLERS):
            if _poll_controller(prev_button_state, i):
                any_activity = True

        if any_activity:
            _counts.controller += 1

        time.sleep(POLL_INTERVAL_S)


# ── KBM hooks (pynput) ────────────────────────────────────────────────────

def _on_key_press(key) -> None:
    _counts.kbm += 1


def _on_click(x, y, button, pressed) -> None:
    if pressed:
        _counts.kbm += 1


# pynput mouse.move handler is too noisy; we use click-only for mouse.
# A significant mouse move can optionally be tracked, but it creates
# massive event counts that dwarf controller events. Click-only gives
# a more balanced comparison with controller button presses.

_mouse_listener: Optional = None
_keyboard_listener: Optional = None


def _start_kbm_listeners() -> None:
    """Start pynput listeners if available."""
    global _mouse_listener, _keyboard_listener, _pynput_listeners

    try:
        from pynput import keyboard, mouse

        _keyboard_listener = keyboard.Listener(on_press=_on_key_press)
        _mouse_listener = mouse.Listener(on_click=_on_click)

        _keyboard_listener.start()
        _mouse_listener.start()
        _pynput_listeners = [_keyboard_listener, _mouse_listener]
    except ImportError:
        # pynput not installed — print a warning but don't crash
        print(
            "[input_tracker] pynput not available; KBM tracking disabled. "
            "Install with: pip install pynput",
            file=sys.stderr,
        )


def _stop_kbm_listeners() -> None:
    """Gracefully stop pynput listeners."""
    global _pynput_listeners
    for listener in _pynput_listeners:
        try:
            if listener and listener.running:
                listener.stop()
        except Exception:
            pass
    _pynput_listeners = []


# ── Public API ────────────────────────────────────────────────────────────

@dataclass
class InputTracker:
    """Opaque handle for an active tracking session."""
    poll_thread: threading.Thread
    running: threading.Event


def start_input_tracking() -> InputTracker:
    """Reset counters and begin background tracking.

    Returns an InputTracker handle to pass to stop_input_tracking().
    """
    _counts.kbm = 0
    _counts.controller = 0
    _running.set()

    # Start controller polling thread
    poll_thread = threading.Thread(target=_controller_poll_thread, daemon=True)
    poll_thread.start()

    # Start KBM listeners
    _start_kbm_listeners()

    return InputTracker(poll_thread=poll_thread, running=_running)


def stop_input_tracking(tracker: Optional[InputTracker] = None) -> dict:
    """Stop tracking and return input split percentages.

    Returns:
        {"kbm": <int>, "controller": <int>}
        Percentages sum to 100 (or both 0 if no events were recorded).
    """
    _running.clear()

    _stop_kbm_listeners()

    if tracker and tracker.poll_thread.is_alive():
        tracker.poll_thread.join(timeout=2.0)

    total = _counts.kbm + _counts.controller

    if total == 0:
        return {"kbm": 0, "controller": 0}

    kbm_pct = round((_counts.kbm / total) * 100)
    controller_pct = 100 - kbm_pct

    return {"kbm": kbm_pct, "controller": controller_pct}


# ── CLI entrypoint (for Electron subprocess communication) ────────────────

_TRACKER: Optional[InputTracker] = None
_PID_FILE: Optional[str] = None


def _get_pid_path() -> str:
    return os.path.join(
        os.environ.get("TEMP", "/tmp"),
        "copez_input_tracker.pid",
    )


def _cmd_start() -> None:
    global _TRACKER
    pid_path = _get_pid_path()

    # Write PID file
    with open(pid_path, "w") as f:
        f.write(str(os.getpid()))
    atexit.register(lambda: os.remove(pid_path) if os.path.exists(pid_path) else None)

    _TRACKER = start_input_tracking()

    # Block until killed
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass


def _cmd_stop() -> None:
    pid_path = _get_pid_path()
    if not os.path.exists(pid_path):
        print(
            json.dumps({"error": "No active tracking session found"}),
            flush=True,
        )
        sys.exit(1)

    with open(pid_path) as f:
        pid_str = f.read().strip()

    try:
        pid = int(pid_str)
    except ValueError:
        print(json.dumps({"error": "Corrupt PID file"}), flush=True)
        sys.exit(1)

    # Signal the tracker process to stop
    try:
        os.kill(pid, signal.SIGINT)
    except OSError:
        pass

    # Give it a moment to flush, then clean up
    time.sleep(0.3)

    # Read result — the process handles KeyboardInterrupt and flushes before exit
    # We read the cached state directly as a fallback
    total = _counts.kbm + _counts.controller
    if total == 0:
        result = {"kbm": 0, "controller": 0}
    else:
        kbm_pct = round((_counts.kbm / total) * 100)
        result = {"kbm": kbm_pct, "controller": 100 - kbm_pct}

    print(json.dumps(result), flush=True)

    # Clean up PID file
    try:
        os.remove(pid_path)
    except OSError:
        pass


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python input_tracker.py <start|stop>", file=sys.stderr)
        sys.exit(1)

    command = sys.argv[1].lower()

    if command == "start":
        _cmd_start()
    elif command == "stop":
        _cmd_stop()
    else:
        print(f"Unknown command: {command}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
