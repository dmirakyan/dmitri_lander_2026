import json
import httpx
import pytest
from cryptography.fernet import Fernet
from app import agent
from app.errors import FlowBlocked
from app.store import Store


@pytest.mark.parametrize('status', ['completed', 'incomplete'])
async def test_inventory_terminal_response_and_charge_accounting(tmp_path,monkeypatch,status):
    store=Store('sqlite:///'+str(tmp_path/'inventory.db'),Fernet.generate_key())
    def respond(request):
        assert json.loads(request.content)['reasoning']['effort']=='low'
        return httpx.Response(200,json={
            'id':'resp_test','object':'response','created_at':1,'model':'gpt-5-mini',
            'status':status,'incomplete_details':{'reason':'max_output_tokens'} if status=='incomplete' else None,
            'output':[] if status=='incomplete' else [{'id':'msg_test','type':'message','status':'completed','role':'assistant','content':[{'type':'output_text','text':'{"offers":[],"closed":["Closed show"],"blockers":[]}','annotations':[]}]}],
            'usage':{'input_tokens':1000,'output_tokens':2000,'total_tokens':3000,
                     'input_tokens_details':{'cached_tokens':0},'output_tokens_details':{'reasoning_tokens':1000}},
        })
    class MockClient(httpx.AsyncClient):
        def __init__(self,**kwargs):super().__init__(transport=httpx.MockTransport(respond),**kwargs)
    monkeypatch.setattr(agent.httpx,'AsyncClient',MockClient)
    if status=='incomplete':
        with pytest.raises(FlowBlocked,match='output limit'):
            await agent.inventory('broadway_direct','Observed page',{'openai_api_key':'test-key'},store)
    else:
        result=await agent.inventory('broadway_direct','Observed page',{'openai_api_key':'test-key'},store)
        assert result.closed==['Closed show']
    diagnostic=store.get('model:broadway_direct')
    assert diagnostic['status']==status
    assert 'test-key' not in json.dumps(diagnostic)
    assert store.list('budget:')[0]['reserved_microdollars']==4250
