'use strict';
(() => {
  // 第4群の表示専用。既存の食事記録・点数計算・保存処理は変更しない。
  const root = document.querySelector('[data-group4-quickref]');
  if (!root) return;
  const search = root.querySelector('[data-group4-search]');
  const categorySelect = root.querySelector('[data-group4-category]');
  const rows = root.querySelector('[data-group4-results]');
  const count = root.querySelector('[data-group4-count]');
  const status = root.querySelector('[data-group4-status]');
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('ja-JP');
  const gramsText = value => Number(value).toLocaleString('ja-JP', {maximumFractionDigits: 3}) + 'g';
  let foods = [];

  function render() {
    const query = normalize(search.value).trim();
    const selectedCategory = categorySelect.value;
    const matching = foods.filter(food =>
      (!selectedCategory || food.category === selectedCategory) &&
      (!query || normalize(food.name + ' ' + food.category).includes(query) ||
        (['ご飯','ごはん'].includes(query) && normalize(food.name).includes('めし'))));
    const fragment = document.createDocumentFragment();
    for (const food of matching) {
      const row = document.createElement('tr');
      const description = document.createElement('td');
      const name = document.createElement('strong');
      name.textContent = food.name;
      const category = document.createElement('small');
      category.textContent = food.category;
      description.append(name, category);
      const grams = document.createElement('td');
      grams.className = 'group4-weight';
      grams.textContent = gramsText(food.gramsPerPoint);
      row.append(description, grams);
      fragment.appendChild(row);
    }
    rows.replaceChildren(fragment);
    count.textContent = matching.length + '件表示／第4群 ' + foods.length + '件';
    if (!matching.length) {
      status.textContent = '該当する第4群の食品がありません。食品名や分類を変えて検索してください。';
    } else {
      status.textContent = '第4群の食品だけを表示しています。表は上下にスクロールできます。';
    }
  }

  search.addEventListener('input', render);
  categorySelect.addEventListener('change', render);
  fetch('../food-master.json', {cache:'no-store'}).then(response => {
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return response.json();
  }).then(data => {
    if (!Array.isArray(data.foods)) throw new Error('食品マスターの形式が不正です');
    const found = data.foods.filter(food =>
      food && food.group === '第4群' && typeof food.name === 'string' && food.name.trim() &&
      typeof food.category === 'string' && Number.isFinite(food.gramsPerPoint) && food.gramsPerPoint > 0);
    if (found.length < 100) throw new Error('第4群の食品数を検証できません');
    foods = found;
    const categories = [...new Set(foods.map(food => food.category))];
    for (const label of categories) {
      const option = document.createElement('option');
      option.value = label;
      option.textContent = label;
      categorySelect.appendChild(option);
    }
    render();
  }).catch(() => {
    status.textContent = '第4群の全食品を読み込めません。通信状況を確認して再読み込みしてください。';
    count.textContent = '全件未読込';
  });
})();