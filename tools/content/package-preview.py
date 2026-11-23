"""Bundle gallery review offline; original TikTok links require internet."""
import base64
import io
import json
import re
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile
from PIL import Image

root = Path(__file__).resolve().parents[2] / 'content'
output = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent
index = (root/'index.html').read_text()
index = re.sub(r'<div class="tool-bar">.*?</div>\s*<main>', '<main>', index, flags=re.S)
styles = '<link rel="stylesheet" href="style.css">'
script = '<script type="module" src="gallery.js"></script>'
combined = '\n'.join([
    (root/'hinge/stories.js').read_text().replace('export const stories','const hingeStories'),
    (root/'michaela/stories.js').read_text().replace('export const','const',1),
    (root/'references.js').read_text().replace('export const','const',1),
    re.sub(r'^import .*?;\n','',(root/'gallery.js').read_text(),flags=re.M),
])
sources = sorted((root/'hinge/renders').glob('*.png'))+sorted((root/'michaela').glob('*.png'))
assert len(sources)==23
movies = re.findall(r'src="(video/[^"]+\.mp4)"',index)
posters = re.findall(r'poster="(video/[^"]+\.jpg)"',index)
assert len(movies)==len(posters)==2
def b64(data): return base64.b64encode(data).decode()
outzip = output/'YourMove-Reference-Archive-Preview.zip'
with ZipFile(outzip,'w',ZIP_DEFLATED,compresslevel=5) as archive:
    prefix = 'YourMove Reference Archive/'
    archive.writestr(prefix+'index.html',index.replace(script,'<script defer src="preview.js"></script>'))
    archive.writestr(prefix+'preview.js',combined)
    archive.writestr(prefix+'README.txt','Extract all files, then open index.html in a desktop browser. All YourMove outputs and the archive notes are included. Original TikTok embeds and links require internet.\n')
    for path in [*sources,root/'style.css',*(root/file for file in movies+posters)]:
        archive.write(path,prefix+str(path.relative_to(root)))
with ZipFile(outzip) as archive: assert archive.testzip() is None
small = {}
for path in sources:
    with Image.open(path) as im:
        im.thumbnail((810,1440))
        buf=io.BytesIO()
        im.convert('RGB').save(buf,format='JPEG',quality=86,optimize=True)
    small[str(path.relative_to(root))]=b64(buf.getvalue())
portable=index.replace(styles,'<style>'+(root/'style.css').read_text()+'</style>')
for poster in posters:
    portable=portable.replace(f'poster="{poster}"',f'poster="data:image/jpeg;base64,{b64((root/poster).read_bytes())}"')
for movie in movies:
    portable=portable.replace(f'src="{movie}"',f'src="data:video/mp4;base64,{b64((root/movie).read_bytes())}"')
boot='const encodedPictures = '+json.dumps(small)+';\nconst blobs={};\nfunction assetUrl(p){return blobs[p]??=URL.createObjectURL(new Blob([Uint8Array.from(atob(encodedPictures[p]),c=>c.charCodeAt(0))],{type:"image/jpeg"}));}\n'
bundle=combined.replace('preview.href = href;', 'preview.href = assetUrl(href);').replace('link.href = href;', 'link.href = assetUrl(href);').replace('image.src = href;', 'image.src = assetUrl(href);')
assert bundle.count('assetUrl(href)')==3
portable=portable.replace(script,'<script>\n'+boot+bundle+'\n</script>')
outhtml=output/'YourMove-Reference-Archive.html'
outhtml.write_text(portable)
assert [base64.b64decode(b) for b in re.findall(r'src="data:video/mp4;base64,([^"]+)',portable)] == [(root/movie).read_bytes() for movie in movies]
print(outhtml,outhtml.stat().st_size,outzip,outzip.stat().st_size)
