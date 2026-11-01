import('./carriers.test.mjs').catch(err => {
  console.error('Помилка запуску тестів:', err);
  process.exit(1);
});
