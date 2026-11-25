/*
 * ТВ онлайн — 20 федеральных каналов по прямым ссылкам.
 *
 * Список каналов взят со страницы Мегион-Линк «IPTV 20 федеральных каналов».
 * Где вещатель отдаёт прямой поток — используется он (1ТВ, ВГТРК, Матч ТВ,
 * Звезда, ТНТ, Пятница, Мир). Для каналов с DRM/закрытым плеером оставлен
 * резервный прямой поток, чтобы канал всё равно открывался.
 *
 * Этот плагин не связан с «Телевидением» и не читает M3U.
 */
(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.plugin_tvonline_ready) return;

    window.plugin_tvonline_ready = true;

    var PLUGIN_NAME = 'ТВ онлайн';
    var MENU_TITLE = 'ТВ онлайн';
    var SCREEN_TITLE = 'ТВ онлайн';
    var EPG_URL = 'https://gribanovden2024.github.io/lampa-plagin/examples/federal20.xml';
    var EPG_TTL = 15 * 60 * 1000;
    var STORAGE_ENABLED = 'tvonline_enabled';

    var ICONS = {
        tv: '<svg viewBox="0 0 38 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="8" width="34" height="21" rx="3" stroke="currentColor" stroke-width="2.6"/><path d="M9.5 34.5h19" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M13.1 2.4 16.4 6.9M25 2.4l-3.4 4.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>'
    };

    var CHANNELS = [
        {
            id: 'ChannelOne.ru', name: 'Первый канал', quality: '720p',
            logo: 'https://i.imgur.com/RUSX0rX.png',
            url: 'https://edge03.1internet.tv/dash-live2/streams/1tv-dvr/1tvdash.mpd'
        },
        {
            id: 'Russia1.ru', name: 'Россия 1', quality: '1080p',
            logo: 'https://i.imgur.com/Osd2JHL.png',
            url: 'https://live.smotrim.ru/vgtrk/0/russia1-hd/index.m3u8'
        },
        {
            id: 'Russia24.ru', name: 'Россия 24', quality: '1080p',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Rossiya-24_Logo.svg/960px-Rossiya-24_Logo.svg.png',
            url: 'https://live.smotrim.ru/vgtrk/0/russia24-hd/index.m3u8'
        },
        {
            id: 'RussiaK.ru', name: 'Россия К', quality: '1080p',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/45/Russia-Cultura.svg/960px-Russia-Cultura.svg.png',
            url: 'https://live.smotrim.ru/vgtrk/0/kultura-hd/index.m3u8'
        },
        {
            id: '5Kanal.ru', name: 'Пятый канал', quality: '576p',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c0/5-tv_logo_%282023%29.svg/250px-5-tv_logo_%282023%29.svg.png',
            url: 'http://31.148.5.241/kanal_5/index.m3u8'
        },
        {
            id: 'NTV.ru', name: 'НТВ', quality: '1080p',
            logo: 'https://i.imgur.com/9r1BKzK.png',
            url: 'https://cdn.ntv.ru/ntv0_hd/playlist.m3u8'
        },
        {
            id: 'MatchTV.ru', name: 'Матч ТВ', quality: '720p',
            logo: '',
            url: 'https://m3u8.video.matchtv.ru/media/playlist/ch_380775c829621a0b843f25141a1b3b92/17_86669241/720/957328b26a3bfa673986ca597e484894/1795684200.m3u8'
        },
        {
            id: 'Karusel.ru', name: 'Карусель', quality: '576p',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b7/Logo_KARUSEL_2023.png/250px-Logo_KARUSEL_2023.png',
            url: 'http://31.148.5.241/kanal_8/index.m3u8'
        },
        {
            id: 'OTR.ru', name: 'ОТР', quality: '576p',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/9/9c/OTR_2025_logo.svg',
            url: 'http://31.148.5.241/kanal_9/index.m3u8'
        },
        {
            id: 'TVCentr.ru', name: 'ТВ Центр', quality: '576p',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/7/72/TV_Tsentr_2013_Logo.svg',
            url: 'http://31.148.5.241/kanal_10/index.m3u8'
        },
        {
            id: 'RENTV.ru', name: 'РЕН ТВ', quality: '576p',
            logo: 'https://i.imgur.com/0Tu5lte.png',
            url: 'http://185.23.80.23:8080/REN/index.m3u8'
        },
        {
            id: 'Spas.ru', name: 'Спас', quality: '576p',
            logo: '',
            url: 'http://31.148.5.241/kanal_12/index.m3u8'
        },
        {
            id: 'STS.ru', name: 'СТС', quality: '450p',
            logo: 'https://i.imgur.com/ilUzAeb.png',
            url: 'https://zabava-htlive.cdn.ngenix.net/hls/CH_STS/variant.m3u8'
        },
        {
            id: 'Domashniy.ru', name: 'Домашний', quality: '576p',
            logo: 'https://i.imgur.com/WaLwOyt.jpeg',
            url: 'http://31.148.5.241/kanal_14/index.m3u8'
        },
        {
            id: 'TV3.ru', name: 'ТВ-3', quality: '576p',
            logo: 'https://i.imgur.com/JLAvq8O.png',
            url: 'http://31.148.5.241/kanal_15/index.m3u8'
        },
        {
            id: 'Pyatnitsa.ru', name: 'Пятница!', quality: '720p',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/%D0%9F%D1%8F%D1%82%D0%BD%D0%B8%D1%86%D0%B0_%28%D1%81_2013%29.svg/250px-%D0%9F%D1%8F%D1%82%D0%BD%D0%B8%D1%86%D0%B0_%28%D1%81_2013%29.svg.png',
            url: 'https://bl.rutube.ru/livestream/9f87a9a0cecbe773be6fddcbd93585ac/index.m3u8?s=D2QKFHA4r_TxQ-B0YlxdoQ&e=2095641330&scheme=https'
        },
        {
            id: 'TelekanalZvezda.ru', name: 'Звезда', quality: '720p',
            logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/95/Zvezda_logo.svg/250px-Zvezda_logo.svg.png',
            url: 'https://tvchannelstream1.tvzvezda.ru/cdn/tvzvezda/playlist.m3u8'
        },
        {
            id: 'Mir.ru', name: 'Мир', quality: '1080p',
            logo: 'https://i.imgur.com/AqWaJT8.png',
            url: 'http://hls.mirtv.cdnvideo.ru/mirtv-parampublish/mirtv_2500/playlist.m3u8'
        },
        {
            id: 'TNT.ru', name: 'ТНТ', quality: '720p',
            logo: 'https://i.imgur.com/T4A6rEI.png',
            url: 'https://bl.rutube.ru/livestream/546602986e6a424d74d594876ddb3f04/index.m3u8?s=U-VYQo5ixugY0aMCs41D5Q&e=2095641329&scheme=https'
        },
        {
            id: 'MuzTV.ru', name: 'Муз-ТВ', quality: '576p',
            logo: 'https://i.imgur.com/BtqrHmz.png',
            url: 'http://31.148.5.241/kanal_20/index.m3u8'
        }
    ];

    var memory = {
        epg: null,
        loaded: 0
    };

    var FALLBACK = {
        'ChannelOne.ru': ['http://31.148.5.241/kanal_1/index.m3u8', '576p'],
        'Russia1.ru': ['http://31.148.5.241/kanal_2/index.m3u8', '576p'],
        'Russia24.ru': ['http://31.148.5.241/kanal_7/index.m3u8', '576p'],
        'RussiaK.ru': ['http://31.148.5.241/kanal_6/index.m3u8', '576p'],
        '5Kanal.ru': ['http://31.148.5.241/kanal_5/index.m3u8', '576p'],
        'NTV.ru': ['http://31.148.5.241/kanal_4/index.m3u8', '576p'],
        'MatchTV.ru': ['http://31.148.5.241/kanal_3/index.m3u8', '1080p'],
        'Karusel.ru': ['http://31.148.5.241/kanal_8/index.m3u8', '576p'],
        'OTR.ru': ['http://31.148.5.241/kanal_9/index.m3u8', '576p'],
        'TVCentr.ru': ['http://31.148.5.241/kanal_10/index.m3u8', '576p'],
        'RENTV.ru': ['http://185.23.80.23:8080/REN/index.m3u8', '576p'],
        'Spas.ru': ['http://31.148.5.241/kanal_12/index.m3u8', '576p'],
        'STS.ru': ['https://zabava-htlive.cdn.ngenix.net/hls/CH_STS/variant.m3u8', '450p'],
        'Domashniy.ru': ['http://31.148.5.241/kanal_14/index.m3u8', '576p'],
        'TV3.ru': ['http://31.148.5.241/kanal_15/index.m3u8', '576p'],
        'Pyatnitsa.ru': ['http://31.148.5.241/kanal_16/index.m3u8', '576p'],
        'TelekanalZvezda.ru': ['http://31.148.5.241/kanal_17/index.m3u8', '576p'],
        'Mir.ru': ['http://31.148.5.241/kanal_18/index.m3u8', '576p'],
        'TNT.ru': ['http://31.148.5.241/kanal_19/index.m3u8', '576p'],
        'MuzTV.ru': ['http://31.148.5.241/kanal_20/index.m3u8', '576p']
    };

    CHANNELS.forEach(function (channel) {
        var fallback = FALLBACK[channel.id];
        channel.fallback = fallback ? fallback[0] : channel.url;
        channel.fallbackQuality = fallback ? fallback[1] : channel.quality;
    });

    CHANNELS.forEach(function (channel) {
        if (channel.id === 'MatchTV.ru') channel.seek = true;
    });

    function mode() {
        return Lampa.Storage.get('tvonline_mode', 'compat') === 'official' ? 'official' : 'compat';
    }

    function channelUrl(channel) {
        var url = mode() === 'official' ? channel.url : (channel.fallback || channel.url);

        if (channel.seek && mode() === 'official') {
            url += (url.indexOf('?') >= 0 ? '&' : '?') + 'seek=' + (Math.floor(Date.now() / 1000) - 30);
        }

        return url;
    }

    function channelQuality(channel) {
        return mode() === 'official' ? channel.quality : channel.fallbackQuality;
    }

    var CSS = `
.tvo{position:relative;box-sizing:border-box;padding:1.6em 2.2em 1.2em 1.5em;overflow:hidden;line-height:1.3;display:flex;flex-direction:column}
.tvo *{box-sizing:border-box}
.tvo__head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:1.1em;flex-shrink:0}
.tvo__title{font-size:2em;font-weight:300}
.tvo__count{font-size:1em;opacity:.5}
.tvo__body{position:relative;flex:1;min-height:0}
.tvo__scroll{height:100%}
.tvo__scroll .scroll__content{padding:.2em .45em 1.2em}
.tvo-row{position:relative;display:flex;align-items:center;gap:1.1em;padding:.65em .9em;margin-bottom:.55em;border-radius:.6em;background:rgba(255,255,255,.045);cursor:pointer}
.tvo-row__logo{width:5.5em;height:3.1em;flex-shrink:0;border-radius:.4em;background:#2c2c2c;display:flex;align-items:center;justify-content:center;padding:.35em;overflow:hidden}
.tvo-row__logo img{max-width:100%;max-height:100%;object-fit:contain}
.tvo-row__code{font-size:1.15em;font-weight:900;text-align:center;white-space:nowrap}
.tvo-row__body{flex:1;min-width:0}
.tvo-row__top{display:flex;align-items:baseline;gap:.6em}
.tvo-row__name{font-size:1.08em;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tvo-row__quality{font-size:.7em;letter-spacing:.05em;text-transform:uppercase;opacity:.55;flex-shrink:0}
.tvo-row__now,.tvo-row__next{display:flex;align-items:baseline;gap:.55em;min-width:0}
.tvo-row__now{margin-top:.2em;font-size:.98em}
.tvo-row__next{margin-top:.18em;font-size:.86em;opacity:.55}
.tvo-row__label{flex-shrink:0;width:3.9em;font-size:.7em;letter-spacing:.06em;text-transform:uppercase;opacity:.7}
.tvo-row__time{flex-shrink:0;opacity:.7;font-variant-numeric:tabular-nums}
.tvo-row__title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tvo-row__bar{height:2px;margin-top:.4em;background:rgba(255,255,255,.12);border-radius:1em;overflow:hidden}
.tvo-row__bar i{display:block;height:100%;width:0;background:#fff;border-radius:1em;transition:width .3s}
.tvo-row.focus{background:rgba(255,255,255,.16)}
.tvo-row.focus::after{content:'';position:absolute;left:-.22em;top:-.22em;right:-.22em;bottom:-.22em;border:.18em solid #fff;border-radius:.8em;pointer-events:none;z-index:3}
.tvo-empty{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:2em;opacity:.6}
.tvo-empty.hide{display:none}
@media screen and (max-width:767px){
.tvo{padding:1.2em 1em 1em}
.tvo-row{gap:.7em;padding:.5em .6em}
.tvo-row__logo{width:4.2em;height:2.4em}
.tvo-row__label{width:auto;font-size:.64em}
}
body.light--version .tvo-row{background:rgba(0,0,0,.05)}
body.light--version .tvo-row.focus{background:rgba(0,0,0,.1)}
body.light--version .tvo-row__logo{background:#dcdcdc}
body.light--version .tvo-row__bar{background:rgba(0,0,0,.14)}
body.light--version .tvo-row__bar i{background:#111}
`;

    function trim(value) {
        return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
    }

    function isEnabled() {
        return Lampa.Storage.get(STORAGE_ENABLED, true) !== false;
    }

    function pad(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function timeHHMM(timestamp) {
        var date = new Date(timestamp);
        return pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function channelCode(name) {
        var clean = trim(name)
            .replace(/\((hd|fhd|uhd|4k|sd)\)/ig, '')
            .replace(/\b(hd|fhd|uhd|4k|sd)\b/ig, '')
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
        var words = clean.split(/\s+/).filter(Boolean);

        if (words.length > 1) {
            var code = '';
            for (var i = 0; i < words.length && code.length < 3; i++) code += words[i].charAt(0);
            return code.toUpperCase();
        }

        return clean.substr(0, 3).toUpperCase();
    }

    function decodeXml(value) {
        return String(value == null ? '' : value)
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/<[^>]+>/g, '')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/\s+/g, ' ')
            .replace(/^\s+|\s+$/g, '');
    }

    function attr(block, name) {
        var match = new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i').exec(block) ||
            new RegExp(name + "\\s*=\\s*'([^']*)'", 'i').exec(block);
        return match ? match[1] : '';
    }

    function parseTime(value) {
        var match = String(value || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);
        if (!match) return 0;

        var utc = Date.UTC(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0));

        if (match[7]) {
            var sign = match[7].charAt(0) === '-' ? -1 : 1;
            return utc - sign * (parseInt(match[7].substr(1, 2), 10) * 60 + parseInt(match[7].substr(3, 2), 10)) * 60000;
        }

        return new Date(+match[1], +match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0)).getTime();
    }

    function parseEpg(text) {
        var map = {};
        var re = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
        var match;

        while ((match = re.exec(text))) {
            var channel = attr(match[1], 'channel');
            var start = parseTime(attr(match[1], 'start'));
            var stop = parseTime(attr(match[1], 'stop'));
            var titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(match[2]);
            var title = titleMatch ? decodeXml(titleMatch[1]) : '';

            if (!channel || !start || !stop || stop <= start || !title) continue;

            (map[channel] = map[channel] || []).push({
                start: start,
                stop: stop,
                title: title
            });
        }

        Object.keys(map).forEach(function (id) {
            map[id].sort(function (a, b) { return a.start - b.start; });
        });

        return map;
    }

    function loadEpg(callback) {
        if (memory.epg && Date.now() - memory.loaded < EPG_TTL) {
            callback();
            return;
        }

        var network = new Lampa.Reguest();
        network.timeout(30000);
        network.native(EPG_URL, function (text) {
            network.clear();
            try {
                memory.epg = parseEpg(text);
                memory.loaded = Date.now();
            } catch (e) {
                memory.epg = {};
            }
            callback();
        }, function () {
            network.clear();
            memory.epg = {};
            callback();
        }, false, { dataType: 'text' });
    }

    function programsFor(channel) {
        return memory.epg ? memory.epg[channel.id] || null : null;
    }

    function programAt(channel, time) {
        var programs = programsFor(channel);
        if (!programs) return null;
        for (var i = 0; i < programs.length; i++) {
            if (time >= programs[i].start && time < programs[i].stop) return programs[i];
        }
        return null;
    }

    function nextAt(channel, current) {
        var programs = programsFor(channel);
        if (!programs || !programs.length) return null;
        if (current) {
            var index = programs.indexOf(current);
            if (index >= 0) return programs[index + 1] || null;
        }
        var now = Date.now();
        for (var i = 0; i < programs.length; i++) {
            if (programs[i].start > now) return programs[i];
        }
        return null;
    }

    function percent(program, time) {
        var total = program.stop - program.start;
        return total > 0 ? Math.max(0, Math.min(100, (time - program.start) / total * 100)) : 0;
    }

    function Component(object) {
        var self = this;
        var root = $('<div class="tvo layer--wheight"></div>');
        var body = null;
        var scroll = null;
        var rows = [];
        var lastFocus = null;
        var initialized = false;
        var destroyed = false;
        var timer = null;
        var lastMode = null;

        function build() {
            root.html(
                '<div class="tvo__head">' +
                    '<div class="tvo__title">ТВ онлайн</div>' +
                    '<div class="tvo__count">' + CHANNELS.length + ' каналов</div>' +
                '</div>' +
                '<div class="tvo__body">' +
                    '<div class="tvo-empty hide">Загрузка программы передач…</div>' +
                '</div>'
            );

            body = root.find('.tvo__body');

            scroll = new Lampa.Scroll({ over: true });
            scroll.render().addClass('tvo__scroll').appendTo(body);

            renderRows();
        }

        function renderRows() {
            lastMode = mode();
            scroll.clear();
            rows = [];

            CHANNELS.forEach(function (channel) {
                var row = $(
                    '<div class="tvo-row selector">' +
                        '<div class="tvo-row__logo"></div>' +
                        '<div class="tvo-row__body">' +
                            '<div class="tvo-row__top">' +
                                '<div class="tvo-row__name"></div>' +
                                '<div class="tvo-row__quality"></div>' +
                            '</div>' +
                            '<div class="tvo-row__now">' +
                                '<span class="tvo-row__label">Сейчас</span>' +
                                '<span class="tvo-row__time"></span>' +
                                '<span class="tvo-row__title"></span>' +
                            '</div>' +
                            '<div class="tvo-row__bar"><i></i></div>' +
                            '<div class="tvo-row__next">' +
                                '<span class="tvo-row__label">Далее</span>' +
                                '<span class="tvo-row__time"></span>' +
                                '<span class="tvo-row__title"></span>' +
                            '</div>' +
                        '</div>' +
                    '</div>'
                );

                row.find('.tvo-row__name').text(channel.name);
                row.find('.tvo-row__quality').text(channelQuality(channel));

                fillLogo(row.find('.tvo-row__logo'), channel);

                var entry = {
                    element: row,
                    channel: channel,
                    nowTime: row.find('.tvo-row__now .tvo-row__time'),
                    nowTitle: row.find('.tvo-row__now .tvo-row__title'),
                    nextTime: row.find('.tvo-row__next .tvo-row__time'),
                    nextTitle: row.find('.tvo-row__next .tvo-row__title'),
                    bar: row.find('.tvo-row__bar i')
                };

                updateRow(entry);

                row.on('hover:focus', function () {
                    lastFocus = row[0];
                    scroll.update(row);
                });

                row.on('hover:enter', function () {
                    play(channel);
                });

                rows.push(entry);
                scroll.append(row);
            });
        }

        function fillLogo(box, channel) {
            function code() {
                box.html('<div class="tvo-row__code">' + escapeHtml(channelCode(channel.name)) + '</div>');
            }

            if (!channel.logo) {
                code();
                return;
            }

            var img = $('<img alt="">');
            img.on('error', function () {
                img.remove();
                code();
            });
            box.append(img);
            img.attr('src', channel.logo);
        }

        function updateRow(entry) {
            var now = Date.now();
            var current = programAt(entry.channel, now);
            var next = nextAt(entry.channel, current);

            if (current) {
                entry.nowTime.text(timeHHMM(current.start) + '–' + timeHHMM(current.stop));
                entry.nowTitle.text(current.title);
                entry.bar.css('width', percent(current, now) + '%');
            } else {
                entry.nowTime.text('');
                entry.nowTitle.text(entry.channel.name);
                entry.bar.css('width', '0%');
            }

            if (next) {
                entry.nextTime.text(timeHHMM(next.start));
                entry.nextTitle.text(next.title);
            } else {
                entry.nextTime.text('');
                entry.nextTitle.text(memory.epg ? 'Нет данных' : 'Загрузка программы…');
            }
        }

        function updateRows() {
            rows.forEach(updateRow);
        }

        function play(channel) {
            var index = CHANNELS.indexOf(channel);

            if (!Lampa.Player || typeof Lampa.Player.iptv !== 'function') {
                if (Lampa.Player && Lampa.Player.play) {
                    Lampa.Player.play({ title: channel.name, url: channelUrl(channel) });
                }
                return;
            }

            function prepare(position) {
                var source = CHANNELS[position];
                if (!source) return null;

                var prepared = {
                    name: source.name,
                    group: 'ТВ онлайн',
                    logo: source.logo || '',
                    url: channelUrl(source),
                    tvgId: source.id,
                    icons: []
                };

                var programs = programsFor(source);
                var programIndex = 0;

                if (programs && programs.length) {
                    var now = Date.now();
                    for (var i = 0; i < programs.length; i++) {
                        if (now >= programs[i].start && now < programs[i].stop) {
                            programIndex = i;
                            break;
                        }
                    }
                }

                if (Lampa.Player.programReady) {
                    setTimeout(function () {
                        Lampa.Player.programReady({
                            channel: prepared,
                            position: programIndex,
                            total: programs ? programs.length : 0
                        });
                    }, 20);
                }

                return prepared;
            }

            Lampa.Player.iptv({
                position: index,
                total: CHANNELS.length,
                url: channelUrl(channel),
                title: channel.name,
                onGetChannel: prepare,
                onGetProgram: function (playerChannel, position, container) {
                    var box = $(container);
                    box.empty();

                    var programs = memory.epg ? memory.epg[playerChannel.tvgId || ''] || null : null;

                    if (!programs) {
                        box.append('<div class="player-panel-iptv-item__prog-load">Нет программы передач</div>');
                        return;
                    }

                    var now = Date.now();
                    programs.slice(position, position + 3).forEach(function (program) {
                        var active = now >= program.start && now < program.stop;
                        var item = $('<div class="player-panel-iptv-item__prog-item"><span></span></div>');

                        item.find('span').text(
                            timeHHMM(program.start) + (active ? ' - ' + timeHHMM(program.stop) : '') + '   ' + program.title
                        );

                        if (active) {
                            item.addClass('watch');
                            item.append(
                                '<div class="player-panel-iptv-item__prog-timeline">' +
                                    '<div style="width:' + percent(program, now) + '%"></div>' +
                                '</div>'
                            );
                        }

                        box.append(item);
                    });
                }
            });
        }

        this.create = function () {
            build();
            return root;
        };

        this.initialize = function () {
            if (initialized) return;

            initialized = true;

            if (this.activity) this.activity.loader(true);

            loadEpg(function () {
                if (destroyed) return;

                updateRows();

                if (self.activity) self.activity.loader(false);
            });

            timer = setInterval(function () {
                if (!destroyed) updateRows();
            }, 30000);
        };

        this.start = function () {
            if (destroyed) return;

            Lampa.Layer.update(root);

            if (initialized && lastMode !== mode()) {
                lastFocus = null;
                renderRows();
            }

            this.initialize();

            Lampa.Controller.add('content', {
                invisible: true,
                toggle: function () {
                    Lampa.Controller.collectionSet(root[0]);
                    Lampa.Controller.collectionFocus(lastFocus || false, root[0]);
                },
                left: function () {
                    Lampa.Controller.toggle('menu');
                },
                up: function () {
                    if (Navigator.canmove('up')) Navigator.move('up');
                    else Lampa.Controller.toggle('head');
                },
                down: function () {
                    if (Navigator.canmove('down')) Navigator.move('down');
                },
                back: function () {
                    Lampa.Activity.backward();
                }
            });

            Lampa.Controller.toggle('content');

            if (!lastFocus && rows.length) {
                Lampa.Controller.focus(rows[0].element[0]);
            }
        };

        this.render = function () {
            return root;
        };

        this.destroy = function () {
            destroyed = true;
            clearInterval(timer);
            if (scroll) scroll.destroy();
            root.remove();
        };
    }

    function addMenuButton() {
        if (window.tvonline_menu_button) return;

        var button = $(
            '<li class="menu__item selector" data-action="tvonline">' +
                '<div class="menu__ico">' + ICONS.tv + '</div>' +
                '<div class="menu__text">' + MENU_TITLE + '</div>' +
            '</li>'
        );

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: SCREEN_TITLE,
                component: 'tvonline',
                page: 1
            });
        });

        $('.menu .menu__list').eq(0).append(button);
        window.tvonline_menu_button = button;
    }

    function removeMenuButton() {
        if (!window.tvonline_menu_button) return;
        window.tvonline_menu_button.remove();
        window.tvonline_menu_button = null;
    }

    function syncMenu() {
        if (isEnabled()) addMenuButton();
        else removeMenuButton();
    }

    function addSettings() {
        if (window.tvonline_settings_ready) return;
        window.tvonline_settings_ready = true;

        Lampa.SettingsApi.addComponent({
            component: 'tvonline_settings',
            icon: ICONS.tv,
            name: PLUGIN_NAME
        });

        Lampa.SettingsApi.addParam({
            component: 'tvonline_settings',
            param: {
                name: STORAGE_ENABLED,
                type: 'trigger',
                values: '',
                default: true
            },
            field: {
                name: 'Включить',
                description: 'Показывает раздел «ТВ онлайн» в левом меню'
            },
            onChange: function () {
                syncMenu();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'tvonline_settings',
            param: {
                name: 'tvonline_mode',
                type: 'select',
                values: {
                    compat: 'Совместимые (работают в браузере)',
                    official: 'Официальные HD (нужен внешний плеер)'
                },
                default: 'compat'
            },
            field: {
                name: 'Потоки',
                description: 'Совместимые отдают CORS и идут в 576p; официальные — HD, но часть без CORS'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'tvonline_settings',
            param: { type: 'static' },
            field: {
                name: '20 федеральных каналов',
                description: 'Прямые потоки, где вещатель их отдаёт; остальные — резервные'
            }
        });
    }

    function injectStyle() {
        if (document.getElementById('tvonline-plugin-style')) return;
        var style = document.createElement('style');
        style.id = 'tvonline-plugin-style';
        style.type = 'text/css';
        style.appendChild(document.createTextNode(CSS));
        document.head.appendChild(style);
    }

    function init() {
        injectStyle();

        if (!Lampa.Component.get('tvonline')) {
            Lampa.Component.add('tvonline', Component);
        }

        addSettings();
        syncMenu();
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') init();
        });
    }
})();
