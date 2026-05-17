#!/usr/bin/env python3
"""
Создаёт 20 участников: 1@gmail.com .. 20@gmail.com, пароль "1"
15 откалиброваны, 5 на калибровке (users 4, 8, 12, 16, 20)
Требует запущенный бэкенд на localhost:8080
Использование: python scripts/seed-20-users.py [API_BASE_URL]
"""

import json
import sys
import urllib.request
import urllib.error
import os

API_BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8080'
ADMIN_USER = os.environ.get('APP_ADMIN_USERNAME', 'admin228')
ADMIN_PASS = os.environ.get('APP_ADMIN_PASSWORD', 'admin228')

NAMES = [
    'Алексей Иванов', 'Мария Петрова', 'Дмитрий Сидоров', 'Ольга Козлова',
    'Сергей Новиков', 'Анна Морозова', 'Андрей Волков', 'Екатерина Соловьёва',
    'Павел Лебедев', 'Наталья Кузнецова', 'Максим Попов', 'Елена Васильева',
    'Артём Зайцев', 'Татьяна Павлова', 'Николай Семёнов', 'Ксения Голубева',
    'Виктор Богданов', 'Юлия Воронова', 'Роман Орлов', 'Дарья Медведева'
]

GENDERS = ['M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F', 'M', 'F']
CALIBRATION_USERS = {4, 8, 12, 16, 20}

def request(method, url, data=None, token=None):
    """Send HTTP request and return response"""
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'

    if data:
        data = json.dumps(data).encode('utf-8')

    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req) as response:
            body = response.read().decode('utf-8')
            return {'status': response.status, 'data': json.loads(body) if body else None}
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        return {'status': e.code, 'data': json.loads(body) if body else None}
    except Exception as e:
        return {'status': None, 'error': str(e)}

def main():
    print('Логин в админку...')

    login_resp = request('POST', f'{API_BASE}/api/admin/login', {
        'username': ADMIN_USER,
        'password': ADMIN_PASS
    })

    if login_resp.get('error') or not login_resp.get('data') or not login_resp['data'].get('token'):
        print('Ошибка: не удалось получить токен. Проверьте, что бэкенд запущен и admin credentials верны.')
        if login_resp.get('error'):
            print(f'  {login_resp["error"]}')
        sys.exit(1)

    token = login_resp['data']['token']
    print('OK, токен получен.\n')

    print('Создаю 20 участников с разными рейтингами (800–1750)...')

    for i in range(1, 21):
        email = f'{i}@gmail.com'
        name = NAMES[i - 1]
        gender = GENDERS[i - 1]
        rating = 800 + (i - 1) * 50
        calibration = 3 if i in CALIBRATION_USERS else 0

        sys.stdout.write(f'  {email} ({name}, рейтинг {rating}, калибровка={calibration}) ... ')
        sys.stdout.flush()

        resp = request('POST', f'{API_BASE}/api/admin/users', {
            'email': email,
            'password': '1',
            'name': name,
            'rating': rating,
            'surveyCompleted': True,
            'calibrationEventsRemaining': calibration,
            'gender': gender
        }, token)

        if resp.get('error'):
            print(f'ошибка: {resp["error"]}')
        elif resp['status'] in [200, 201]:
            print('OK')
        elif resp['data'] and ('already registered' in resp['data'].get('message', '') or 'already exists' in resp['data'].get('message', '')):
            print('уже есть')
        else:
            msg = resp['data'].get('message') if resp['data'] else f'HTTP {resp["status"]}'
            print(f'ошибка: {msg}')

    print('\nГотово.\n')
    print('Тестовые учётные данные:')
    print('  Email: 1@gmail.com - 20@gmail.com')
    print('  Пароль: 1\n')
    print('На калибровке (3 события): users 4, 8, 12, 16, 20')
    print('  Пример: 4@gmail.com (Ольга Козлова)')

if __name__ == '__main__':
    main()
