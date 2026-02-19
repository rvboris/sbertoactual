const api = require('@actual-app/api');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

// Игнорируем ошибки самоподписанных сертификатов (только для Dev!)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// --- НАСТРОЙКИ ---
const CONFIG = {
  serverURL: 'https://ab.ryabov.life',
  serverPassword: 'r4GAME5vxLpWzbRL7973Wd4TMR743tTw',
  syncId: '9f3fa27e-bafb-46c7-85c6-0168bad37020',
  budgetPassword: 'TtnpBbx7dq2Lu6GWqi3k7evF9pq7d759VZ87wSuoK4ZHCHU5iTud8Hf3G9Sa3btR',
  accountId: 'a07485c2-fea0-4129-aee2-bb3b1d922e6f', // Оставьте пустым для первого запуска (выведет список счетов)
  csvFile: 'actual_import.csv'
};
// -----------------

async function upload() {
  try {
    console.log('Подключение к серверу...');
    await api.init({
      serverURL: CONFIG.serverURL,
      password: CONFIG.serverPassword,
      dataDir: './actual-data' // Явно указываем директорию
    });

    console.log('Открытие бюджета...');
    await api.downloadBudget(CONFIG.syncId, { password: CONFIG.budgetPassword });

    const accounts = await api.getAccounts();
    
    if (!CONFIG.accountId) {
      console.log('\n--- СПИСОК ВАШИХ СЧЕТОВ ---');
      accounts.forEach(acc => {
        console.log(`Имя: ${acc.name}, ID: ${acc.id}`);
      });
      console.log('---------------------------\n');
      console.log('Пожалуйста, скопируйте нужный ID в переменную CONFIG.accountId в файле upload.js и запустите снова.');
      await api.shutdown();
      return;
    }

    const account = accounts.find(a => a.id === CONFIG.accountId);
    if (!account) {
      console.error('Ошибка: Счет с указанным ID не найден.');
      await api.shutdown();
      return;
    }

    console.log(`Загрузка данных в счет: ${account.name}`);

    // Получаем все категории для сопоставления ID по имени
    const categories = await api.getCategories();
    const categoryMap = new Map(categories.map(cat => [cat.name.toLowerCase(), cat.id]));

    const fileContent = fs.readFileSync(CONFIG.csvFile, 'utf8');
    // Используем надежный парсер CSV
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
      relax_quotes: true
    });

    const transactions = records.map(record => {
        const amount = Math.round(parseFloat(record.Amount) * 100);
        
        // Создаем уникальный ID на основе даты, названия и суммы.
        // Если в Notes есть AuthCode, он сделает ID еще точнее.
        const uniqueString = `${record.Date}${record.Payee}${record.Amount}${record.Notes}`;
        const imported_id = Buffer.from(uniqueString).toString('base64').substring(0, 64);

        // Ищем ID категории по имени
        const categoryId = categoryMap.get(record.Category.toLowerCase());

        return {
          date: record.Date,
          payee_name: record.Payee,
          category: categoryId, // Передаем ID вместо имени
          notes: record.Notes,
          amount: amount,
          account: CONFIG.accountId,
          imported_id: imported_id, // Ключ для дедупликации
          cleared: true
        };
      });

    console.log(`Подготовлено ${transactions.length} транзакций.`);

    // Импортируем транзакции
    await api.importTransactions(CONFIG.accountId, transactions);
    
    console.log('Импорт успешно завершен!');
    await api.shutdown();

  } catch (err) {
    console.error('Ошибка:', err.message);
    if (err.stack) console.error(err.stack);
    try { await api.shutdown(); } catch (e) {}
  }
}

upload();
