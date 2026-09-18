import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const db = "/Users/dmitri/Library/Messages/chat.db";
const outputDir = "/Users/dmitri/Documents/GitHub/dmitri_landing_v2/outputs/imessage_numeric_dump_2026-09-01";
const outputPath = `${outputDir}/imessage_numbers_last_2_months.xlsx`;
const previewPath = `${outputDir}/preview.png`;

const sql = `
SELECT
  m.ROWID AS message_id,
  datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') AS sent_at,
  m.is_from_me,
  COALESCE(h.id, '') AS sender,
  COALESCE((SELECT MIN(chat_id) FROM chat_message_join WHERE message_id=m.ROWID), '') AS chat_id,
  COALESCE((SELECT c.display_name FROM chat_message_join j JOIN chat c ON c.ROWID=j.chat_id WHERE j.message_id=m.ROWID LIMIT 1), '') AS chat_name,
  COALESCE((SELECT c.chat_identifier FROM chat_message_join j JOIN chat c ON c.ROWID=j.chat_id WHERE j.message_id=m.ROWID LIMIT 1), '') AS chat_identifier,
  m.text,
  hex(m.attributedBody) AS attributed_hex
FROM message m
LEFT JOIN handle h ON h.ROWID=m.handle_id
WHERE datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') >= '2026-07-01 00:00:00'
  AND datetime(m.date/1000000000 + 978307200, 'unixepoch', 'localtime') <  '2026-09-02 00:00:00'
ORDER BY m.date;`;

const raw = execFileSync("/usr/bin/sqlite3", ["-readonly", "-json", db, sql], {
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});
const messages = JSON.parse(raw || "[]");

function decodeAttributed(hex) {
  if (!hex) return "";
  const buf = Buffer.from(hex, "hex");
  const ns = buf.indexOf(Buffer.from("NSString"));
  if (ns < 0) return "";
  const marker = Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]);
  const markerAt = buf.indexOf(marker, ns + 8);
  if (markerAt < 0) return "";
  let pos = markerAt + marker.length;
  let length = 0;
  const sizeTag = buf[pos++];
  if (sizeTag < 0x80) length = sizeTag;
  else if (sizeTag === 0x81 && pos + 2 <= buf.length) {
    length = buf.readUInt16LE(pos);
    pos += 2;
  } else if (sizeTag === 0x82 && pos + 4 <= buf.length) {
    length = buf.readUInt32LE(pos);
    pos += 4;
  } else return "";
  return buf.subarray(pos, Math.min(pos + length, buf.length)).toString("utf8").trim();
}

const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
const numberPattern = /(?:[$€£]\s*)?[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:%|[kKmMbB])?/g;
const expensePattern = /reimburs|expense|personal\s+(?:card|fund)|out\s+of\s+pocket|google|gemini|paid|payment|charge|cost|spend|wire|transfer|invoice|receipt|mercury|ramp|gusto/i;

function classify(value, sentence) {
  if (/^[$€£]/.test(value)) return "currency";
  if (/%$/.test(value)) return "percentage";
  if (/[kKmMbB]$/.test(value)) return "abbreviated quantity";
  if (/\b(?:19|20)\d{2}\b/.test(value)) return "year / possible ID";
  if (/\b(?:https?:\/\/|www\.)/i.test(sentence)) return "URL / identifier";
  if (/\b(?:phone|dial|PIN|code|card ending|account|ID)\b/i.test(sentence)) return "identifier";
  return "number";
}

const rows = [];
const expenseRows = [];
let messagesWithNumbers = 0;
for (const m of messages) {
  const fullMessage = String(m.text || decodeAttributed(m.attributed_hex) || "").trim();
  if (!fullMessage) continue;
  const safeMessage = fullMessage.slice(0, 30000);
  let hadNumber = false;
  for (const part of segmenter.segment(fullMessage)) {
    const sentence = part.segment.trim();
    if (!sentence) continue;
    const values = sentence.match(numberPattern) || [];
    if (!values.length) continue;
    hadNumber = true;
    for (const value of values) {
      const row = [
        new Date(String(m.sent_at).replace(" ", "T")),
        m.is_from_me ? "Me" : (m.sender || "Unknown"),
        m.is_from_me ? "Outgoing" : "Incoming",
        String(m.chat_id || ""),
        m.chat_name || m.chat_identifier || "",
        String(m.message_id),
        value,
        classify(value, sentence),
        sentence.slice(0, 30000),
        safeMessage,
      ];
      rows.push(row);
      if (expensePattern.test(sentence) || expensePattern.test(fullMessage)) expenseRows.push(row);
    }
  }
  if (hadNumber) messagesWithNumbers += 1;
}

