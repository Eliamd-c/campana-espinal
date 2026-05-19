import * as XLSX from 'xlsx';
import * as fs from 'fs';

const filePath = 'c:/Users/elamd/Downloads/PLANILLA  ALCALDE CON EL CORAZON AL DIA (Autoguardado).xlsx';

if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}

const workbook = XLSX.readFile(filePath);
console.log('Sheet Names:', workbook.SheetNames);

workbook.SheetNames.forEach((sheetName: string) => {
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
  console.log(`\n--- Sheet: ${sheetName} ---`);
  // Filtrar filas vacías
  const rows = data.filter((r: any) => r && r.length > 0);
  console.log('First 5 rows:', rows.slice(0, 5));
});

export {};
