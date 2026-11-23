"""Check a Cloudflare preview after the approved video is staged.

Usage: python tools/content/check_gallery_http.py http://127.0.0.1:8787
"""

from email.parser import BytesParser
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def request(url, method="GET", headers=None):
    if method not in ("GET", "HEAD"):
        raise ValueError("Only GET and HEAD are supported")
    with tempfile.TemporaryDirectory(prefix="gallery-smoke-") as tmp:
        header_path = Path(tmp) / "headers"
        body_path = Path(tmp) / "body"
        command = [
            "curl", "--fail", "--silent", "--show-error", "--location",
            "--retry", "2", "--retry-all-errors", "--max-time", "15",
            "--dump-header", str(header_path), "--output", str(body_path),
            "--write-out", "%{http_code}",
        ]
        if method == "HEAD":
            command.append("--head")
        for name, value in (headers or {}).items():
            command.extend(("--header", f"{name}: {value}"))
        status = subprocess.check_output([*command, url], text=True)
        # Proxy handshakes, retries and redirects may emit their own header blocks.
        blocks = re.split(rb"(?m)^HTTP/[^\r\n]+\r?\n", header_path.read_bytes())
        parsed = BytesParser().parsebytes(blocks[-1])
        return int(status), parsed, b"" if method == "HEAD" else body_path.read_bytes()


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    base = sys.argv[1].rstrip("/")
    status, headers, _ = request(base + "/content/")
    assert status == 200 and "noindex" in headers.get("X-Robots-Tag", "")
    for name in ("flashcards-full-bleed.mp4", "wingman-bean-says-yes.mp4"):
        movie = base + "/content/video/" + name
        status, headers, _ = request(movie, "HEAD")
        assert status == 200 and headers.get_content_type() == "video/mp4"
        assert "noindex" in headers.get("X-Robots-Tag", "")
        status, headers, body = request(movie, headers={"Range": "bytes=0-1023"})
        assert status == 206 and headers.get("Content-Range", "").startswith("bytes 0-1023/")
        assert len(body) == 1024
    print("Gallery noindex, MP4 type, and byte-range responses verified")


if __name__ == "__main__":
    main()
