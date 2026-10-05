'use strict';
const $ = id => document.getElementById(id);
const key = 'clara-review-v2-records';
const fields = ['pool','july-mode','july-custom','july-basis','defendant','service','deadline','reviewer','notes'];
const checks = [...document.querySelectorAll('.checklist input')];
const money = n => n.toLocaleString('en-US', {style:'currency', currency:'USD'});
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
let model;
try {
  const saved = JSON.parse(localStorage.getItem(key) || 'null');
  if (saved && typeof saved === 'object') {
    for (const id of fields) if (typeof saved[id] === 'string') $(id).value = saved[id];
    for (const el of checks) el.checked = saved[el.id] === true;
  }
} catch { $('save-status').textContent = 'Browser storage is unavailable. Download your review notes before leaving.'; }
function snapshot() {
  return {...Object.fromEntries(fields.map(id => [id, $(id).value])), ...Object.fromEntries(checks.map(el => [el.id, el.checked]))};
}
function save() {
  try { localStorage.setItem(key, JSON.stringify(snapshot())); $('save-status').textContent = 'Saved in this browser only. Not synced to Alex or Dmitri.'; }
  catch { $('save-status').textContent = 'Could not save in this browser. Download your review notes.'; }
}
function render() {
  const pool = Number($('pool').value);
  const mode = $('july-mode').value;
  $('custom-wrap').hidden = mode !== 'custom';
  const july = mode === 'none' ? 0 : mode === 'room' || mode === 'pending' ? 671.77 : mode === 'quarter' ? 620.97 : mode === 'custom' ? Number($('july-custom').value) : 2483.87;
  const valid = $('pool').value !== '' && Number.isFinite(pool) && pool >= 3364.97 && pool <= 11000 && (mode !== 'custom' || ($('july-custom').value !== '' && Number.isFinite(july) && july >= 0 && july <= 10000));
  $('math-error').textContent = valid ? '' : 'Enter a refund pool from $3,364.97 to $11,000 and a valid July amount from $0 to $10,000.';
  for (const el of document.querySelectorAll('[data-copy],#download')) el.disabled = !valid;
  if (!valid) {
    model = null;
    $('hero-total').textContent = 'Check inputs';
    $('math-body').replaceChildren();
    $('ratio-note').textContent = '';
    for (const id of ['demand','ag-draft','dmitri-draft','alex-draft']) $(id).textContent = 'Draft unavailable until invalid worksheet inputs are corrected.';
    renderReview();
    return;
  }
  const ratio = 5475 / 11000;
  const dRatio = 2975 / 5475;
  const dGross = 2975, aGross = 2500, gross = 5475;
  const dAccepted = round(175*2975/11000), aAccepted = round(175*2500/11000), accepted = round(dAccepted+aAccepted);
  // Nick's table includes internal transfers: Dmitri -193.50; Alex +156.50.
  // Preserve these separately so refund-check ratios do not become ownership shares.
  const dDeposit = round(dGross-dAccepted-193.50-1655.06);
  const aDeposit = round(aGross-aAccepted+156.50-1709.91);
  const deposit = round(dDeposit+aDeposit);
  const dAug = round(2975*3/31), aAug = round(2500*3/31), aug = round(dAug+aAug);
  const dTotal = round(dDeposit+dAug+july), aTotal = round(aDeposit+aAug), total = round(dTotal+aTotal);
  model = {pool,ratio,gross,accepted,deposit,aug,july,dDeposit,aDeposit,dAug,aAug,dTotal,aTotal,total};
  const rows = [
    ['Deposit contributions in Nick’s table',gross,dGross,aGross,''],
    ['Accepted lightbulbs',-accepted,-dAccepted,-aAccepted,''],
    ['Roommate cost adjustments (review)',-37,-193.50,156.50,''],
    ['Refund checks credited (receipt unverified)',-3364.97,-1655.06,-1709.91,''],
    ['Deposit balance',deposit,dDeposit,aDeposit,'subtotal'],
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
  $('ratio-note').textContent = `Nick’s September 14 table: Dmitri $2,975 / $11,000 (27.045455%); Alex $2,500 / $11,000 (22.727273%); combined 49.772727%. Internal costs reduce Dmitri’s check by $193.50 and increase Alex’s by $156.50. The $6,835 pre-adjustment pool already corrects the statement’s $25 error; do not add it twice. These transfers still need both claimants’ agreement. July is assigned only to Dmitri.`;
  drafts(); renderReview();
}
function drafts() {
  const m = model, defendant = $('defendant').value.trim() || '[VERIFY LEGAL DEFENDANT]', address = $('service').value.trim() || '[VERIFY DEFENDANT STREET ADDRESS AND ZIP]';
  const deadline = /^\d{4}-\d{2}-\d{2}$/.test($('deadline').value) ? new Date(`${$('deadline').value}T12:00:00`).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '[CONFIRM DEADLINE]';
  const warning = 'DRAFT FOR REVIEW ONLY. Amounts use Nick’s September 14 contribution table and proposed roommate cost adjustments. Confirm agreement with those adjustments, payment clearance, service address, and abatement dates and basis before use. Fill all bracketed fields.\n\n';
  const julyBasis = $('july-basis').value.trim() || '[CONFIRM actual rent share, affected space, duration, other bathroom access, and valuation]';
  const julyText = m.july ? ` We also propose ${money(m.july)} for Dmitri’s July 1–7 loss of use, subject to this factual basis: ${julyBasis}.` : ' No July abatement is included in this version.';
  $('demand').textContent = warning + `Clara,\n\nWe have not received the remaining documentation you said you would forward on September 21. [Confirm no later response before sending.]\n\nWe continue to dispute the deductions other than the $175 in lightbulbs. We dispute the tenant-damage explanation for the cabinetry beneath the temporary AC you provided and the amount charged for the repair. Please provide the remaining invoices or estimates and an explanation of the $25 accounting discrepancy. Please also send the release Nick reportedly signed. We did not authorize him to settle our claims.\n\nUsing the allocation currently available to us and crediting the reported $3,364.97 in refunds, our provisional remaining deposit balance is ${money(m.deposit)}. We also seek ${money(m.aug)} for our share of August 29–31 rent due to construction-related loss of use.${julyText} Our combined proposed claim is ${money(m.total)}, subject to reconciliation of the original records.\n\nFollowing our October 4 notice, this optional settlement proposal would allow until ${deadline} to resolve payment. We otherwise maintain the position stated in our October 4 email. [Decide whether to offer a new deadline before sending this optional follow-up.]\n\nProviding an address or retaining a partial refund does not reflect our agreement with the deductions or authorization of Nick’s purported release. We reserve our remaining claims.\n\nDmitri Mirakyan and Alexander Nie\n[Both claimants to review; verify reply-all recipients before sending.]`;
  $('ag-draft').textContent = warning + `Complainant: [Choose Dmitri Mirakyan or Alexander Nie as primary filer; provide current address, phone, and email privately.]\nCo-claimant: [Identify the other tenant and confirm participation.]\nRespondent: ${defendant}\nRespondent address: ${address}\nContact in correspondence: Clara Lorenz Chan, for Chan Clan Holdings.\nProperty: 188 S 8th St, Apt PH, Brooklyn, NY 11211.\nLease: September 1, 2025 through August 31, 2026. Rent and deposit: $11,000 each.\n\nWe request assistance recovering our disputed security-deposit shares. On September 9, 2026, the landlord sent an accounting with 11 deductions totaling $4,165. Its financial summary instead subtracts $4,190. Nick’s September 14 allocation used the corrected $6,835 pool and then applied roommate moving and cleaning adjustments. On September 15, we accepted only $175 for two lightbulb items and disputed the rest, requesting supporting documents.\n\nA co-tenant, Nick Metzler, said he signed a release on everyone’s behalf. We did not authorize him to settle our shares and objected in writing on September 15 and 16. We reiterated our reservation of rights on September 17. The actual release still needs to be obtained. On October 4 at 9:40 PM, Dmitri sent a further email stating that we would proceed with an AG complaint and Small Claims.\n\nOn September 21, Clara provided Jose Carpentry Invoice #5 for $3,000, dated September 1, covering items 1–3. We dispute its attribution of lower-bedroom cabinetry damage to tenant negligence because that area was beneath a temporary AC she supplied. We also dispute the extent and cost of the work. The reviewed dispute threads contain no further invoices for items 4, 5, 7, 9–11 as of October 4. The invoice shows Paid $0.00; that does not by itself establish whether reasonable repair costs are recoverable.\n\nReported partial refunds are $1,655.06 to Dmitri and $1,709.91 to Alexander. [Confirm actual receipt and clearance.] The provisional remaining deposit request is ${money(m.deposit)} combined, comprising ${money(m.dDeposit)} for Dmitri and ${money(m.aDeposit)} for Alexander. Attach the reconciled contribution and allocation schedule before submission. We request review of the accounting and assistance recovering the amount improperly withheld.\n\nSeparate construction-related rent abatements are reserved for court and are not included in this deposit-only relief request. [Disclose any pending court case or prior agency complaint truthfully where requested.]`;
  function statement(name,deposit,aug,july,total) {
    return warning + `CIV-SC-50 supporting statement / ${name}\nClaimant address, phone, email: [COMPLETE PRIVATELY]\nDefendant: ${defendant}\nDefendant address: ${address}\nAmount: ${money(total)}\nPrimary reason: Failure to return security.\nOther: Related rent-abatement claim for construction-related loss of use.\nDates: Deposit accounting September 9, 2026; alleged construction August 29–31, 2026${july ? '; July 1–7 [VERIFY YEAR AND DATES]' : ''}. Confirm actual refund and vacancy dates.\n\nI was a tenant at 188 S 8th St, Apt PH, Brooklyn, NY 11211, under a lease running September 1, 2025 through August 31, 2026. Monthly rent and the total security deposit were each $11,000. I seek only my own share: ${money(deposit)} in disputed security-deposit deductions after crediting my reported refund and the roommate adjustments in Nick’s table (subject to my confirmation), plus ${money(aug)} for my share of August 29–31 rent for loss of use due to construction${july ? `, and ${money(july)} for July 1–7 loss of use` : ''}.\n\nWe accepted $175 in combined lightbulb charges but dispute the other deductions. We dispute the invoice’s tenant-negligence explanation and the repair cost for cabinetry beneath landlord-provided temporary AC equipment. Further deductions remain insufficiently substantiated in the correspondence reviewed by us. Attach the actual accounting, photographs, correspondence, and the reconciled damages schedule.\n\nI did not authorize Nick Metzler to settle my claim or sign a release for me, and I disputed his asserted authority promptly in writing. I request determination of my deposit and rent-abatement claims based on the lease and supporting evidence, with credit for all payments received. ${july ? `July valuation basis: ${julyBasis}.` : ''}\n\nRelated claim: [Identify the other co-tenant’s separate case if filed; ask the clerk about coordination.]\nSignature and date: [CLAIMANT TO SIGN AFTER REVIEW]`;
  }
  $('dmitri-draft').textContent = statement('Dmitri Mirakyan',m.dDeposit,m.dAug,m.july,m.dTotal);
  $('alex-draft').textContent = statement('Alexander Nie',m.aDeposit,m.aAug,0,m.aTotal);
}
function renderReview() {
  const count = checks.filter(el => el.checked).length;
  const unresolved = !model || !$('defendant').value.trim() || !$('service').value.trim() || $('july-mode').value === 'pending' || !$('deadline').value || !$('reviewer').value.trim() || (model.july > 0 && !$('july-basis').value.trim());
  $('review-status').textContent = `${count} of ${checks.length} review checks marked on this device. ` + (count === checks.length && !unresolved ? 'Review checklist complete locally. Export for Dmitri’s review; signatures, official forms, final approval, and filing are still required.' : 'Review remains open. Resolve the unchecked items, required fields, and July decision before finalizing.');
  if (model && (model.dTotal > 10000 || model.aTotal > 10000)) $('review-status').textContent += ' This scenario exceeds the $10,000 limit for at least one claimant. Do not file it as shown.';
}
function download(name,text) {
  const url = URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url),1000);
}
for (const id of fields) $(id).addEventListener('input', () => {
  if (['pool','july-mode','july-custom','july-basis','defendant','service','deadline'].includes(id)) for (const el of checks) el.checked = false;
  render(); save();
});
for (const el of checks) el.addEventListener('change', () => { renderReview(); save(); });
for (const button of document.querySelectorAll('[data-copy]')) button.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($(button.dataset.copy).textContent); $('action-status').textContent = 'Draft copied. Review all provisional figures and placeholders before use.'; }
  catch { $('action-status').textContent = 'Clipboard access unavailable. Select the draft text and copy it manually.'; }
});
$('download').addEventListener('click', () => download('clara-draft-statements.txt', ['CLARA CASE WORKSPACE / DRAFT ONLY',`Exported ${new Date().toISOString()}`,...['demand','ag-draft','dmitri-draft','alex-draft'].map(id => $(id).textContent)].join('\n\n================================\n\n')));
$('export-review').addEventListener('click', () => download('clara-review-notes.txt', `CLARA CASE REVIEW / NOT A SIGNATURE OR FILING AUTHORIZATION\nExported: ${new Date().toISOString()}\nReviewer: ${$('reviewer').value || '[not entered]'}\n\n${$('review-status').textContent}\n\n${checks.map(el => `${el.checked ? '[x]' : '[ ]'} ${el.parentElement.textContent.trim()}`).join('\n')}\n\nWORKSHEET / FIELDS\n${fields.filter(id => !['notes','reviewer'].includes(id)).map(id => `${id}: ${$(id).value || '[blank]'}`).join('\n')}\n\nCALCULATED VALUES\n${model ? JSON.stringify(model,null,2) : 'Invalid inputs'}\n\nNOTES\n${$('notes').value}\n\nEdits are local to the reviewing browser and are not automatically shared.`));
let printDetails = [];
window.addEventListener('beforeprint', () => { printDetails = [...document.querySelectorAll('details')].map(el => [el,el.open]); for (const [el] of printDetails) el.open = true; });
window.addEventListener('afterprint', () => { for (const [el,open] of printDetails) el.open = open; });
$('print').addEventListener('click', () => window.print());
render();
