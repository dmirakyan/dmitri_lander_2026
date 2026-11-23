'use strict';
const $ = id => document.getElementById(id);
const key = 'clara-review-v4-snapshot';
const fields = ['pool','aug-mode','july-mode','july-custom','july-basis','defendant','service'];
const money = n => n.toLocaleString('en-US', {style:'currency', currency:'USD'});
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
let model;
try {
  const saved = JSON.parse(localStorage.getItem(key) || 'null');
  if (saved && typeof saved === 'object') {
    for (const id of fields) if (typeof saved[id] === 'string') $(id).value = saved[id];
  }
} catch { /* The filing defaults remain available without browser storage. */ }
function snapshot() {
  return Object.fromEntries(fields.map(id => [id, $(id).value]));
}
function save() {
  try { localStorage.setItem(key, JSON.stringify(snapshot())); } catch { /* no-op */ }
}
function render() {
  const pool = Number($('pool').value);
  const mode = $('july-mode').value;
  const augMode = $('aug-mode').value;
  $('custom-wrap').hidden = mode !== 'custom';
  const july = mode === 'none' ? 0 : mode === 'room' ? 671.77 : mode === 'quarter' ? 620.97 : mode === 'custom' ? Number($('july-custom').value) : 2483.87;
  const valid = $('pool').value !== '' && Number.isFinite(pool) && pool >= 3364.97 && pool <= 11000 && (mode !== 'custom' || ($('july-custom').value !== '' && Number.isFinite(july) && july >= 0 && july <= 10000));
  $('math-error').textContent = valid ? '' : 'Enter a refund pool from $3,364.97 to $11,000 and a valid July amount from $0 to $10,000.';
  for (const el of document.querySelectorAll('[data-copy],#download')) el.disabled = !valid;
  if (!valid) {
    model = null;
    $('hero-total').textContent = 'Check inputs';
    $('math-body').replaceChildren();
    $('ratio-note').textContent = '';
    for (const id of ['ag-draft','dmitri-draft','alex-draft']) $(id).textContent = 'Draft unavailable until invalid worksheet inputs are corrected.';
    renderReview();
    return;
  }
  const ratio = 5475 / 11000;
  const dGross = 2975, aGross = 2500, gross = 5475;
  const dAccepted = round(175*2975/11000), aAccepted = round(175*2500/11000), accepted = round(dAccepted+aAccepted);
  // Use the pre-transfer deposit allocation, excluding roommate moving/cleaning costs.
  const dRefund = 1848.56, aRefund = 1553.41, refund = round(dRefund+aRefund);
  const dDeposit = round(dGross-dAccepted-dRefund);
  const aDeposit = round(aGross-aAccepted-aRefund);
  const deposit = round(dDeposit+aDeposit);
  const dAug = augMode === 'proposed' ? round(2975*3/31) : 0, aAug = augMode === 'proposed' ? round(2500*3/31) : 0, aug = round(dAug+aAug);
  const dTotal = round(dDeposit+dAug+july), aTotal = round(aDeposit+aAug), total = round(dTotal+aTotal);
  model = {pool,ratio,gross,accepted,deposit,aug,july,dDeposit,aDeposit,dAug,aAug,dTotal,aTotal,total};
  const rows = [
    ['Deposit contributions in Nick’s table',gross,dGross,aGross,''],
    ['Accepted lightbulbs',-accepted,-dAccepted,-aAccepted,''],
    ['Deposit refund allocated before roommate transfers',-refund,-dRefund,-aRefund,''],
    ['Disputed deposit balance',deposit,dDeposit,aDeposit,'subtotal'],
    ['August 29–31 proposal',aug,dAug,aAug,''],
    ['July 1–7 proposal',july,july,0,''],
    ['Proposed claim',total,dTotal,aTotal,'total']
  ];
  $('math-body').replaceChildren(...rows.map(([label,...values]) => {
    const tr = document.createElement('tr'); tr.className = values.pop();
    for (const value of [label,...values]) { const td = document.createElement('td'); td.textContent = typeof value === 'number' ? money(value) : value; tr.append(td); }
    return tr;
  }));
  $('hero-total').textContent = money(total);
  $('ratio-note').textContent = `Nick’s September 14 table allocates $1,848.56 of the deposit refund to Dmitri and $1,553.41 to Alex before roommate transfers. The physical checks were $1,655.06 and $1,709.91 because the table then moved $193.50 away from Dmitri and $156.50 to Alex for roommate costs. Those transfers are excluded from this landlord claim. The $6,835 pool already corrects the statement’s $25 error. July is assigned only to Dmitri.`;
  drafts(); renderReview();
}
function drafts() {
  const m = model, defendant = $('defendant').value.trim() || '[VERIFY LEGAL DEFENDANT]', address = $('service').value.trim() || '[VERIFY DEFENDANT STREET ADDRESS AND ZIP]';
  const warning = 'PROPOSED FILING TEXT — November 23, 2026. The private packet has contact details, evidence copies, and a deposit-only July alternative. No claim has been filed.\n\n';
  const julyBasis = $('july-basis').value.trim() || '[CONFIRM actual rent share, affected space, duration, other bathroom access, and valuation]';
  const julyText = m.july ? ` We also propose ${money(m.july)} for Dmitri’s July 1–7 loss of use, subject to this factual basis: ${julyBasis}.` : ' No July abatement is included in this version.';
  $('ag-draft').textContent = warning + `Primary complainant: Dmitri Mirakyan. Co-claimant: Alexander Nie. Contact details are in the private packet.\nRespondent: ${defendant}\nRespondent address: ${address}\nContact in correspondence: Clara Lorenz Chan, for Chan Clan Holdings.\nProperty: 188 S 8th St, Apt PH, Brooklyn, NY 11211.\nLease: September 1, 2025 through August 31, 2026. Rent and deposit: $11,000 each.\n\nWe request assistance recovering our disputed security-deposit shares. On September 9, 2026, the landlord sent an accounting with 11 deductions totaling $4,165. Its financial summary instead subtracts $4,190. The September 14 allocation used the corrected $6,835 pool and then applied roommate moving and cleaning adjustments. On September 15, we accepted only $175 for two lightbulb items and disputed the rest, requesting supporting documents.\n\nA co-tenant said he signed a release on everyone’s behalf. We did not authorize him to settle our shares and objected in writing on September 15 and 16. We reiterated our reservation of rights on September 17. On October 4 Dmitri sent a further email stating that we would proceed with an AG complaint and Small Claims.\n\nOn September 21, Clara provided Jose Carpentry Invoice #5 for $3,000, dated September 1, covering items 1–3. We dispute its attribution of lower-bedroom cabinetry damage to tenant negligence because that area was beneath a temporary AC she supplied. We also dispute the extent and cost of the work. The reviewed dispute threads contain no further invoices for items 4, 5, 7, 9–11 as of October 4.\n\nDmitri received a $1,655.06 check that he reported uncashed as of November 23, with payment-in-full/release language; Alex cashed his $1,709.91 check. These checks reflect separate roommate transfers, which are excluded from this request. The remaining deposit request is ${money(m.deposit)} combined, comprising ${money(m.dDeposit)} for Dmitri and ${money(m.aDeposit)} for Alexander. We request review of the accounting and assistance recovering the amount improperly withheld.\n\nConstruction-related rent loss is separate and is not included in this deposit-only relief request.`;
  function statement(name,deposit,aug,july,total) {
    return warning + `CIV-SC-50 supporting statement / ${name}\nClaimant contact: see private PDF.\nDefendant: ${defendant}\nLease notice address: ${address}\nBrooklyn property/business address: 188 S 8th St, Brooklyn, NY 11211.\nAmount: ${money(total)}\nPrimary reason: Failure to return security.\nRelated July habitability claim: ${july ? money(july) : 'none'}.\n\nI was a tenant at 188 S 8th St, Apt PH, Brooklyn, NY 11211, under a lease running September 1, 2025 through August 31, 2026. Monthly rent and the total security deposit were each $11,000. I seek only my own share: ${money(deposit)} in disputed security-deposit deductions based on the pre-transfer refund allocation, excluding roommate costs${aug ? `, plus ${money(aug)} for my share of August 29–31 rent for construction-related loss of use` : ''}${july ? `, plus ${money(july)} for July 1–7 bedroom loss of use` : ''}.\n\nWe accepted $175 in combined lightbulb charges but dispute the other deductions. We dispute the invoice’s tenant-negligence explanation and the repair cost for cabinetry beneath landlord-provided temporary AC equipment. Further deductions remain disputed in the correspondence.\n\nI did not authorize Nick Metzler to settle my claim or sign a release for me, and I disputed his asserted authority promptly in writing. I request determination of my deposit claim and any included rent-abatement claim based on the lease and supporting evidence, with credit for all payments actually received. ${july ? `July valuation basis: ${julyBasis}.` : ''}\n\nClaimant signature: ____________________   Date: __________`;
  }
  $('dmitri-draft').textContent = statement('Dmitri Mirakyan',m.dDeposit,m.dAug,m.july,m.dTotal);
  $('alex-draft').textContent = statement('Alexander Nie',m.aDeposit,m.aAug,0,m.aTotal);
}
function renderReview() {
  const m = model;
  $('review-snapshot').textContent = `CLARA / ALEX AI REVIEW SNAPSHOT — November 23, 2026

CLAIMANTS AND CLAIMS
Dmitri Mirakyan: ${m ? money(m.dDeposit) : 'invalid'} disputed deposit${m && m.july ? ` + ${money(m.july)} July bedroom loss = ${money(m.dTotal)}` : ''}.
Alexander Nie: ${m ? money(m.aDeposit) : 'invalid'} disputed deposit${m && m.aAug ? ` + ${money(m.aAug)} August loss` : ''}.
AG deposit complaint: ${m ? money(m.deposit) : 'invalid'} combined. Court statements: ${m ? money(m.total) : 'invalid'} combined, separately filed. No claim for Nick or Joseph.

RECORD
Landlord: ${$('defendant').value || '188 South 8th Street Realty Too, LLC'} (DOS ID 3911580). Property: 188 South 8th Street, Apt PH, Brooklyn NY 11211. Lease September 1, 2025–August 31, 2026; $11,000 monthly rent and deposit.
Contributions: Dmitri $2,975; Alex $2,500. Accepted deductions: lightbulbs $175 total. Pre-roommate-transfer allocated refunds: Dmitri $1,848.56; Alex $1,553.41. Physical checks include unrelated roommate transfers: Dmitri $1,655.06, received but uncashed as last reported; Alex $1,709.91, cashed. The landlord statement lists $4,165 but subtracts $4,190; the $6,835 allocation pool already corrects that $25 and we do not add it again.
September 15: item-by-item deposit objection and construction claim sent to Clara. September 16–17: Dmitri and Alex rejected Nick's claimed release authority and reserved rights. September 21: landlord supplied a $3,000 cabinetry invoice but no other support shown in the reviewed dispute thread. October 4: Dmitri said they would proceed with AG and Small Claims; no later Clara reply found.

CONSTRUCTION EVIDENCE AND CHOICE
Three HEIC photos attached to Dmitri's September 15 sent email: IMG_5374 shows the shower demolished inside the bedroom; IMG_5375 and IMG_5376 show the bed/room surrounded by construction materials. Dmitri confirms full bedroom loss July 1–7 and $2,975 monthly room rent. Proposed value: $2,975 × 7/31 = $671.77. This is an additional court claim, not required for the deposit claim. Six August 29–30 JPEG originals and one video link show work materials and floor protection. The photos do not establish each tenant's loss of use for all August 29–31; August is excluded from the amount.

PROPOSED FILINGS
One Small Claims statement each, primary reason failure to return security; Dmitri also alleges July warranty-of-habitability rent loss. One AG rent-security complaint covers the deposit only. Both use the signed lease, September 9 accounting, September 14 allocation, September 15 objections and photos, September 21 invoice and refund records, September 16–17 release objections, and October 4 follow-up.

REVIEW ONLY WHAT THE RECORD CANNOT SETTLE
1. Check/release: exact printed terms and whether Dmitri deposits the expiring $1,655.06 check with an explicit reservation; preserve both sides, notice, and bank proof. Alex has already cashed his check.
2. July proof: three September 15 attachments show the demolished shower and disrupted room, but their capture dates and the entire seven-day duration are not yet independently verified. Decide whether to keep the $671.77 add-on in Dmitri's court amount.
3. Court mailing: proposed address is ${$('service').value || 'the lease notice address'}; the NYC business/property address is 188 South 8th Street, Brooklyn NY 11211. Confirm what the Kings County clerk will accept for the LLC.

Please return only corrections or material objections. The site drafts are the proposed text, and private claimant contact details are outside this public snapshot.`;
  $('review-status').textContent = m && (m.dTotal > 10000 || m.aTotal > 10000) ? 'This scenario exceeds the $10,000 Small Claims limit.' : 'Snapshot reflects the current calculation and filing drafts.';
}
function download(name,text) {
  const url = URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
for (const id of fields) $(id).addEventListener('input', () => {
  render(); save();
});
for (const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($(button.dataset.copy).textContent); $('action-status').textContent = 'Draft copied. Review all provisional figures and placeholders before use.'; }
  catch { $('action-status').textContent = 'Clipboard access unavailable. Select the draft text and copy it manually.'; }
});
$('download').addEventListener('click', () => download('clara-draft-statements.txt', ['CLARA CASE WORKSPACE / DRAFT ONLY',`Exported ${new Date().toISOString()}`,...['ag-draft','dmitri-draft','alex-draft'].map(id => $(id).textContent)].join('\n\n================================\n\n')));
$('export-review').addEventListener('click', () => download('clara-alex-ai-snapshot.txt', $('review-snapshot').textContent));
$('copy-review').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('review-snapshot').textContent); $('review-status').textContent = 'Snapshot copied for Alex’s AI.'; }
  catch { $('review-status').textContent = 'Clipboard unavailable; download the snapshot instead.'; }
});
let printDetails = [];
window.addEventListener('beforeprint', () => { printDetails = [...document.querySelectorAll('details')].map(el => [el,el.open]); for (const [el] of printDetails) el.open = true; });
window.addEventListener('afterprint', () => { for (const [el,open] of printDetails) el.open = open; });
$('print').addEventListener('click', () => window.print());
render();
