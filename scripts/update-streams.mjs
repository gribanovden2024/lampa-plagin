/**
 * Обновляет examples/tvonline-streams.json — официальные HLS-ссылки
 * вещателей (MediaVitrina) с разбивкой по часовым поясам.
 *
 * Зачем: у СТС и РЕН ТВ есть региональные версии (МСК+0/+2/+4/+7).
 * Плагин выбирает версию по часовому поясу устройства, чтобы трансляция
 * совпадала с сайтом вещателя, а не шла в хабаровском сдвиге.
 *
 * Токены в ссылках живут около 7 дней, поэтому скрипт запускается
 * по расписанию (.github/workflows/update-streams.yml).
 *
 * Запуск: node scripts/update-streams.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUTPUT = 'examples/tvonline-streams.json';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36';

const sources = [
    {
        id: 'STS.ru',
        site: 'ctc.ru',
        api: 'ctc',
        egress: '18314843',
        variants: { 0: 'ctc', 2: 'ctc_msk2', 4: 'ctc_msk4', 7: 'ctc_msk7' }
    },
    {
        id: 'RENTV.ru',
        site: 'ren.tv',
        api: 'nmg',
        egress: '18314859',
        variants: { 0: 'rentv', 2: 'rentv2', 4: 'rentv4', 7: 'rentv7' }
    },
    {
        id: '5Kanal.ru',
        site: '5-tv.ru',
        api: 'tv5',
        egress: '18314857',
        variants: { 0: '5tv' }
    },
    {
        id: 'MuzTV.ru',
        site: 'muz-tv.ru',
        api: 'muztv',
        egress: '18314955',
        variants: { 0: 'muztv' }
    }
];

function qualityFrom(master) {
    let best = 0;

    for (const match of master.matchAll(/RESOLUTION=(\d+)x(\d+)/g)) {
        best = Math.max(best, +match[2]);
    }

    return best ? best + 'p' : '';
}

function expiryFrom(url) {
    const token = /[?&]token=([^&]+)/.exec(url);

    if (token) {
        const parts = decodeURIComponent(token[1]).split('.');
        const value = Number(parts[3]);

        if (value > 1000000000) return value;
    }

    const timestamp = /[?&]timestamp=(\d+)/.exec(url);

    if (timestamp) return Number(timestamp[1]);

    return 0;
}

function readExisting() {
    if (!existsSync(OUTPUT)) return {};

    try {
        return JSON.parse(readFileSync(OUTPUT, 'utf8')).channels || {};
    } catch (e) {
        return {};
    }
}

async function resolve(source, slug) {
    const api = 'https://media.mediavitrina.ru/balancer/v3/' + source.api + '/' + slug +
        '/streams.json?application_id=&player_referer_hostname=' + encodeURIComponent(source.site) +
        '&config_checksum_sha256=undefined&egress_version_id=' + source.egress + '&';

    const response = await fetch(api, {
        headers: {
            'user-agent': UA,
            referer: 'https://player.mediavitrina.ru/',
            origin: 'https://player.mediavitrina.ru',
            accept: '*/*'
        }
    });

    if (!response.ok) throw new Error('streams: HTTP ' + response.status);

    const data = await response.json();
    const url = (data.hlsp && data.hlsp[0]) || (data.hls && data.hls[0]);

    if (!url) throw new Error('нет hls/hlsp');

    const masterResponse = await fetch(url, { headers: { 'user-agent': UA } });

    if (!masterResponse.ok) throw new Error('master: HTTP ' + masterResponse.status);

    const master = await masterResponse.text();

    if (/EXT-X-KEY|EXT-X-SESSION-KEY/i.test(master)) throw new Error('зашифрован');

    return {
        url: url,
        quality: qualityFrom(master),
        cors: masterResponse.headers.get('access-control-allow-origin') === '*',
        exp: expiryFrom(url) || undefined
    };
}

const existing = readExisting();
const result = {
    updated: new Date().toISOString(),
    channels: {}
};

let saved = 0;

for (const source of sources) {
    const channel = existing[source.id] || { variants: {} };

    channel.variants = channel.variants || {};

    for (const [shift, slug] of Object.entries(source.variants)) {
        try {
            const variant = await resolve(source, slug);

            channel.variants[shift] = variant;
            saved++;

            console.log(source.id, 'МСК+' + shift, variant.quality, 'cors=' + variant.cors);
        } catch (error) {
            console.log(source.id, 'МСК+' + shift, 'SKIP:', error.message);
        }
    }

    if (Object.keys(channel.variants).length) {
        result.channels[source.id] = channel;
    }
}

if (!saved) {
    console.log('Ни одной ссылки не получено — файл не меняю');
    process.exit(0);
}

writeFileSync(OUTPUT, JSON.stringify(result, null, 2) + '\n', 'utf8');
console.log('saved', OUTPUT, saved, 'ссылок');
