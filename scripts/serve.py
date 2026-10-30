"""Serve the app locally using Python's standard library."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

if __name__ == "__main__":
    directory = Path(__file__).resolve().parent.parent / "public/studio"
    handler = partial(SimpleHTTPRequestHandler, directory=str(directory))
    print("Open http://127.0.0.1:8000 (Ctrl+C to stop).")
    ThreadingHTTPServer(("127.0.0.1", 8000), handler).serve_forever()
