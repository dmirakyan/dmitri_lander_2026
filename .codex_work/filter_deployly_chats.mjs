import { execFileSync } from "node:child_process";

const db = "/Users/dmitri/Library/Messages/chat.db";
const sql = `
SELECT m.ROWID message_id,
 datetime(m.date/1000000000 + 978307200,'unixepoch','localtime') sent_at,
 m.is_from_me, coalesce(h.id,'') sender, j.chat_id,
 coalesce(c.display_name,c.chat_identifier,'') chat_name,
 m.text, hex(m.attributedBody) attributed_hex
FROM message m
JOIN chat_message_join j ON j.message_id=m.ROWID
JOIN chat c ON c.ROWID=j.chat_id
LEFT JOIN handle h ON h.ROWID=m.handle_id
WHERE j.chat_id IN (170,1843,1998)
  AND datetime(m.date/1000000000 + 978307200,'unixepoch','localtime') >= '2026-06-01 00:00:00'
  AND datetime(m.date/1000000000 + 978307200,'unixepoch','localtime') < '2026-09-02 00:00:00'
ORDER BY m.date;`;

const raw = execFileSync("/usr/bin/sqlite3", ["-readonly", "-json", db, sql], {encoding:"utf8", maxBuffer:256*1024*1024});
const rows = JSON.parse(raw || "[]");

function decodeAttributed(hex) {
  if (!hex) return "";
  const buf = Buffer.from(hex, "hex");
  const ns = buf.indexOf(Buffer.from("NSString"));
  if (ns < 0) return "";
  const marker = Buffer.from([0x01,0x94,0x84,0x01,0x2b]);
  const markerAt = buf.indexOf(marker, ns + 8);
  if (markerAt < 0) return "";
  let pos = markerAt + marker.length;
  const tag = buf[pos++];
  let length;
  if (tag < 0x80) length=tag;
  else if (tag===0x81) {length=buf.readUInt16LE(pos);pos+=2;}
  else if (tag===0x82) {length=buf.readUInt32LE(pos);pos+=4;}
  else return "";
  return buf.subarray(pos,Math.min(pos+length,buf.length)).toString("utf8").trim();
}

const number = /(?:[$€£]\s*)?[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:%|[kKmMbB])?/;
const finance = /reimburs|expense|personal|google|gemini|card|paid|payment|charge|cost|spend|wire|transfer|invoice|receipt|mercury|ramp|flight|hotel|airbnb|uber|lyft|amazon|subscription|ads?/i;
const decoded = rows.map(r => ({...r, body:String(r.text || decodeAttributed(r.attributed_hex) || "").replace(/\s+/g," ").trim()}));

for (let i=0;i<decoded.length;i++) {
  const r=decoded[i];
  if (r.chat_id !== 170) continue;
  if (!((r.message_id >= 255900 && r.message_id <= 256030) || (r.message_id >= 257080 && r.message_id <= 257125) || (r.message_id >= 229400 && r.message_id <= 230620))) continue;
  console.log(`${r.sent_at}\tchat ${r.chat_id}\t${r.message_id}\t${r.is_from_me?'ME':r.sender}\t${r.body}`);
}
