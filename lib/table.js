import Table from "cli-table3";

export function printTable(columns, rows) {
  const table = new Table({
    head: columns,
    style: { head: ["cyan"] },
  });

  for (const row of rows) {
    table.push(columns.map((col) => {
      const val = row[col];
      if (val === null || val === undefined) return "(null)";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    }));
  }

  console.log(table.toString());
}
