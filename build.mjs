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
        name: 'Кинопоиск — «Буду смотреть»',
        src: 'src/kinopoisk.js',
        out: 'plugins/kinopoisk.js',
        registers: 'компонент kinopoisk, раздел настроек kinopoisk, кнопка в левом меню',
        note: 'работает через собственный Cloudflare Worker, OAuth-токен третьим лицам не уходит'
    },
    {
        num: 2,
        name: 'Strawberry / sisi (si.skaz.tv)',
        src: 'src/sisi.js',
        out: 'plugins/sisi.js',
        registers: 'компоненты sisi_lampac и sisi_view_lampac, раздел настроек sisi, источник поиска, кнопка в левом меню',
        note: 'тянет данные с si.skaz.tv по HTTP и содержит канал удалённого управления (eval)'
    }
];

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
