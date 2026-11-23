'use strict';
const status = document.getElementById('access-status');
const secret = new URLSearchParams(location.hash.slice(1)).get('access') || 'JOnbUhzfECVmWmisyMJCBZ-WAu2WYRqGTWUQCXpWBEU';
const files = [...document.querySelectorAll('[data-file]')];
const photoStatus = document.getElementById('photo-status');
document.querySelectorAll('.record-nav a').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  document.querySelector(link.getAttribute('href'))?.scrollIntoView({behavior:'smooth'});
}));
status.textContent = '';
function decodeKey(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
let keyPromise;
async function decrypt(name) {
  keyPromise ||= crypto.subtle.importKey('raw', decodeKey(secret), 'AES-GCM', false, ['decrypt']);
  const key = await keyPromise;
  const response = await fetch(`files/${name}`);
  if (!response.ok) throw new Error('File unavailable');
  const payload = new Uint8Array(await response.arrayBuffer());
  return crypto.subtle.decrypt(
    {name:'AES-GCM', iv:payload.slice(0,12), additionalData:new TextEncoder().encode(name)},
    key, payload.slice(12)
  );
}
for (const [id,name] of [['july-photos','july-contact-sheet.jpg.bin'],['august-photos','august-contact-sheet.jpg.bin']]) {
  const photo = document.getElementById(id);
  decrypt(name).then(plain => {
    photo.src = URL.createObjectURL(new Blob([plain], {type:'image/jpeg'}));
    photo.hidden = false;
  }).catch(() => { photoStatus.textContent = 'Photo preview unavailable.'; });
}
files.forEach(button => button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Preparing download…';
  try {
    const plain = await decrypt(button.dataset.file);
    const url = URL.createObjectURL(new Blob([plain], {type:button.dataset.type || 'application/pdf'}));
    const link = document.createElement('a');
    link.href = url; link.download = button.dataset.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    status.textContent = `${button.dataset.name} downloaded.`;
  } catch {
    status.textContent = 'Download failed. Reload this page and try again.';
  } finally {
    button.disabled = false;
  }
}));
