'use strict';
const status = document.getElementById('access-status');
const secret = new URLSearchParams(location.hash.slice(1)).get('access');
const files = [...document.querySelectorAll('[data-file]')];
const photo = document.getElementById('august-photos');
const photoStatus = document.getElementById('photo-status');
document.querySelectorAll('.record-nav a').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  document.querySelector(link.getAttribute('href'))?.scrollIntoView({behavior:'smooth'});
}));
if (!secret) {
  status.textContent = 'Open the document link from this chat to download the PDFs.';
  files.forEach(button => button.disabled = true);
} else {
  status.textContent = '';
}
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
if (secret && photo) {
  decrypt('august-contact-sheet.jpg.bin').then(plain => {
    photo.src = URL.createObjectURL(new Blob([plain], {type:'image/jpeg'}));
    photo.hidden = false;
  }).catch(() => { photoStatus.textContent = 'Photo preview unavailable; the source list remains below.'; });
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
    status.textContent = 'This document link could not be opened. Use the direct PDF links in the chat.';
  } finally {
    button.disabled = false;
  }
}));
