# Создаёт 20 участников: 1@gmail.com .. 20@gmail.com, пароль "1"
# 15 откалиброваны, 5 на калибровке (users 4, 8, 12, 16, 20)
# Требует запущенный бэкенд на localhost:8080
# Использование: .\scripts\seed-20-users.ps1 -ApiBase http://localhost:8080

param(
    [string]$ApiBase = "http://localhost:8080",
    [string]$AdminUser = "admin228",
    [string]$AdminPass = "admin228"
)

$Names = @(
    "Алексей Иванов", "Мария Петрова", "Дмитрий Сидоров", "Ольга Козлова",
    "Сергей Новиков", "Анна Морозова", "Андрей Волков", "Екатерина Соловьёва",
    "Павел Лебедев", "Наталья Кузнецова", "Максим Попов", "Елена Васильева",
    "Артём Зайцев", "Татьяна Павлова", "Николай Семёнов", "Ксения Голубева",
    "Виктор Богданов", "Юлия Воронова", "Роман Орлов", "Дарья Медведева"
)

$Genders = @("M", "F", "M", "F", "M", "F", "M", "F", "M", "F", "M", "F", "M", "F", "M", "F", "M", "F", "M", "F")

$CalibrationUsers = @(4, 8, 12, 16, 20)

Write-Host "Логин в админку..."
try {
    $loginResp = Invoke-WebRequest -Uri "$ApiBase/api/admin/login" `
        -Method POST `
        -Headers @{"Content-Type" = "application/json"} `
        -Body (ConvertTo-Json @{"username" = $AdminUser; "password" = $AdminPass}) `
        -ErrorAction Stop

    $loginData = $loginResp.Content | ConvertFrom-Json
    $TOKEN = $loginData.token

    if (-not $TOKEN) {
        Write-Host "Ошибка: не удалось получить токен."
        exit 1
    }
}
catch {
    Write-Host "Ошибка при логине: $_"
    exit 1
}

Write-Host "Создаю 20 участников с разными рейтингами (800–1750)..."

for ($i = 1; $i -le 20; $i++) {
    $email = "$i@gmail.com"
    $name = $Names[$i - 1]
    $gender = $Genders[$i - 1]
    $rating = 800 + ($i - 1) * 50

    $calibration = 0
    if ($CalibrationUsers -contains $i) {
        $calibration = 3
    }

    Write-Host -NoNewline "  $email ($name, рейтинг $rating, калибровка=$calibration) ... "

    try {
        $resp = Invoke-WebRequest -Uri "$ApiBase/api/admin/users" `
            -Method POST `
            -Headers @{
                "Content-Type" = "application/json"
                "Authorization" = "Bearer $TOKEN"
            } `
            -Body (ConvertTo-Json @{
                "email" = $email
                "password" = "1"
                "name" = $name
                "rating" = $rating
                "surveyCompleted" = $true
                "calibrationEventsRemaining" = $calibration
                "gender" = $gender
            }) `
            -ErrorAction Stop

        Write-Host "OK"
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.Value__
        if ($statusCode -eq 201 -or $statusCode -eq 200) {
            Write-Host "OK"
        }
        elseif ($statusCode -eq 409) {
            Write-Host "уже есть"
        }
        else {
            try {
                $errorData = $_.Exception.Response.Content | ConvertFrom-Json
                if ($errorData.message -like "*already registered*" -or $errorData.message -like "*already exists*") {
                    Write-Host "уже есть"
                }
                else {
                    Write-Host "ошибка: $($errorData.message)"
                }
            }
            catch {
                Write-Host "HTTP $statusCode"
            }
        }
    }
}

Write-Host ""
Write-Host "Готово. Создано 20 пользователей."
Write-Host ""
Write-Host "Тестовые учётные данные:"
Write-Host "  Email: 1@gmail.com - 20@gmail.com"
Write-Host "  Пароль: 1"
Write-Host ""
Write-Host "На калибровке (3 события): users 4, 8, 12, 16, 20"
Write-Host "  Пример: 4@gmail.com (Ольга Козлова)"
