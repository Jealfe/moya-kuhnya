# Результат: Android + GigaChat

Оба этапа реализованы в репозитории `Jealfe/moya-kuhnya`, ветка `codex/android-gigachat`.
Первый этап зафиксирован отдельным коммитом `c72af62`, после успешной сборки первого APK.
Существующие HTML/CSS/JS и сборка `dist` сохранены; отдельного сервера и отдельной
Android-кодовой базы интерфейса нет. Главная ветка и опубликованный GitHub Pages не изменялись.

## APK и установка

- Название: **Моя кухня**.
- Пакет: `ru.jealfe.moyakuhnya`.
- Android 7.0/API 24 и новее, target/compile SDK 36.
- Capacitor 8.6.0, Gradle wrapper 8.14.3, Android Gradle Plugin 8.13.0, JDK 21.
- Локальный APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
- SHA-256 собранного APK: `901cb8b995ff4eeed7807bd26d464eb355398a079459e03995a843d43f67b166`.
- Подпись APK проверена `apksigner`: APK Signature Scheme v2, один подписант.

Скачайте артефакт `moya-kuhnya-debug` из workflow **Android APK** в GitHub Actions,
распакуйте ZIP, перенесите APK на телефон и откройте.
Контрольная сумма выше относится к локальной сборке; GitHub Actions собирает и подписывает
свой APK, поэтому его контрольная сумма и debug-подпись отличаются.
Разрешите установку файловому менеджеру, если Android запросит это разрешение.
Инструкция сборки и переноса данных: [android.md](android.md).
Настройка ключа и работа анализа: [gigachat.md](gigachat.md).

Для переноса: Chrome → Настройки → Скачать копию; затем APK → Настройки →
Восстановить из файла → подтвердить замену. Ключ вводится отдельно в APK.
Для обновления APK нужна та же подпись. Приложение не удаляйте перед обновлением;
перед сменой подписи или переустановкой экспортируйте данные.

## Проверки

Выполнены в управляемой Linux-среде 12 ноября 2026:

- Исходные тесты: 20/20 до изменений.
- Итоговые тесты `npm test`: **30/30**.
- `npm run test:browser`: три набора проверок Chromium завершились успешно.
- `npm run build` / `npm run android:sync`: успешно, 96 локальных ресурсов.
- `:app:assembleDebug`: успешно, APK собран.
- `:app:testDebugUnitTest`: **5/5 Kotlin-тестов**, без ошибок.
- `:app:lintDebug`: успешно, **0 ошибок, 35 предупреждений**.
- `git diff --check`: успешно.

Предупреждения lint относятся к ресурсам/иконкам шаблона Capacitor, необязательным KTX
и доступности более новых версий отдельных зависимостей. Ошибки конфигурации TLS исправлены.

Проверены маршруты, готовка и отзыв, сохранение IndexedDB после перезапуска, экспорт/восстановление
копии, покупки, таймер и офлайн-перезагрузка. Service Worker включён в веб-версии и исключён
из нативного режима. Проверки ИИ охватывают ручной запуск, повторное использование результата
без сети/API, подсказки шагов, отметки, невалидный JSON, отмену и отсутствие ключа в копии.
Проверки Kotlin охватывают кеш токена, обновление до срока, один повтор при 401, ошибки,
официальный JSON-формат запроса и отклонение незавершённого ответа модели.

Нативный Bridge в браузерных проверках имитируется. Живой ключ GigaChat не использовался,
реальный API-запрос и Android Keystore на телефоне не проверялись. Эмулятор не запускался.
Что остаётся проверить: живую авторизацию/анализ, TLS на устройстве, файловые диалоги и галерею,
поворот/сворачивание, звук таймеров и обновление APK с сохранением данных.
Полные списки сценариев есть в инструкциях Android и GigaChat.

## Файлы итогового изменения

Ниже полный список относительно исходной ветки `main` (генерируемые `dist/`, APK,
локальный SDK, кеши, тестовые фотографии и ключ подписи в репозиторий не включены).

```text
.gitattributes
.github/workflows/android.yml
.gitignore
README.md
android/.gitignore
android/app/.gitignore
android/app/build.gradle
android/app/capacitor.build.gradle
android/app/proguard-rules.pro
android/app/src/main/AndroidManifest.xml
android/app/src/main/java/ru/jealfe/moyakuhnya/GigaChatPlugin.kt
android/app/src/main/java/ru/jealfe/moyakuhnya/GigaClient.kt
android/app/src/main/java/ru/jealfe/moyakuhnya/KitchenFilesPlugin.kt
android/app/src/main/java/ru/jealfe/moyakuhnya/MainActivity.java
android/app/src/main/java/ru/jealfe/moyakuhnya/SecretStore.kt
android/app/src/main/res/drawable-land-hdpi/splash.png
android/app/src/main/res/drawable-land-mdpi/splash.png
android/app/src/main/res/drawable-land-xhdpi/splash.png
android/app/src/main/res/drawable-land-xxhdpi/splash.png
android/app/src/main/res/drawable-land-xxxhdpi/splash.png
android/app/src/main/res/drawable-port-hdpi/splash.png
android/app/src/main/res/drawable-port-mdpi/splash.png
android/app/src/main/res/drawable-port-xhdpi/splash.png
android/app/src/main/res/drawable-port-xxhdpi/splash.png
android/app/src/main/res/drawable-port-xxxhdpi/splash.png
android/app/src/main/res/drawable-v24/ic_launcher_foreground.xml
android/app/src/main/res/drawable/ic_launcher_background.xml
android/app/src/main/res/drawable/kitchen_launcher.xml
android/app/src/main/res/drawable/splash.png
android/app/src/main/res/layout/activity_main.xml
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml
android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml
android/app/src/main/res/mipmap-hdpi/ic_launcher.png
android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png
android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png
android/app/src/main/res/mipmap-mdpi/ic_launcher.png
android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png
android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png
android/app/src/main/res/mipmap-xhdpi/ic_launcher.png
android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png
android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png
android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png
android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png
android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png
android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png
android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png
android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png
android/app/src/main/res/raw/russian_trusted_root_ca.pem
android/app/src/main/res/values/ic_launcher_background.xml
android/app/src/main/res/values/strings.xml
android/app/src/main/res/values/styles.xml
android/app/src/main/res/xml/backup_rules.xml
android/app/src/main/res/xml/data_extraction_rules.xml
android/app/src/main/res/xml/file_paths.xml
android/app/src/main/res/xml/network_security_config.xml
android/app/src/test/java/ru/jealfe/moyakuhnya/GigaClientTest.kt
android/build.gradle
android/capacitor.settings.gradle
android/gradle.properties
android/gradle/wrapper/gradle-wrapper.jar
android/gradle/wrapper/gradle-wrapper.properties
android/gradlew
android/gradlew.bat
android/settings.gradle
android/variables.gradle
capacitor.config.json
docs/android.md
docs/gigachat.md
docs/implementation-report.md
package-lock.json
package.json
public/ai-links.js
public/ai-ui.js
public/ai.js
public/app.js
public/core.js
public/data/ai-result.schema.json
public/data/exchange.schema.json
public/native.js
public/pages.js
public/style.css
public/ui.js
scripts/android-build.mjs
scripts/browser-check.mjs
scripts/checks/ai-browser.mjs
scripts/checks/files-browser.mjs
scripts/checks/web-browser.mjs
tests/ai.test.js
```
