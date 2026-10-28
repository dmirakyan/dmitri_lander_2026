import json
import httpx
import pytest
from app.browser import create_hosted_session
from app.errors import FlowBlocked

async def test_paid_features_unavailable_falls_back_without_dropping_privacy_or_context():
    requests=[]
    def respond(request):
        requests.append(json.loads(request.content))
        return httpx.Response(402 if len(requests)==1 else 201,json={} if len(requests)==1 else {'id':'basic-session'})
    payload={'projectId':'project','proxies':True,'timeout':900,'browserSettings':{'context':{'id':'saved-context','persist':True},'solveCaptchas':True,'recordSession':False,'logSession':False}}
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        session,basic=await create_hosted_session(client,{'browserbase_api_key':'test'},payload)
    assert session['id']=='basic-session' and basic
    assert requests[1]['proxies'] is False and requests[1]['browserSettings']['solveCaptchas'] is False
    assert requests[1]['browserSettings']['context']==payload['browserSettings']['context']
    assert requests[1]['browserSettings']['recordSession'] is False
    assert requests[1]['browserSettings']['logSession'] is False
    assert payload['proxies'] is True

async def test_invalid_credentials_do_not_trigger_a_second_request():
    requests=[]
    def respond(request):
        requests.append(request);return httpx.Response(401,json={})
    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        with pytest.raises(FlowBlocked,match='HTTP 401'):
            await create_hosted_session(client,{'browserbase_api_key':'test'},{'browserSettings':{}})
    assert len(requests)==1
