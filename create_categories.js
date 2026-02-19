const api = require('@actual-app/api');
const fs = require('fs');
const { parse } = require('csv-parse/sync');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const CONFIG = {
  serverURL: 'https://ab.ryabov.life',
  serverPassword: 'r4GAME5vxLpWzbRL7973Wd4TMR743tTw',
  syncId: '9f3fa27e-bafb-46c7-85c6-0168bad37020',
  budgetPassword: 'TtnpBbx7dq2Lu6GWqi3k7evF9pq7d759VZ87wSuoK4ZHCHU5iTud8Hf3G9Sa3btR',
  csvFile: 'actual_import.csv',
  groupName: 'Импорт из Сбера' // Группа, в которую попадут новые категории
};

async function run() {
  try {
    console.log('Подключение к серверу...');
    await api.init({
      serverURL: CONFIG.serverURL,
      password: CONFIG.serverPassword,
      dataDir: './actual-data'
    });

    console.log('Открытие бюджета...');
    await api.downloadBudget(CONFIG.syncId, { password: CONFIG.budgetPassword });

    // 1. Собираем уникальные категории из CSV
    const fileContent = fs.readFileSync(CONFIG.csvFile, 'utf8');
    const records = parse(fileContent, { columns: true, skip_empty_lines: true });
    const uniqueCategories = [...new Set(records.map(r => r.Category).filter(c => c && c.trim()))];
    
    console.log(`Найдено категорий в CSV: ${uniqueCategories.length}`);

    // 2. Получаем существующие группы и категории
    const groups = await api.getCategoryGroups();
    let importGroup = groups.find(g => g.name === CONFIG.groupName);

    // Создаем группу, если её нет
    if (!importGroup) {
      console.log(`Создание группы "${CONFIG.groupName}"...`);
      const groupId = await api.createCategoryGroup({ name: CONFIG.groupName });
      importGroup = { id: groupId, name: CONFIG.groupName, categories: [] };
    }

    const existingCategories = await api.getCategories();
    const existingNames = new Set(existingCategories.map(c => c.name.toLowerCase()));

    // 3. Создаем недостающие категории
    let createdCount = 0;
    for (const catName of uniqueCategories) {
      if (!existingNames.has(catName.toLowerCase())) {
        console.log(`Создание категории: ${catName}`);
        await api.createCategory({
          name: catName,
          group_id: importGroup.id
        });
        createdCount++;
      }
    }

    console.log(`Готово! Создано новых категорий: ${createdCount}`);
    await api.shutdown();

  } catch (err) {
    console.error('Ошибка:', err.message);
    try { await api.shutdown(); } catch (e) {}
  }
}

run();
