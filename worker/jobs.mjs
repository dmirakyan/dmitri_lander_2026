const DATA_SOURCE = 'a0d34586-7548-4feb-8e46-541eede2307a';
const ROLES = ['Applied AI Engineer', 'Engagement Manager'];
const SOURCES = ['/jobs/', '/jobs/applied-ai-engineer/', '/jobs/engagement-manager/'];
const METHODIC_ORIGINS = ['https://methodic.group', 'https://www.methodic.group'];
const METHODIC_SOURCES = METHODIC_ORIGINS.flatMap(origin => ['/apply/applied-ai-engineer/', '/apply/engagement-manager/'].map(path => origin + path));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'}});
const unavailable = () => reply({error: 'Applications are temporarily unavailable. Please try again later.'}, 503);

export function validateApplication(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Invalid application.');
  const limits = {name:150,email:254,phone:50,location:200,availability:20,role:60,github:2000,linkedin:2000,portfolio:2000,message:10000,ai_or_snack_answer:2000,application_id:36,source:100,_gotcha:200};
  const data = {};
  for (const [key, max] of Object.entries(limits)) {
    if (raw[key] !== undefined && typeof raw[key] !== 'string') throw new Error('Invalid application field.');
    data[key] = (raw[key] || '').trim();
    if (data[key].length > max) throw new Error('One of your answers is too long.');
  }
  if (!data.name || !data.location) throw new Error('Please add your name and location.');
  if (!data.ai_or_snack_answer) throw new Error('Please answer the AI or snack question.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) throw new Error('Please enter a valid email address.');
  if (!['Part-time','Full-time'].includes(data.availability)) throw new Error('Please select your availability.');
  if (!ROLES.includes(data.role)) throw new Error('Please select an open role.');
  if (!UUID.test(data.application_id)) throw new Error('Please reload the page and try again.');
  if (!SOURCES.includes(data.source) && !METHODIC_SOURCES.includes(data.source)) throw new Error('Invalid application source.');
  for (const key of ['github','linkedin','portfolio']) {
    if (!data[key]) continue;
    let url;
    try { url = new URL(data[key]); } catch { throw new Error('Please enter a complete https:// link.'); }
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('Please use public http:// or https:// profile links.');
  }
  return data;
}

const rich = text => text ? Array.from({length:Math.ceil(text.length/1900)}, (_, i) => ({type:'text',text:{content:text.slice(i*1900,(i+1)*1900)}})) : [];
export function notionPage(data) {
  return {
    parent: {type:'data_source_id',data_source_id:DATA_SOURCE},
    template: {type:'default'},
    properties: {
      Candidate: {title:rich(data.name)}, Email:{email:data.email}, Phone:{phone_number:data.phone || null},
      Location:{rich_text:rich(data.location)}, Availability:{select:{name:data.availability}}, Role:{select:{name:data.role}},
      GitHub:{url:data.github || null}, LinkedIn:{url:data.linkedin || null}, Portfolio:{url:data.portfolio || null},
      'Coolest thing built':{rich_text:rich(data.message)}, 'AI or snack answer':{rich_text:rich(data.ai_or_snack_answer)}, 'Application ID':{rich_text:rich(data.application_id)},
      'Application source':{url:data.source.startsWith('/') ? 'https://dmitri.im'+data.source : data.source}, 'Applied at':{date:{start:new Date().toISOString()}},
      'Final call':{select:{name:'Pending'}},
    },
  };
}

export async function handleJobs(request, env) {
  const origin = request.headers.get('Origin');
  const methodic = METHODIC_ORIGINS.includes(origin);
  let response;
  if (request.method === 'OPTIONS') {
    const url = new URL(request.url);
    const requestedHeaders = (request.headers.get('Access-Control-Request-Headers') || '').toLowerCase().split(',').map(header => header.trim()).filter(Boolean);
    if (!methodic || url.pathname !== '/api/jobs/apply' || request.headers.get('Access-Control-Request-Method') !== 'POST' || requestedHeaders.some(header => !['content-type', 'accept'].includes(header))) return reply({error:'Invalid request origin or preflight.'},403);
    response = new Response(null,{status:204,headers:{'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type, Accept','Access-Control-Max-Age':'600'}});
  } else {
    response = await handleJobsRequest(request, env);
  }
  if (!methodic) return response;
  const result = new Response(response.body,response);
  result.headers.set('Access-Control-Allow-Origin',origin);
  result.headers.append('Vary','Origin');
  return result;
}

async function handleJobsRequest(request, env) {
  const url = new URL(request.url);
  if (url.pathname === '/api/jobs/status' && request.method === 'GET') return reply({available:Boolean(env.NOTION_JOBS_TOKEN && env.JOBS_APPLICATIONS && env.JOBS_RATE_LIMIT)});
  if (url.pathname !== '/api/jobs/apply') return reply({error:'Not found.'},404);
  if (request.method !== 'POST') return reply({error:'Method not allowed.'},405);
  const origin = request.headers.get('Origin');
  const local = ['localhost','127.0.0.1'].includes(url.hostname);
  if ((origin !== url.origin && !METHODIC_ORIGINS.includes(origin)) || (!local && !['dmitri.im','www.dmitri.im'].includes(url.hostname))) return reply({error:'Invalid request origin.'},403);
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) return reply({error:'Expected JSON.'},415);
  if (!env.NOTION_JOBS_TOKEN || !env.JOBS_APPLICATIONS || !env.JOBS_RATE_LIMIT) return unavailable();
  const limited = await env.JOBS_RATE_LIMIT.limit({key:request.headers.get('CF-Connecting-IP') || 'local'});
  if (!limited.success) return reply({error:'Too many attempts. Please wait a minute and try again.'},429);
  let data;
  try {
    // Bound the body while reading, including chunked requests.
    const reader = request.body?.getReader();
    if (!reader) return reply({error:'Application is missing.'},400);
    let size = 0; const chunks = [];
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 64000) {await reader.cancel(); return reply({error:'Application is too large.'},413);}
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk,offset);offset += chunk.length;}
    data = validateApplication(JSON.parse(new TextDecoder().decode(bytes)));
    if (METHODIC_ORIGINS.includes(origin) && (!METHODIC_SOURCES.includes(data.source) || new URL(data.source).origin !== origin)) throw new Error('Invalid application source.');
  } catch (error) {return reply({error:error instanceof SyntaxError ? 'Invalid application.' : error.message},400);}
  if (data._gotcha) return reply({ok:true});
  const id = env.JOBS_APPLICATIONS.idFromName(data.application_id);
  return env.JOBS_APPLICATIONS.get(id).fetch(new Request('https://jobs.internal/apply',{method:'POST',body:JSON.stringify(data)}));
}

