from datetime import datetime
from zoneinfo import ZoneInfo
from pydantic import BaseModel, Field
from .store import key
import re

NY = ZoneInfo('America/New_York')
PROVIDERS = ('broadway_direct', 'telecharge', 'lucky_seat')


def canonical_show(show):
    return re.sub(r'\s*\(NY\)\s*$','', ' '.join(show.split()),flags=re.I).casefold()


def entry_identity(provider,show,performance):
    if performance.tzinfo is None:raise ValueError('Performance timezone is missing')
    return key(f'{provider}|{canonical_show(show)}|{performance.astimezone(NY).isoformat()}')


class Offer(BaseModel):
    provider: str
    show: str
    performance: datetime
    drawing: str
    url: str
    price: float = Field(ge=0)
    total_price_including_fees: bool
    tickets: int = Field(ge=1, le=2)
    broadway: bool
    evidence: str
    locator: str = ''

    @property
    def identity(self):
        # Performance identity survives provider drawing-label changes.
        return entry_identity(self.provider,self.show,self.performance)


def eligibility(profile, offer, now=None):
    now = now or datetime.now(NY)
    auth = profile.get('lottery_action_authorization', {})
    if not all(auth.get(k) is True for k in ('free_entries','required_lottery_terms','captcha_completion')):
        return 'Standing authorization is not configured'
    if offer.provider not in PROVIDERS or not offer.broadway:
        return 'Not a supported NYC Broadway lottery'
    if offer.performance.tzinfo is None:
        return 'Performance timezone is missing'
    local = offer.performance.astimezone(NY)
    if local <= now:
        return 'Performance is in the past'
    if not offer.evidence.strip() or not offer.drawing.strip():
        return 'Missing provider evidence or drawing identity'
    excluded = profile.get('show_preferences', {}).get('excluded', [])
    if any(s.casefold() in offer.show.casefold() for s in excluded):
        return 'Excluded show'
    if offer.tickets != profile.get('ticket_count', 2):
        return 'Ticket count differs from your preference'
    if not offer.total_price_including_fees:
        return 'Price including required fees has not been established'
    if offer.price > profile.get('max_price_per_ticket_usd',100):
        return 'Over ticket price limit'
    prefs = profile.get('attendance_preferences', {})
    for dates in prefs.get('unavailable_date_ranges', []):
        if dates['start'] <= local.date().isoformat() <= dates['end']:
            return 'Away from NYC / unavailable'
    if local.weekday() < 5 and local.strftime('%H:%M') < prefs.get('weekdays',{}).get('earliest_start','18:00'):
        return 'Weekday performance starts too early'
    return None