const workbook = Workbook.create();
const summary = workbook.worksheets.add("Summary");
const all = workbook.worksheets.add("All Numbers");
const expenses = workbook.worksheets.add("Expense Candidates");

const titleFill = "#16324F";
const accentFill = "#DCEAF7";
const headerFill = "#2F6B9A";
const headerFont = "#FFFFFF";

summary.showGridLines = false;
summary.getRange("A1:F1").merge();
summary.getRange("A1").values = [["iMessage Numerical Values — Last Two Months"]];
summary.getRange("A1:F1").format = {
  fill: titleFill,
  font: { bold: true, color: headerFont, size: 18 },
  rowHeight: 32,
  verticalAlignment: "center",
};
summary.getRange("A3:B9").values = [
  ["Coverage", "2026-07-01 through 2026-09-01"],
  ["Messages scanned", messages.length],
  ["Messages containing numbers", messagesWithNumbers],
  ["Numerical values extracted", rows.length],
  ["Expense-related candidate values", expenseRows.length],
  ["Extraction rule", "One row per numerical token; full containing sentence and full message retained"],
  ["Attachment note", "Image-only numbers are not included unless they also appeared in message text"],
];
summary.getRange("A3:A9").format = { fill: accentFill, font: { bold: true, color: titleFill } };
summary.getRange("A3:B9").format.borders = { preset: "inside", style: "thin", color: "#CFD8E3" };
summary.getRange("A3:A9").format.columnWidth = 28;
summary.getRange("B3:B9").format.columnWidth = 76;
summary.getRange("A3:B9").format.wrapText = true;
summary.getRange("A11:F11").merge();
summary.getRange("A11").values = [["Use All Numbers for the literal dump. Expense Candidates is a convenience filter for reimbursement, Google/Gemini, cards, payments, and costs."]];
summary.getRange("A11:F11").format = { fill: "#FFF4D6", font: { color: "#6B4E00", italic: true }, wrapText: true, rowHeight: 34 };

const headers = [["Timestamp", "Sender", "Direction", "Chat ID", "Chat", "Message ID", "Value", "Type", "Full sentence", "Full message"]];

function buildDataSheet(sheet, data, tableName) {
  sheet.showGridLines = false;
  sheet.getRange("A1:J1").merge();
  sheet.getRange("A1").values = [[sheet.name]];
  sheet.getRange("A1:J1").format = {
    fill: titleFill,
    font: { bold: true, color: headerFont, size: 16 },
    rowHeight: 30,
    verticalAlignment: "center",
  };
  sheet.getRange("A3:J3").values = headers;
  sheet.getRange("A3:J3").format = {
    fill: headerFill,
    font: { bold: true, color: headerFont },
    rowHeight: 24,
    verticalAlignment: "center",
  };
  if (data.length) {
    sheet.getRangeByIndexes(3, 0, data.length, headers[0].length).values = data;
    sheet.tables.add(`A3:J${data.length + 3}`, true, tableName);
    sheet.getRange(`A4:A${data.length + 3}`).setNumberFormat("yyyy-mm-dd hh:mm:ss");
    sheet.getRange(`A4:H${data.length + 3}`).format.rowHeight = 18;
  }
  sheet.freezePanes.freezeRows(3);
  sheet.freezePanes.freezeColumns(2);
  const widths = [21, 24, 12, 10, 24, 12, 16, 22, 90, 90];
  widths.forEach((width, i) => sheet.getRangeByIndexes(0, i, Math.max(data.length + 3, 3), 1).format.columnWidth = width);
  sheet.getRange(`I4:J${Math.max(data.length + 3, 4)}`).format.wrapText = false;
}

buildDataSheet(all, rows, "AllNumbersTable");
buildDataSheet(expenses, expenseRows, "ExpenseCandidatesTable");

await fs.mkdir(outputDir, { recursive: true });
const inspect = await workbook.inspect({
  kind: "table",
  range: "All Numbers!A1:J12",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 10,
  maxChars: 12000,
});
console.log(inspect.ndjson);
const preview = await workbook.render({ sheetName: "Summary", range: "A1:F11", scale: 1.5, format: "png" });
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({ outputPath, previewPath, messages: messages.length, messagesWithNumbers, values: rows.length, expenseCandidates: expenseRows.length }));
