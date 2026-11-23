import {handleContent} from './content-gallery.mjs';
import {handleJobs} from './jobs.mjs';
export {JobsApplication} from './jobs.mjs';
export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    if(url.pathname==='/content'||url.pathname.startsWith('/content/')) return handleContent(request,env);
    if(url.pathname.startsWith('/api/jobs/')) return handleJobs(request,env);
    if(url.pathname==='/admin/twitter'||url.pathname.startsWith('/admin/twitter/')){
      const target='https://dmitri.im'+url.pathname.replace(/^\/admin\/twitter\/?/,'/twitter/')+url.search;
      return new Response(null,{status:308,headers:{Location:target,'Cache-Control':'no-store'}});
    }
    if(url.pathname==='/twitter')return new Response(null,{status:308,headers:{Location:'https://dmitri.im/twitter/'+url.search,'Cache-Control':'no-store'}});
    if(url.pathname.startsWith('/twitter/')||url.pathname.startsWith('/api/writing/')){
      if(url.hostname==='www.dmitri.im')return Response.redirect('https://dmitri.im'+url.pathname+url.search,308);
      const path=url.pathname.replace(/^\/twitter\//,'/admin/twitter/').replace(/^\/api\/writing\//,'/api/');
      const upstream=new URL('https://159-223-140-215.sslip.io/writing'+path);
      const headers=new Headers(request.headers);
      headers.set('X-Writing-Origin-Key',env.WRITING_ORIGIN_KEY);
      headers.delete('Host');
      try{
        const response=await fetch(upstream,{method:request.method,headers,body:['GET','HEAD'].includes(request.method)?undefined:request.body,redirect:'manual'});
        const result=new Response(response.body,response);result.headers.set('Cache-Control','no-store');result.headers.set('X-Robots-Tag','noindex, nofollow');return result;
      }catch{return Response.json({error:'Writing is temporarily unavailable. Your text is still in the editor.'},{status:503});}
    }
    return env.ASSETS.fetch(request);
  }
};
