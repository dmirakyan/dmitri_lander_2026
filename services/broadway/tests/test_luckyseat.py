import pytest
from app.providers import luckyseat_result_matches


def test_luckyseat_results_require_exact_performance_and_quantity():
    entry={'show':'Hadestown','performance':'2026-11-07T19:30:00-05:00','tickets':2}
    row='Hadestown\nNew York, NY\nNov 7 at 7:30 PM\n2 ticket(s)\nDrawing on Friday, November 6, 2026'
    assert luckyseat_result_matches(row,entry)
    for wrong in (row.replace('Hadestown','Hadestown Tour'),row.replace('7:30 PM','2:00 PM'),
                  row.replace('Nov 7','Nov 8'),row.replace('2 ticket(s)','1 ticket(s)'),
                  row.replace('2026','2025'),row.replace('New York, NY','Boston, MA'),
                  row.replace('Drawing on Friday, November 6, 2026','Lost')):
        assert not luckyseat_result_matches(wrong,entry)


def test_luckyseat_result_year_boundary():
    entry={'show':'Hadestown','performance':'2027-01-01T19:00:00-05:00','tickets':2}
    row='Hadestown\nNew York, NY\nJan 1 at 7:00 PM\n2 ticket(s)\nDrawing on Thursday, December 31, 2026'
    assert luckyseat_result_matches(row,entry)
    assert not luckyseat_result_matches(row.replace('2026','2025'),entry)


async def test_explicit_captcha_and_luckyseat_performance_dom():
    from pathlib import Path
    from playwright.async_api import async_playwright
    from app.captcha import Captcha
    from app.providers import LuckySeat
    async with async_playwright() as p:
        if not Path(p.chromium.executable_path).exists():pytest.skip('Local Chromium is required for DOM regression checks')
        browser=await p.chromium.launch()
        try:
            page=await browser.new_page()
            await page.route('**/*',lambda route:route.abort())
            await page.set_content('''<div><div>Saturday, November 7, 2026</div><div>
              <div class="form-checkbox-btn"><input type="checkbox" id="44818"><label for="44818">2:00 PM</label></div>
              <div class="form-checkbox-btn"><input type="checkbox" id="44819" disabled><label for="44819">7:30 PM</label></div>
            </div></div><div class="g-recaptcha"><iframe src="https://www.google.com/recaptcha/api2/anchor?k=observed-key&amp;size=normal"></iframe></div>
            <iframe src="https://unrelated.example/recaptcha/api2/anchor?k=wrong-key"></iframe>''')
            adapter=object.__new__(LuckySeat);adapter.page=page
            rows=await adapter.performances()
            assert rows==[
                {'id':'44818','date':'Saturday, November 7, 2026','time':'2:00 PM','disabled':False,'evidence':'Saturday, November 7, 2026\n2:00 PM'},
                {'id':'44819','date':'Saturday, November 7, 2026','time':'7:30 PM','disabled':True,'evidence':'Saturday, November 7, 2026\n7:30 PM'},
            ]
            widgets=await Captcha(None,None).widgets(page)
            assert widgets==[{'sitekey':'observed-key','kind':'recaptcha','invisible':False}]
        finally:await browser.close()
