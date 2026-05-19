import xlsx from 'xlsx';

const filePath = 'PLANILLA  ALCALDE CON EL CORAZON AL DIA (Autoguardado).xlsx';

try {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });
  
  let rowsPrinted = 0;
  for (let i = 0; i < Math.min(20, data.length); i++) {
    if (data[i].length > 0) {
      console.log(`Row ${i}:`, data[i]);
      rowsPrinted++;
    }
  }
} catch (e) {
  console.error('Error reading excel file:', e);
}
