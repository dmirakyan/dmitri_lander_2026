import pytest
from cryptography.fernet import Fernet
from app.store import Store
from app.budget import reserve, settle
from app.errors import FlowBlocked


def test_uncertain_charges_survive_restart_and_block_overspending(tmp_path):
    url='sqlite:///'+str(tmp_path/'budget.db')
    encryption=Fernet.generate_key()
    first=Store(url,encryption)
    reservation=reserve(first,'openai',1.4)
    restarted=Store(url,encryption)
    with pytest.raises(FlowBlocked,match='Monthly spending limit'):
        reserve(restarted,'openai',0.11)
    settle(restarted,reservation,0.2)
    reserve(first,'openai',1.3)
    with pytest.raises(FlowBlocked):
        reserve(first,'openai',0.01)


def test_captcha_has_separate_small_allowance(tmp_path):
    store=Store('sqlite:///'+str(tmp_path/'budget.db'),Fernet.generate_key())
    reserve(store,'captcha',0.5)
    with pytest.raises(FlowBlocked):
        reserve(store,'captcha',0.02)
    reserve(store,'openai',0.03)
