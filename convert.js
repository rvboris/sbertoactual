const fs = require('fs');
const path = require('path');

const inputFile = 'Выписка по счёту дебетовой карты.csv';
const outputFile = 'actual_import.csv';

try {
    const data = fs.readFileSync(path.join(__dirname, inputFile), 'utf8');
    // Используем строковый метод для разделения строк для надежности
    const lines = data.split('\n');
    
    const outputHeaders = ['Date', 'Payee', 'Category', 'Notes', 'Amount'];
    const result = [outputHeaders.join(',')];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(';');
        
        if (cols.length < 6) continue;

        const rawDate = cols[0] || '';
        const date = rawDate.split(' ')[0]; 
        
        const authCode = (cols[2] || '').trim();
        const payee = (cols[3] || '').trim().replace(/"/g, '""');
        const category = (cols[4] || '').trim().replace(/"/g, '""');
        const amount = (cols[5] || '0').trim();
        const notes = authCode ? `AuthCode: ${authCode}` : '';

        if (i < 5) {
            console.log(`Debug row ${i}: Date=${date}, Category="${category}", Amount=${amount}, Auth=${authCode}`);
        }

        result.push(`${date},"${payee}","${category}","${notes}",${amount}`);
    }

    fs.writeFileSync(path.join(__dirname, outputFile), result.join('\n'));
    console.log(`Converted to ${outputFile}`);
    console.log(`Processed ${result.length - 1} transactions.`);

} catch (err) {
    console.error('Error:', err.message);
}
