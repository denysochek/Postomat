import { strict as assert } from 'node:assert';
import { NovaPoshtaCarrier } from '../src/carriers/novaposhta.ts';
import { UkrposhtaCarrier } from '../src/carriers/ukrposhta.ts';
import { MeestCarrier } from '../src/carriers/meest.ts';
import { carrierRegistry } from '../src/carriers/registry.ts';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`✗ ${name}: ${err.message}`);
  }
}

// Тести валідації ТТН
test('Nova Poshta: валідний 14-значний ТТН', () => {
  const np = new NovaPoshtaCarrier();
  assert.ok(np.validateNumber('20450000000001'));
  assert.ok(np.validateNumber('50012345678901'));
});

test('Nova Poshta: невалідний ТТН', () => {
  const np = new NovaPoshtaCarrier();
  assert.ok(!np.validateNumber('123'));
  assert.ok(!np.validateNumber('abc'));
  assert.ok(!np.validateNumber('2045000000000')); // 13 цифр
});

test('Nova Poshta: нормалізація номера', () => {
  const np = new NovaPoshtaCarrier();
  assert.strictEqual(np.normalizeNumber('2045-000-000-0001'), '20450000000001');
  assert.strictEqual(np.normalizeNumber('2045 000 000 0001'), '20450000000001');
});

test('Укрпошта: валідний ТТН RA...UA', () => {
  const uk = new UkrposhtaCarrier();
  assert.ok(uk.validateNumber('RA123456789UA'));
  assert.ok(uk.validateNumber('rb987654321ua'));
});

test('Укрпошта: числовий ТТН', () => {
  const uk = new UkrposhtaCarrier();
  assert.ok(uk.validateNumber('5001234567890'));
  assert.ok(!uk.validateNumber('123'));
});

test('Укрпошта: нормалізація в верхній регістр', () => {
  const uk = new UkrposhtaCarrier();
  assert.strictEqual(uk.normalizeNumber('ra123456789ua'), 'RA123456789UA');
});

test('Meest: валідний ТТН', () => {
  const ms = new MeestCarrier();
  assert.ok(ms.validateNumber('5001234567890'));
  assert.ok(ms.validateNumber('5000987654321'));
  assert.ok(!ms.validateNumber('12345'));
});

test('Реєстр: виявлення перевізника за ТТН', () => {
  assert.strictEqual(carrierRegistry.detectCarrier('20450000000001'), 'novaposhta');
  assert.strictEqual(carrierRegistry.detectCarrier('RA123456789UA'), 'ukrposhta');
  assert.strictEqual(carrierRegistry.detectCarrier('5001234567890'), 'meest');
  assert.strictEqual(carrierRegistry.detectCarrier('invalid'), null);
});

test('Реєстр: всі перевізники', () => {
  const all = carrierRegistry.all();
  assert.strictEqual(all.length, 3);
  const ids = all.map(a => a.config.id);
  assert.ok(ids.includes('novaposhta'));
  assert.ok(ids.includes('ukrposhta'));
  assert.ok(ids.includes('meest'));
});

console.log(`\nРезультати: ${passed} пройдено, ${failed} не пройдено`);
process.exit(failed > 0 ? 1 : 0);
