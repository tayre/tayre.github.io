"""Persistent solver subprocess with a parent-enforced wall-clock deadline."""

import multiprocessing
import time
import traceback


def worker_main(connection):
    from .solver import solve

    connection.send({"ready": True})
    try:
        while True:
            request = connection.recv()
            if request is None:
                return
            try:
                result = solve(request)
            except Exception:
                result = {
                    "status": "error",
                    "error": traceback.format_exc(),
                    "labels": None,
                    "verification": None,
                    "proof_certificate_verified": False,
                }
            connection.send(result)
    except (EOFError, BrokenPipeError):
        return
    finally:
        connection.close()


class Supervisor:
    def __init__(self, cancelled=lambda: False, target=worker_main):
        self.cancelled = cancelled
        self.target = target
        self.process = None
        self.connection = None

    def _receive(self, deadline):
        while time.monotonic() < deadline and not self.cancelled():
            if self.connection.poll(min(0.05, max(0, deadline - time.monotonic()))):
                return self.connection.recv()
            if not self.process.is_alive():
                raise RuntimeError(f"solver worker exited with code {self.process.exitcode}")
        return None

    def start(self, deadline):
        if self.process is not None:
            return True
        context = multiprocessing.get_context("spawn")
        self.connection, child = context.Pipe()
        self.process = context.Process(target=self.target, args=(child,), daemon=True)
        self.process.start()
        child.close()
        ready = self._receive(deadline)
        return ready is not None and ready.get("ready", False)

    def solve(self, request, deadline):
        started = time.monotonic()
        result = None
        try:
            if self.start(min(deadline, started + 30)):
                startup_seconds = time.monotonic() - started
                self.connection.send(request)
                result = self._receive(
                    min(deadline, time.monotonic() + request["solver_seconds"] + 1)
                )
                if result is not None:
                    result["dispatch_startup_seconds"] = startup_seconds
        except (EOFError, BrokenPipeError, OSError, RuntimeError) as exc:
            result = {
                "status": "error",
                "error": str(exc),
                "labels": None,
                "verification": None,
                "proof_certificate_verified": False,
            }
        if result is None:
            result = {
                "status": "unknown",
                "labels": None,
                "verification": None,
                "proof_certificate_verified": False,
                "proof_certificate": None,
                "termination": "cancelled" if self.cancelled() else "parent_time_limit",
                "timed_out": not self.cancelled(),
            }
            self.stop(force=True)
        elif result["status"] == "error":
            self.stop(force=True)
        result["wall_seconds"] = time.monotonic() - started
        return result

    def stop(self, force=False):
        if self.process is None:
            return
        if not force:
            try:
                self.connection.send(None)
            except (BrokenPipeError, EOFError, OSError):
                pass
            self.process.join(0.15)
        if self.process.is_alive():
            self.process.terminate()
            self.process.join(0.15)
        if self.process.is_alive():
            self.process.kill()
            self.process.join(0.15)
        self.connection.close()
        self.process.close()
        self.process, self.connection = None, None
