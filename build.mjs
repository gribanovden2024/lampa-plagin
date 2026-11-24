/**
 * Сборка объединённого плагина: src/kinopoisk.js + src/sisi.js -> lampa-plagin.js
 *
 * Оба исходника - самодостаточные IIFE, поэтому склеиваются как есть.
 * Запуск: node build.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';

const parts = [
    ['Кинопоиск "Буду смотреть" (свой CORS-прокси)', 'src/kinopoisk.js'],
    ['Strawberry / sisi (si.skaz.tv)', 'src/sisi.js']
];

const banner = `/*
 * lampa-plagin - объединённый плагин для приложения Лампа.
 * Установка: Настройки - Расширения - Добавить плагин - указать адрес этого файла.
 *
 * Состав:
 *   1. Кинопоиск "Буду смотреть" (работает через свой Cloudflare Worker,
 *      OAuth-токен третьим лицам не передаётся).
 *   2. Strawberry / sisi (si.skaz.tv) - контент-плагин, тянет данные и
 *      канал удалённого управления с сервера si.skaz.tv по HTTP.
 *
 * Собрано из src/kinopoisk.js и src/sisi.js. Правьте исходники, затем: node build.mjs
 */

`;

let out = banner;

for (const [title, path] of parts) {
    let code = readFileSync(path, 'utf8').replace(/^\uFEFF/, '').trim();

    if (!code.endsWith(';')) {
        code += ';';
    }

    out += `\n/* ===================== ${title} ===================== */\n\n${code}\n\n`;
}

writeFileSync('lampa-plagin.js', out, 'utf8');

console.log('lampa-plagin.js:', out.length, 'bytes');
