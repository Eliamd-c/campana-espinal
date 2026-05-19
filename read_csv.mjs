import fs from 'fs';
import path from 'path';

const csvPath = 'c:\\Users\\elamd\\Desktop\\PLANILLA  ALCALDE CON EL CORAZON AL DIA.csv';
const content = fs.readFileSync(csvPath, 'latin1');
const lines = content.split('\n').filter(line => line.trim() !== '' && !line.startsWith(';;;;;'));

console.log(`Total non-empty lines: ${lines.length}`);
console.log('First 5 lines:');
lines.slice(0, 5).forEach(line => console.log(line));
