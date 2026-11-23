import media from './content-media.json' with {type: 'json'};

function headers(extra = {}) {
  return new Headers({
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...extra
  });
}
function error(status, extra) {
  return new Response(null, {status, headers: headers({'Cache-Control': 'no-store', ...extra})});
}

function selectRange(value, size) {
  const match = /^bytes=(\d{1,16})?-(\d{1,16})?$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return null;
  if (first === null) return last > 0 ? [Math.max(0,size-last),size-1] : null;
  if (first >= size || (last !== null && last < first)) return null;
  return [first, Math.min(last ?? size-1,size-1)];
}

function sliceStream(stream, first, last) {
  const reader = stream.getReader();
  let cursor = 0;
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        const {value,done} = await reader.read();
        if (done) { controller.close(); return; }
        const offset = cursor;
        cursor += value.byteLength;
        const end = Math.min(value.byteLength,last+1-offset);
        const start = Math.max(0,first-offset);
        if (start < end) controller.enqueue(value.subarray(start,end));
        if (cursor > last) {
          controller.close();
          await reader.cancel();
          return;
        }
        if (start < end) return;
      }
    },
    cancel(reason) { return reader.cancel(reason); }
  });
}

function fixedLength(stream, length) {
  if (typeof FixedLengthStream !== 'function') return stream;
  const {readable,writable} = new FixedLengthStream(length);
  stream.pipeTo(writable).catch(() => {});
  return readable;
}

export async function handleContent(request, env) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET' && request.method !== 'HEAD') return error(405,{Allow:'GET, HEAD'});
  const asset = Object.hasOwn(media,path) ? media[path] : null;
  if (!asset) {
    const upstream = await env.ASSETS.fetch(request);
    const response = new Response(upstream.body,upstream);
    headers().forEach((value,key) => response.headers.set(key,value));
    return response;
  }
  const kv = env.CONTENT_MEDIA;
  const etag = `"${asset.sha256}"`;
  const common = headers({
    'Content-Type': asset.type,
    'Cache-Control': 'public, max-age=3600',
    'Accept-Ranges': 'bytes',
    ETag: etag
  });
  const ifNoneMatch = request.headers.get('If-None-Match');
  if (ifNoneMatch && ifNoneMatch.split(',').map(s=>s.trim().replace(/^W\//,'')).some(s=>s==='*'||s===etag)) {
    return new Response(null,{status:304,headers:common});
  }
  const ifRange = request.headers.get('If-Range');
  const wanted = request.method === 'GET' && (!ifRange || ifRange === etag) ? request.headers.get('Range') : null;
  const range = wanted ? selectRange(wanted,asset.bytes) : null;
  if (wanted && !range) return error(416,{'Content-Range':`bytes */${asset.bytes}`,'Accept-Ranges':'bytes'});
  const length = range ? range[1]-range[0]+1 : asset.bytes;
  common.set('Content-Length',String(length));
  if (range) common.set('Content-Range',`bytes ${range[0]}-${range[1]}/${asset.bytes}`);
  // Only serve exact manifest keys from the binding; never pass request paths to KV.
  let stream;
  try {
    if (kv) stream = await kv.get(asset.key,'stream');
    else {
      const clean = new URL(path,request.url);
      const method = request.method === 'HEAD' ? 'HEAD' : 'GET';
      const response = await env.ASSETS.fetch(new Request(clean,{method}));
      const upstreamLength = response.headers.get('Content-Length');
  if (response.status !== 200 || (upstreamLength !== null && Number(upstreamLength) !== asset.bytes) ||
          response.headers.get('Content-Type')?.split(';')[0] !== asset.type) return error(503);
      if (method === 'HEAD') return new Response(null,{headers:common});
      stream = response.body;
    }
  } catch { return error(503); }
  if (!stream) return error(503);
  if (request.method === 'HEAD') {
    await stream.cancel();
    return new Response(null,{headers:common});
  }
  return new Response(fixedLength(range ? sliceStream(stream,...range) : stream,length),{
    status: range ? 206 : 200,
    headers:common
  });
}
