/**
 * Обновляет examples/federal20.xml — компактную программу передач
 * для 20 федеральных каналов из examples/federal20.m3u.
 *
 * Источник: https://epg.iptvx.one/epg.xml.gz
 * Запуск: node scripts/update-epg.mjs
 *
 * Скрипт читает gzip-поток построчно и оставляет только нужные каналы
 * и передачи в окне «12 часов назад … 7 дней вперёд».
 */
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import readline from 'node:readline';
import zlib from 'node:zlib';

const SOURCE = 'https://epg.iptvx.one/epg.xml.gz';
const OUTPUT = 'examples/federal20.xml';

const channels = [
    { epg: 'pervy', name: 'Первый канал', id: 'ChannelOne.ru' },
    { epg: 'rossia1', name: 'Россия 1', id: 'Russia1.ru' },
    { epg: 'match-tv', name: 'Матч ТВ', id: 'MatchTV.ru' },
    { epg: 'ntv', name: 'НТВ', id: 'NTV.ru' },
    { epg: '5kanal-ru', name: 'Пятый канал', id: '5Kanal.ru' },
    { epg: 'kultura', name: 'Россия К', id: 'RussiaK.ru' },
    { epg: 'rossia-24', name: 'Россия 24', id: 'Russia24.ru' },
    { epg: 'karusel', name: 'Карусель', id: 'Karusel.ru' },
    { epg: 'otr', name: 'ОТР', id: 'OTR.ru' },
    { epg: 'tvcentr', name: 'ТВ Центр', id: 'TVCentr.ru' },
    { epg: 'rentv', name: 'РЕН ТВ', id: 'RENTV.ru' },
    { epg: 'sts', name: 'СТС', id: 'STS.ru' },
    { epg: 'domashny', name: 'Домашний', id: 'Domashniy.ru' },
    { epg: 'tv3-ru', name: 'ТВ-3', id: 'TV3.ru' },
    { epg: 'piatnica', name: 'Пятница!', id: 'Pyatnitsa.ru' },
    { epg: 'zvezda', name: 'Звезда', id: 'TelekanalZvezda.ru' },
    { epg: 'mir', name: 'Мир', id: 'Mir.ru' },
    { epg: 'tnt', name: 'ТНТ', id: 'TNT.ru' },
    { epg: 'muztv', name: 'Муз-ТВ', id: 'MuzTV.ru' },
    { epg: 'yu', name: 'Ю', id: 'U.ru' }
];

const byEpg = new Map(channels.map((c) => [c.epg, c]));
const byId = new Map(channels.map((c) => [c.id, c]));

const now = Date.now();
const from = now - 12 * 60 * 60 * 1000;
const to = now + 7 * 24 * 60 * 60 * 1000;

function parseTime(value) {
    const match = String(value).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
    if (!match) return 0;

    const [, y, mo, d, h, mi, s = '0', offset] = match;
    const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);

    if (offset) {
        const sign = offset[0] === '-' ? -1 : 1;
        return utc - sign * (+offset.slice(1, 3) * 60 + +offset.slice(3, 5)) * 60000;
    }

    return new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error('EPG: HTTP ' + response.status);

const input = Readable.fromWeb(response.body).pipe(zlib.createGunzip());
const lines = readline.createInterface({ input, crlfDelay: Infinity });
const output = createWriteStream(OUTPUT, 'utf8');

output.write('<?xml version="1.0" encoding="UTF-8"?>\n<tv generator-info-name="federal20">\n');

for (const channel of channels) {
    output.write(`<channel id="${channel.id}"><display-name>${escapeXml(channel.name)}</display-name></channel>\n`);
}

let programs = 0;

for await (const line of lines) {
    if (!line.startsWith('<programme ')) continue;

    const channelMatch = line.match(/channel="([^"]+)"/);
    if (!channelMatch) continue;

    const channel = byEpg.get(channelMatch[1]);
    if (!channel) continue;

    const startMatch = line.match(/start="([^"]+)"/);
    const stopMatch = line.match(/stop="([^"]+)"/);
    if (!startMatch || !stopMatch) continue;

    const start = parseTime(startMatch[1]);
    const stop = parseTime(stopMatch[1]);

    if (!start || !stop || stop < from || start > to) continue;

    const titleMatch = line.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!titleMatch) continue;

    output.write(
        `<programme start="${startMatch[1]}" stop="${stopMatch[1]}" channel="${channel.id}">` +
        `<title>${titleMatch[1].trim()}</title></programme>\n`
    );
    programs++;
}

output.write('</tv>\n');
output.end();

input.destroy();

output.on('finish', () => {
    console.log(`EPG: ${programs} передач, каналов ${channels.length}, файл ${OUTPUT}`);
});
