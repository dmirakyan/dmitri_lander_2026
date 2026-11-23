"""Check a Cloudflare preview after the approved video is staged.

Usage: python tools/content/check_gallery_http.py http://127.0.0.1:8787
"""

from urllib.request import Request, urlopen
import sys


def request(url, method="GET", headers=None):
    with urlopen(Request(url, method=method, headers=headers or {}), timeout=15) as response:
        return response.status, response.headers, response.read()


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
