/**
 * Сборка объединённого плагина: src/kinopoisk.js + src/sisi.js -> lampa-plagin.js
 *
 * Каждый исходник - самодостаточный IIFE, поэтому склеиваются как есть,
 * но каждый оборачивается в свой блок с заголовком и в try/catch:
 * если один плагин упадёт при загрузке, второй продолжит работать.
 *
 * Запуск: node build.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const plugins = [
    {
        num: 1,
        name: 'Кинопоиск — «Буду смотреть»',
        file: 'src/kinopoisk.js',
        registers: 'компонент kinopoisk, раздел настроек kinopoisk, кнопка в левом меню',
        note: 'работает через собственный Cloudflare Worker, OAuth-токен третьим лицам не уходит'
    },
    {
        num: 2,
        name: 'Strawberry / sisi (si.skaz.tv)',
        file: 'src/sisi.js',
        registers: 'компоненты sisi_lampac и sisi_view_lampac, раздел настроек sisi, источник поиска, кнопка в левом меню',
        note: 'тянет данные с si.skaz.tv по HTTP и содержит канал удалённого управления (eval)'
    }
];

const header = `/*
 * lampa-plagin — объединённый плагин для приложения Лампа.
 *
 * Установка: Настройки -> Расширения -> Добавить плагин -> указать адрес этого файла.
 *
 * В файле ${plugins.length} независимых плагина:
${plugins.map((p) => ` *   ${p.num}) ${p.name}`).join('\n')}
 *
 * Исходники: src/, сборка: node build.mjs
 */
`;

let out = header;
let total = 0;

plugins.forEach((plugin, index) => {
    let code = readFileSync(plugin.file, 'utf8').replace(/^\uFEFF/, '').trim();

    if (!code.endsWith(';')) {
        code += ';';
    }

    const rule = '='.repeat(72);

    out += `
/* ${rule}
 * ПЛАГИН ${plugin.num} из ${plugins.length} — ${plugin.name}
 * файл: ${plugin.file}
 * регистрирует: ${plugin.registers}
 * примечание: ${plugin.note}
 * ${rule} */

try {
${code}
} catch (e) {
    console.error('[lampa-plagin] плагин ${plugin.num} (${plugin.name}) не загрузился:', e);
}
`;

    total++;
});

out += `
/* ${'='.repeat(72)}
 * Итого плагинов в файле: ${total}
 * ${'='.repeat(72)} */
`;

writeFileSync('lampa-plagin.js', out, 'utf8');

console.log(`lampa-plagin.js: ${out.length} bytes, плагинов: ${total}`);
