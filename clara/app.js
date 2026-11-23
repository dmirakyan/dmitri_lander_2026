'use strict';
const status = document.getElementById('access-status');
const secret = new URLSearchParams(location.hash.slice(1)).get('access');
const files = [...document.querySelectorAll('[data-file]')];
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
files.forEach(button => button.addEventListener('click', async () => {
  button.disabled = true;
  status.textContent = 'Preparing PDF…';
  try {
    const key = await crypto.subtle.importKey('raw', decodeKey(secret), 'AES-GCM', false, ['decrypt']);
    const response = await fetch(`files/${button.dataset.file}`);
    if (!response.ok) throw new Error('File unavailable');
    const payload = new Uint8Array(await response.arrayBuffer());
    const plain = await crypto.subtle.decrypt(
      {name:'AES-GCM', iv:payload.slice(0,12), additionalData:new TextEncoder().encode(button.dataset.file)},
      key, payload.slice(12)
    );
    const url = URL.createObjectURL(new Blob([plain], {type:'application/pdf'}));
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
