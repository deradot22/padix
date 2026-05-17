#!/usr/bin/env node
/**
 * Создаёт 20 участников: 1@gmail.com .. 20@gmail.com, пароль "1"
 * 15 откалиброваны, 5 на калибровке (users 4, 8, 12, 16, 20)
 * Требует запущенный бэкенд на localhost:8080
 * Использование: node scripts/seed-20-users.js [API_BASE_URL]
 */

const http = require('http');
const https = require('https');

const args = process.argv.slice(2);
const API_BASE = args[0] || 'http://localhost:8080';
const ADMIN_USER = process.env.APP_ADMIN_USERNAME || 'admin228';
const ADMIN_PASS = process.env.APP_ADMIN_PASSWORD || 'admin228';

const NAMES = [
  'Алексей Иванов', 'Мария Петрова', 'Дмитрий Сидоров', 'Ольга Козлова',
  'Сергей Новиков', 'Анна Морозова', 'Андрей Волков', 'Екатерина Соловьёва',
  'Павел Лебедев', 'Наталья Кузнецова', 'Максим Попов', 'Елена Васильева',
  'Артём Зайцев', 'Татьяна Павлова', 'Николай Семёнов', 'Ксения Голубева',
  'Виктор Богданов', 'Юлия Воронова', 'Роман Орлов', 'Дарья Медведева'
];

const GENDERS = ['M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F'];
const CALIBRATION_USERS = [4, 8, 12, 16, 20];

function request(method, url, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;

    const headers = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers
    };

    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: body ? JSON.parse(body) : null });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log('Логин в админку...');

  try {
    const loginResp = await request('POST', `${API_BASE}/api/admin/login`, {
      username: ADMIN_USER,
      password: ADMIN_PASS
    });

    if (!loginResp.data || !loginResp.data.token) {
      console.error('Ошибка: не удалось получить токен. Проверьте, что бэкенд запущен и admin credentials верны.');
      process.exit(1);
    }

    const TOKEN = loginResp.data.token;
    console.log('OK, токен получен.\n');

    console.log('Создаю 20 участников с разными рейтингами (800–1750)...');

    for (let i = 1; i <= 20; i++) {
      const email = `${i}@gmail.com`;
      const name = NAMES[i - 1];
      const gender = GENDERS[i - 1];
      const rating = 800 + (i - 1) * 50;
      const calibration = CALIBRATION_USERS.includes(i) ? 3 : 0;

      process.stdout.write(`  ${email} (${name}, рейтинг ${rating}, калибровка=${calibration}) ... `);

      try {
        const resp = await request('POST', `${API_BASE}/api/admin/users`, {
          email,
          password: '1',
          name,
          rating,
          surveyCompleted: true,
          calibrationEventsRemaining: calibration,
          gender
        }, TOKEN);

        if (resp.status === 201 || resp.status === 200) {
          console.log('OK');
        } else if (resp.data?.message?.includes('already registered') || resp.data?.message?.includes('already exists')) {
          console.log('уже есть');
        } else {
          console.log(`ошибка: ${resp.data?.message || 'HTTP ' + resp.status}`);
        }
      } catch (err) {
        console.log(`ошибка: ${err.message}`);
      }
    }

    console.log('Готово.\n');
    console.log('Тестовые учётные данные:');
    console.log('  Email: 1@gmail.com - 20@gmail.com');
    console.log('  Пароль: 1\n');
    console.log('На калибровке (3 события): users 4, 8, 12, 16, 20');
    console.log('  Пример: 4@gmail.com (Ольга Козлова)');
  } catch (err) {
    console.error('Ошибка:', err.message);
    process.exit(1);
  }
}

main();
