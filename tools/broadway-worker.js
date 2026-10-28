export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/broadway/api/')) return env.ASSETS.fetch(request);
    if (!env.BROADWAY_ORIGIN || !env.BROADWAY_ORIGIN_SECRET) {
      return Response.json({error:'Runner is not connected yet'}, {status:503,headers:{'Cache-Control':'no-store'}});
    }
    const upstream = new URL(url.pathname.slice('/broadway/api'.length) + url.search, env.BROADWAY_ORIGIN);
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('authorization');
    headers.set('x-broadway-origin', env.BROADWAY_ORIGIN_SECRET);
    headers.set('x-client-ip', request.headers.get('cf-connecting-ip') || 'unknown');
    const response = await fetch(upstream, {method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'});
    const result = new Response(response.body,response);
    result.headers.set('Cache-Control','no-store');
    result.headers.set('X-Robots-Tag','noindex, nofollow, noarchive');
    return result;
  }
};
