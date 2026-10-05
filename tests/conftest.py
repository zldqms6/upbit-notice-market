import os
import sys

# gltest's direct loader unlinks a temp file while it is still open as stdin,
# which Windows refuses. Ignore that one failure so tests also run on Windows.
if sys.platform == "win32":
    _unlink = os.unlink

    def _lenient_unlink(path, *a, **kw):
        try:
            _unlink(path, *a, **kw)
        except PermissionError:
            pass

    os.unlink = _lenient_unlink
