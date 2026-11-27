/**
 * Сборка:
 *   src/kinopoisk.js -> plugins/kinopoisk.js
 *   src/sisi.js      -> plugins/sisi.js
 *   шаблон           -> lampa-plagin.js (установщик)
 *
 * В Лампу добавляется только lampa-plagin.js, он подтягивает остальные.
 *
 * Запуск: node build.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const version = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);

const plugins = [
    {
        num: 1,
        name: 'LGBT — выключение раздела',
        src: 'src/lgbt.js',
        out: 'plugins/lgbt.js',
        registers: 'ничего не регистрирует, только ставит флаг window.lampa_settings.disable_features.lgbt = true',
        note: 'загружается первым: флаг должен успеть до построения меню',
        settings: null
    },
    {
        num: 2,
        name: 'Кинопоиск — «Буду смотреть»',
        src: 'src/kinopoisk.js',
        out: 'plugins/kinopoisk.js',
        registers: 'компонент kinopoisk, раздел настроек kinopoisk_settings, кнопка в левом меню',
        note: 'список показывается из кэша, TMDB-идентификаторы догружаются в фоне; OAuth-токен уходит только в собственный Cloudflare Worker',
        settings: {
            order: 10,
            component: 'kinopoisk_settings',
            name: 'Кинопоиск'
        }
    },
    {
        num: 3,
        name: 'Strawberry / sisi (si.skaz.tv)',
        src: 'src/sisi.js',
        out: 'plugins/sisi.js',
        registers: 'раздел настроек sisi_settings (по умолчанию выключен); при включении — компоненты sisi_lampac и sisi_view_lampac, источник поиска, кнопка в левом меню',
        note: 'тянет данные с si.skaz.tv по HTTP и содержит канал удалённого управления (eval)',
        settings: {
            order: 40,
            component: 'sisi_settings',
            name: 'Strawberry 18+'
        }
    },
    {
        num: 4,
        name: 'Телевидение — IPTV (M3U + XMLTV)',
        src: 'src/tv.js',
        out: 'plugins/tv.js',
        registers: 'компонент tv, раздел настроек tv_settings, кнопка «ТВ» в левом меню',
        note: 'встроенный плейлист и программа передач; данные кэшируются в памяти на 15 минут',
        settings: {
            order: 20,
            component: 'tv_settings',
            name: 'Телевидение'
        }
    },
    {
        num: 5,
        name: 'ТВ онлайн — 20 федеральных каналов',
        src: 'src/tvonline.js',
        out: 'plugins/tvonline.js',
        registers: 'компонент tvonline, раздел настроек tvonline_settings, кнопка «ТВ онлайн»',
        note: 'прямые потоки вещателей + резервные; без M3U и без настройки ссылки',
        settings: {
            order: 30,
            component: 'tvonline_settings',
            name: 'ТВ онлайн'
        }
    }
];

// Компоненты настроек, которые попадут в раздел «Мои плагины».
// Порядок пунктов задаётся полем settings.order.
const pluginSettings = plugins
    .filter((plugin) => plugin.settings)
    .sort((a, b) => a.settings.order - b.settings.order);

// Исходник раздела «Мои плагины» встраивается в установщик.
const myPluginsSource = readFileSync('src/my-plugins.js', 'utf8')
    .replace(/^\uFEFF/, '')
    .trim()
    .replace(/\n/g, '\n    ');

const rule = '='.repeat(72);

mkdirSync('plugins', { recursive: true });

let built = 0;

plugins.forEach((plugin) => {
    let code = readFileSync(plugin.src, 'utf8').replace(/^\uFEFF/, '').trim();

    if (!code.endsWith(';')) {
        code += ';';
    }

    const head = `/* ${rule}
 * ${plugin.name}
 * файл-источник: ${plugin.src}
 * регистрирует: ${plugin.registers}
 * примечание: ${plugin.note}
 * ${rule} */

try {
`;
    const tail = `
} catch (e) {
    console.error('[lampa-plagin] ${plugin.name} не загрузился:', e);
}
`;

    writeFileSync(plugin.out, head + code + tail, 'utf8');
    built++;

    console.log(`${plugin.out}: ${(head + code + tail).length} bytes`);
});

const installer = `/*
 * lampa-plagin — установщик.
 *
 * В Лампу добавляется только этот файл: Настройки -> Расширения -> Добавить плагин.
 * Он последовательно подгружает отдельные плагины из папки plugins/.
 *
 * Список того, что будет загружено:
${plugins.map((p) => ` *   ${p.num}) ${p.name}  ->  ${p.out}`).join('\n')}
 *
 * Собрано: ${version}
 */

(function () {
    'use strict';

    // Встроенная проверка расширений Лампы ищет в файле подстроку "Lampa."
    // и без неё показывает ошибку 500 «не плагин».
    if (!window.Lampa) {
        console.error('[lampa-plagin] не найдено приложение Lampa. Плагин не загружен');
        return;
    }

    if (window.lampa_plagin_installer) {
        console.log('[lampa-plagin] установщик уже запущен');
        return;
    }

    window.lampa_plagin_installer = true;

    var VERSION = '${version}';

    // Папка, из которой загружен этот файл. Нужна, чтобы плагины подхватывались
    // с того же адреса (GitHub Pages, свой сервер, локальная папка).
    var BASE = (function () {
        try {
            var src = document.currentScript && document.currentScript.src;

            if (src) {
                return src.replace(/[^\\/]*$/, '');
            }
        } catch (e) {}

        return 'https://gribanovden2024.github.io/lampa-plagin/';
    })();

    var PLUGINS = [
${plugins.map((p) => `        { name: '${p.name.replace(/'/g, "\\'")}', file: '${p.out}' }`).join(',\n')}
    ];

    // Разделы настроек, которые собираются в «Мои плагины».
    var PLUGIN_SETTINGS = [
${pluginSettings.map((p) => `        { component: '${p.settings.component}', name: '${p.settings.name.replace(/'/g, "\\'")}' }`).join(',\n')}
    ];

    // «Мои плагины»: папка в настройках и переходы в настройки плагинов.
    ${myPluginsSource}

    try {
        setupMyPluginsSettings(PLUGIN_SETTINGS);
    } catch (e) {
        console.error('[lampa-plagin] не удалось зарегистрировать «Мои плагины»:', e);
    }

    console.log('[lampa-plagin] установщик, плагинов: ' + PLUGINS.length + ', база: ' + BASE);

    function load(item, done) {
        var script = document.createElement('script');

        script.src = BASE + item.file + '?v=' + VERSION;
        script.async = true;

        script.onload = function () {
            console.log('[lampa-plagin] загружен: ' + item.name);

            if (done) done();
        };

        script.onerror = function () {
            console.error('[lampa-plagin] не удалось загрузить: ' + item.name + ' (' + script.src + ')');

            if (done) done();
        };

        document.head.appendChild(script);
    }

    function next() {
        var item = PLUGINS.shift();

        if (!item) {
            console.log('[lampa-plagin] все плагины подключены');
            return;
        }

        load(item, next);
    }

    next();
})();
`;

writeFileSync('lampa-plagin.js', installer, 'utf8');

console.log(`lampa-plagin.js: ${installer.length} bytes (установщик, плагинов: ${built})`);
