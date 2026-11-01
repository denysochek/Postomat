// Мок-API сервер для локальної розробки та тестування без мережі
// Після запуску: node mock-server.cjs  →  http://localhost:3042

import http from 'node:http';

const PORT = 3042;

// Генератор демонстраційних посилок
function makeParcel(ttn, carrier, status, code, direction, title, origin, destination, expected = '') {
  const now = new Date();
  return {
    Number: ttn,
    IntDocNumber: ttn,
    DocumentNumber: ttn,
    Status: status,
    StatusCode: code,
    TrackingStatus: status,
    TrackingStatusCode: code,
    Description: title,
    CargoDescriptionString: title,
    CitySender: origin,
    CitySenderDescription: origin,
    WarehouseRecipient: destination,
    RecipientAddress: destination,
    RecipientAddressDescription: destination,
    CityRecipient: destination,
    ScheduledDeliveryDate: expected,
    ExpectedDeliveryDate: expected,
    direction,
    isManual: false,
  };
}

const demoData = {
  novaposhta: [
    makeParcel('20450000000001', 'novaposhta', 'Прибув у відділення', '7', 'incoming', 'Книжки на вихідні', 'Львів', 'Київ · Відділення № 24'),
    makeParcel('20450000000002', 'novaposhta', 'Прямує до міста отримувача', '5', 'incoming', 'Нова клавіатура', 'Одеса', 'Київ · Поштомат № 1024', '18.09.2026'),
    makeParcel('20450000000003', 'novaposhta', 'Прибув у відділення', '7', 'outgoing', 'Подарунок для друга', 'Київ', 'Львів · Відділення № 12'),
    makeParcel('20450000000004', 'novaposhta', 'Отримано', '9', 'outgoing', 'Настільна гра', 'Київ', 'Одеса · Відділення № 8'),
  ],
  ukrposhta: [
    makeParcel('RA123456789UA', 'ukrposhta', 'Відправлено з центру', '2', 'incoming', 'Замовлення з інтернет-магазину', 'Київ', 'Одеса · Відділення № 15'),
    makeParcel('RB987654321UA', 'ukrposhta', 'Прибув на пошту', '6', 'incoming', 'Аксесуари для телефону', 'Харків', 'Львів · Відділення № 3'),
  ],
  meest: [
    makeParcel('5001234567890', 'meest', 'У сортованому центрі', '3', 'outgoing', 'Подарунок для друга', 'Харків', 'Львів · Відділення Meest', '18.09.2026'),
    makeParcel('5000987654321', 'meest', 'Доставлено', '11', 'incoming', 'Документи', 'Київ', 'Одеса · Відділення Meest'),
  ],
};

// Нова пошта формат відповіді getStatusDocuments
function novaPoshtaResponse(ttns) {
  const rows = ttns.map(ttn => {
    const all = [...demoData.novaposhta, ...demoData.ukrposhta, ...demoData.meest].flat();
    const p = all.find(x => x.Number === ttn || x.IntDocNumber === ttn);
    if (!p) return null;
    return {
      Number: p.Number,
      IntDocNumber: p.IntDocNumber,
      Status: p.Status,
      StatusCode: p.StatusCode,
      Description: p.Description,
      CitySender: p.CitySender,
      WarehouseRecipient: p.WarehouseRecipient,
      ScheduledDeliveryDate: p.ScheduledDeliveryDate,
    };
  }).filter(Boolean);
  return { success: true, data: rows };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/v2.0/json/') {
    // Нова пошта API
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const method = parsed.calledMethod;
        const props = parsed.methodProperties || {};

        if (method === 'getStatusDocuments') {
          const docs = props.Documents || [];
          const ttns = docs.map(d => d.DocumentNumber);
          res.writeHead(200);
          res.end(JSON.stringify(novaPoshtaResponse(ttns)));
        } else {
          res.writeHead(400);
          res.end(JSON.stringify({ success: false, errors: ['Невідомий метод'] }));
        }
      } catch {
        res.writeHead(400);
        res.end(JSON.stringify({ success: false, errors: ['Некоректний запит'] }));
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/tracking/api/v1/track/')) {
    // Укрпошта мок
    const ttn = url.pathname.split('/').pop();
    const p = [...demoData.ukrposhta].find(x => x.Number === ttn || x.IntDocNumber === ttn);
    if (p) {
      res.writeHead(200);
      res.end(JSON.stringify({
        tracking: {
          ttn: p.Number,
          statusDescription: p.Status,
          statusCode: p.StatusCode,
          cargoDescription: p.Description,
          senderCity: p.CitySender,
          recipientCity: p.CityRecipient,
          expectedDate: p.ScheduledDeliveryDate,
          lastUpdate: new Date().toISOString(),
        },
      }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/meest/v1/tracking/')) {
    // Meest мок
    const ttn = url.pathname.split('/').pop();
    const p = [...demoData.meest].find(x => x.Number === ttn || x.IntDocNumber === ttn);
    if (p) {
      res.writeHead(200);
      res.end(JSON.stringify({
        tracking: {
          ttn: p.Number,
          statusDescription: p.Status,
          statusCode: p.StatusCode,
          cargoDescription: p.Description,
          senderCity: p.CitySender,
          recipientCity: p.CityRecipient,
          expectedDate: p.ScheduledDeliveryDate,
          lastUpdate: new Date().toISOString(),
        },
      }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    }
    return;
  }

  res.writeHead(404);
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Мок-API сервер запущено на http://localhost:${PORT}`);
});