// One serialized, durable record per submission. Store only a digest and delivery
// state here; candidate details remain in the request and the private Notion row.
export class JobsApplication {
  constructor(state, env) {this.state=state;this.env=env;}
  async notion(path, body) {
    return fetch('https://api.notion.com/v1/'+path, {
      method:'POST',headers:{Authorization:`Bearer ${this.env.NOTION_JOBS_TOKEN}`,'Notion-Version':'2025-09-03','Content-Type':'application/json'},
      body:JSON.stringify(body),signal:AbortSignal.timeout(10000),
    });
  }
  async fetch(request) {
    const data = validateApplication(await request.json());
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data)))),b=>b.toString(16).padStart(2,'0')).join('');
    return this.state.blockConcurrencyWhile(async () => {
      let record = await this.state.storage.get('delivery');
      if (record && record.digest !== digest) return reply({error:'This submission is already being processed. Please reload before sending a different application.'},409);
      if (record?.status === 'sent') return reply({ok:true});
      try {
        const found = await this.notion(`data_sources/${DATA_SOURCE}/query`,{filter:{property:'Application ID',rich_text:{equals:data.application_id}},page_size:1});
        if (!found.ok) return unavailable();
        const matches = await found.json();
        if (matches.results?.length) {
          await this.state.storage.put('delivery',{digest,status:'sent'});return reply({ok:true});
        }
        // A timed-out creation may have succeeded. Never create a second row on
        // retry until the first outcome can be reconciled from Notion.
        if (record?.status === 'pending') return reply({error:'We are still confirming your application. Please try again shortly.'},503);
        await this.state.storage.put('delivery',{digest,status:'pending'});
        const created = await this.notion('pages',notionPage(data));
        if (!created.ok) {
          if (created.status >= 400 && created.status < 500 && created.status !== 408) await this.state.storage.delete('delivery');
          return unavailable();
        }
        const page = await created.json();
        if (!page.id) return unavailable();
        await this.state.storage.put('delivery',{digest,status:'sent'});
        return reply({ok:true});
      } catch {return unavailable();}
    });
  }
}
