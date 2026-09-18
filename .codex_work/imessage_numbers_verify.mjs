import fs from "node:fs/promises";
import { FileBlob, SpreadsheetFile } from "@oai/artifact-tool";

const dir = "/Users/dmitri/Documents/GitHub/dmitri_landing_v2/outputs/imessage_numeric_dump_2026-09-01";
const input = await FileBlob.load(`${dir}/imessage_numbers_last_2_months.xlsx`);
const workbook = await SpreadsheetFile.importXlsx(input);

const overview = await workbook.inspect({ kind: "sheet", include: "id,name", maxChars: 4000 });
console.log(overview.ndjson);
const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
  maxChars: 4000,
});
console.log(errors.ndjson);

for (const [sheetName, filename] of [
  ["All Numbers", "preview_all_numbers.png"],
  ["Expense Candidates", "preview_expense_candidates.png"],
]) {
  const render = await workbook.render({ sheetName, range: "A1:J18", scale: 1, format: "png" });
  await fs.writeFile(`${dir}/${filename}`, new Uint8Array(await render.arrayBuffer()));
}
