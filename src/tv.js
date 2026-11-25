/*
 * Телевидение (IPTV) для Лампы.
 *
 * Источник каналов — плейлист M3U/M3U8 (ссылка), программа передач — XMLTV.
 * Обе ссылки задаются в Настройках Лампы: «Телевидение».
 *
 * Экран повторяет привычный вид ТВ-раздела: слева список категорий и групп,
 * справа сетка каналов с логотипом, текущей передачей и полоской прогресса.
 * По OK открывается встроенный плеер Лампы с переключением каналов (PG+/PG-).
 */
(function () {
    'use strict';

    if (!window.Lampa) return;
    if (window.plugin_tv_ready) return;

    window.plugin_tv_ready = true;

    var PLUGIN_NAME = 'Телевидение';
    var MENU_TITLE = 'ТВ';
    var SCREEN_TITLE = 'TV';
    var CACHE_TTL = 15 * 60 * 1000;

    var KEYS = {
        enabled: 'tv_enabled',
        name: 'tv_name',
        playlist: 'tv_playlist',
        epg: 'tv_epg',
        proxy: 'tv_proxy',
        favorites: 'tv_favorites'
    };

    var ICONS = {
        tv: '<svg viewBox="0 0 38 36" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="8" width="34" height="21" rx="3" stroke="currentColor" stroke-width="2.6"/><path d="M9.5 34.5h19" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M13.1 2.4 16.4 6.9M25 2.4l-3.4 4.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
        list: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="4.5" width="19" height="4" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="2.5" y="10" width="19" height="4" rx="1.2" stroke="currentColor" stroke-width="1.6"/><rect x="2.5" y="15.5" width="19" height="4" rx="1.2" stroke="currentColor" stroke-width="1.6"/></svg>',
        star: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 3.2 14.7 9l6.3.8-4.6 4.4 1.2 6.2-5.6-3-5.6 3 1.2-6.2L3 9.8 9.3 9 12 3.2Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
        search: '<svg viewBox="0 0 23 22" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="10" cy="9.6" r="7.4" stroke="currentColor" stroke-width="2.2"/><path d="m20.2 20.1-2.5-2.5" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/></svg>',
        folder: '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7.2c0-1 .8-1.7 1.7-1.7h4l1.8 2.3h8.8c1 0 1.7.8 1.7 1.7v8.3c0 1-.8 1.7-1.7 1.7H4.7c-1 0-1.7-.8-1.7-1.7V7.2Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
        fav: '<svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2.8 14.9 9l6.8.9-5 4.8 1.3 6.7-6-3.2-6 3.2 1.3-6.7-5-4.8L8.9 9 12 2.8Z"/></svg>'
    };

    var CSS = `
.tvp{position:relative;box-sizing:border-box;padding:1.6em 2.2em 1.2em 1.5em;overflow:hidden;line-height:1.3}
.tvp *{box-sizing:border-box}
.tvp__body{display:flex;height:100%;min-height:0}
.tvp__side{width:18.5em;flex-shrink:0;padding-right:1.5em;display:flex;flex-direction:column;min-height:0}
.tvp__side-head{display:flex;align-items:flex-start;margin:.5em 0 1.5em}
.tvp__title{font-size:1.95em;font-weight:300;line-height:1.2;flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:.4em}
.tvp__search{flex-shrink:0;padding:.38em;border-radius:100%;margin-top:.25em;opacity:.7;cursor:pointer}
.tvp__search svg{width:1.45em;height:1.45em;display:block}
.tvp__search.focus{background:#fff;color:#000;opacity:1}
.tvp__menu{flex:1;min-height:0;position:relative}
.tvp__menu .scroll,.tvp__main .scroll{height:100%}
.tvp__menu .scroll__content{padding:.25em 0 1.2em}
.tvp__main .scroll__content{padding:.45em .5em 1.2em}
.tvp-menu-item{display:flex;align-items:center;font-size:1.1em;font-weight:300;padding:.62em .8em;border-radius:.55em;opacity:.62;margin-bottom:.12em;cursor:pointer}
.tvp-menu-item__ico{width:1.1em;height:1.1em;margin-right:.62em;flex-shrink:0}
.tvp-menu-item__ico svg{width:100%;height:100%;display:block}
.tvp-menu-item__text{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tvp-menu-item__count{opacity:.55;padding-left:.7em;flex-shrink:0}
.tvp-menu-item.active{opacity:1;background:rgba(255,255,255,.12)}
.tvp-menu-item.focus{opacity:1;background:#fff;color:#000}
.tvp-menu-item.focus .tvp-menu-item__count{opacity:.7}
.tvp__main{flex:1;min-width:0;min-height:0;position:relative}
.tvp__grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(13.5em,1fr));gap:1.35em}
.tvp-card{position:relative;cursor:pointer}
.tvp-card__inner{position:relative;border-radius:.6em;overflow:hidden;background:#272727}
.tvp-card__logo{position:relative;padding-bottom:58%;background:#2c2c2c}
.tvp-card__logo img{position:absolute;left:0;top:0;width:100%;height:100%;object-fit:contain;padding:1.05em}
.tvp-card__code{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;font-size:2.5em;font-weight:900;letter-spacing:.02em;text-align:center;padding:.2em;opacity:.9}
.tvp-card__fav{position:absolute;top:.4em;right:.4em;width:1.15em;height:1.15em;z-index:2;filter:drop-shadow(0 .08em .18em rgba(0,0,0,.6))}
.tvp-card__fav svg{width:100%;height:100%;display:block}
.tvp-card__info{padding:.55em .8em .5em;background:#242424}
.tvp-card__prog{font-size:.98em;font-weight:300;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:.86;line-height:1.35}
.tvp-card__bar{height:2px;background:rgba(255,255,255,.14);margin-top:.5em;border-radius:1em;overflow:hidden}
.tvp-card__bar i{display:block;height:100%;width:0;background:#fff;border-radius:1em;transition:width .3s}
.tvp-card.focus::after{content:'';position:absolute;left:-.36em;top:-.36em;right:-.36em;bottom:-.36em;border:.2em solid #fff;border-radius:.92em;pointer-events:none;z-index:3}
.tvp-more{grid-column:1/-1;text-align:center;padding:.85em 1em;border-radius:.55em;background:rgba(255,255,255,.08);font-size:1.05em;opacity:.8;cursor:pointer}
.tvp-more.focus{background:#fff;color:#000;opacity:1}
.tvp-empty{position:absolute;left:0;top:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:2em}
.tvp-empty.hide{display:none}
.tvp-empty__title{font-size:1.55em;font-weight:400;margin-bottom:.7em}
.tvp-empty__text{font-size:1.02em;opacity:.6;line-height:1.55;max-width:34em}
.tvp-empty__text b{font-weight:600;opacity:.9}
@media screen and (max-width:767px){
.tvp{padding:1.2em 1em 1em}
.tvp__body{flex-direction:column}
.tvp__side{width:100%;padding-right:0;flex:0 0 auto}
.tvp__side-head{margin:0 0 .6em}
.tvp__title{font-size:1.8em}
.tvp__menu{flex:0 0 auto;height:3.1em;overflow-x:auto;overflow-y:hidden}
.tvp__menu .scroll{height:auto}
.tvp__menu .scroll.scroll--over{overflow:visible}
.tvp__menu .scroll__body{display:flex;width:max-content;min-width:100%}
.tvp__menu .scroll__content{padding:0}
.tvp-menu-item{flex-shrink:0;margin:0 .4em 0 0}
.tvp__grid{grid-template-columns:repeat(auto-fill,minmax(10.5em,1fr));gap:.8em}
}
body.light--version .tvp-card__inner{background:#e6e6e6}
body.light--version .tvp-card__logo{background:#dcdcdc}
body.light--version .tvp-card__info{background:#efefef}
body.light--version .tvp-card__bar{background:rgba(0,0,0,.14)}
body.light--version .tvp-card__bar i{background:#111}
body.platform--orsay .tvp__grid,body.platform--netcast .tvp__grid{display:block}
body.platform--orsay .tvp__grid:after,body.platform--netcast .tvp__grid:after{content:'';display:block;clear:both}
body.platform--orsay .tvp-card,body.platform--netcast .tvp-card{float:left;width:25%;padding:0 .65em .65em}
body.platform--orsay .tvp-more,body.platform--netcast .tvp-more{clear:both;margin-top:.65em}
`;

    // ---------------------------------------------------------------- утилиты

    function trim(value) {
        return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
    }

    function getSetting(name, fallback) {
        var value = Lampa.Storage.get(name, fallback);

        return value == null ? fallback : value;
    }

    function isEnabled() {
        return Lampa.Storage.get(KEYS.enabled, true) !== false;
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function decodeXml(value) {
        var text = String(value == null ? '' : value)
            .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
            .replace(/<[^>]+>/g, '');

        text = text
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;|&apos;/g, "'")
            .replace(/&nbsp;/g, ' ')
            .replace(/&#(\d+);/g, function (all, code) {
                return String.fromCharCode(parseInt(code, 10));
            })
            .replace(/&#x([0-9a-f]+);/gi, function (all, code) {
                return String.fromCharCode(parseInt(code, 16));
            })
            .replace(/&amp;/g, '&');

        return text.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
    }

    function normalizeName(value) {
        return String(value == null ? '' : value)
            .toLowerCase()
            .replace(/ё/g, 'е')
            .replace(/\((hd|fhd|uhd|4k|sd)\)/g, '')
            .replace(/\b(hd|fhd|uhd|4k|sd)\b/g, '')
            .replace(/[^0-9a-zа-я]+/g, '');
    }

    function channelKey(channel) {
        return channel.tvgId || normalizeName(channel.name);
    }

    function channelCode(name) {
        var words = trim(name).split(/\s+/).filter(Boolean);

        if (words.length > 1) {
            var code = '';

            for (var i = 0; i < words.length && code.length < 3; i++) {
                code += words[i].charAt(0);
            }

            return code.toUpperCase();
        }

        return trim(name).substr(0, 3).toUpperCase();
    }

    function pad(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function timeHHMM(timestamp) {
        var date = new Date(timestamp);

        return pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    function attrFrom(block, name) {
        var doubleQuote = new RegExp(name + '\\s*=\\s*"([^"]*)"', 'i');
        var singleQuote = new RegExp(name + "\\s*=\\s*'([^']*)'", 'i');
        var match = doubleQuote.exec(block) || singleQuote.exec(block);

        return match ? match[1] : '';
    }

    function parseProxyUrl(url) {
        var proxy = trim(getSetting(KEYS.proxy, ''));

        if (!proxy) return url;

        if (proxy.indexOf('{url}') >= 0) {
            return proxy.replace(/\{url\}/g, encodeURIComponent(url));
        }

        if (/[?=&]$/.test(proxy)) return proxy + encodeURIComponent(url);

        return proxy.replace(/\/+$/, '') + '/' + encodeURIComponent(url);
    }

    function errorText(error) {
        if (typeof error === 'string') return error;
        if (error && error.status) return 'HTTP ' + error.status;
        if (error && error.message) return error.message;

        return 'ошибка сети';
    }

    function requestLegacy(url, success, failure) {
        var network = new Lampa.Reguest();

        network.timeout(45000);

        network.native(parseProxyUrl(url), function (text) {
            network.clear();

            if (typeof text !== 'string' || !text) {
                failure('пустой ответ');
                return;
            }

            success(text);
        }, function (error) {
            network.clear();
            failure(error);
        }, false, {
            dataType: 'text'
        });
    }

    function decodeBytes(bytes) {
        var label = 'utf-8';

        try {
            var head = new TextDecoder('utf-8').decode(bytes.subarray(0, 300));
            var match = /<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i.exec(head);

            if (match) label = match[1];
        } catch (e) {}

        try {
            return new TextDecoder(label).decode(bytes);
        } catch (e) {
            return new TextDecoder('utf-8').decode(bytes);
        }
    }

    function decodeBuffer(buffer, success, failure) {
        var bytes = new Uint8Array(buffer);

        if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
            if (typeof DecompressionStream !== 'function' || typeof Blob === 'undefined' || !Blob.prototype.stream) {
                failure('файл сжат gzip, это устройство не умеет его распаковывать');
                return;
            }

            try {
                var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));

                new Response(stream).arrayBuffer().then(function (result) {
                    success(decodeBytes(new Uint8Array(result)));
                }, failure);
            } catch (e) {
                failure(e);
            }

            return;
        }

        success(decodeBytes(bytes));
    }

    function requestText(url, success, failure) {
        if (typeof fetch !== 'function' || typeof TextDecoder === 'undefined' ||
            typeof Response === 'undefined' || typeof Uint8Array === 'undefined') {
            requestLegacy(url, success, failure);
            return;
        }

        fetch(parseProxyUrl(url)).then(function (response) {
            if (!response.ok) throw {
                status: response.status
            };

            return response.arrayBuffer();
        }).then(function (buffer) {
            decodeBuffer(buffer, success, failure);
        }, function (error) {
            if (error && error.status) {
                failure(error);
                return;
            }

            requestLegacy(url, success, failure);
        });
    }

    // ------------------------------------------------------------- M3U / XMLTV

    function findNameComma(value) {
        var quoted = false;

        for (var i = 0; i < value.length; i++) {
            var symbol = value.charAt(i);

            if (symbol === '"') quoted = !quoted;
            else if (symbol === ',' && !quoted) return i;
        }

        return -1;
    }

    function parseExtinf(line) {
        var body = line.replace(/^#EXTINF:/i, '');
        var comma = findNameComma(body);
        var attributes = comma >= 0 ? body.slice(0, comma) : body;
        var name = comma >= 0 ? body.slice(comma + 1).replace(/^\s+|\s+$/g, '') : '';
        var attrs = {};
        var pattern = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
        var match;

        while ((match = pattern.exec(attributes))) {
            attrs[match[1].toLowerCase()] = match[2] != null ? match[2] : match[3];
        }

        return {
            name: name || attrs['tvg-name'] || 'Без названия',
            tvgId: trim(attrs['tvg-id']),
            tvgName: trim(attrs['tvg-name']),
            logo: trim(attrs['tvg-logo']),
            group: trim(attrs['group-title']),
            url: ''
        };
    }

    function parseM3U(text) {
        var lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/);
        var channels = [];
        var groups = [];
        var groupMap = {};
        var epgUrls = [];
        var current = null;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].replace(/^\s+|\s+$/g, '');

            if (!line) continue;

            if (/^#EXTM3U/i.test(line)) {
                var tvgUrl = attrFrom(line, 'x-tvg-url') || attrFrom(line, 'url-tvg');

                tvgUrl.split(',').forEach(function (part) {
                    part = trim(part);

                    if (part) epgUrls.push(part);
                });

                continue;
            }

            if (/^#EXTINF:/i.test(line)) {
                current = parseExtinf(line);
                continue;
            }

            if (/^#EXTGRP:/i.test(line) && current) {
                current.group = trim(line.replace(/^#EXTGRP:/i, ''));
                continue;
            }

            if (/^#EXTVLCOPT:/i.test(line) && current) {
                var userAgent = line.match(/http-user-agent=(.*)/i);

                if (userAgent) current.userAgent = trim(userAgent[1]);
                continue;
            }

            if (line.charAt(0) === '#') continue;

            if (current) {
                current.url = line;

                if (current.url) {
                    if (!current.group) current.group = 'Без группы';

                    if (!groupMap[current.group]) {
                        groupMap[current.group] = {
                            name: current.group,
                            count: 0
                        };
                        groups.push(groupMap[current.group]);
                    }

                    groupMap[current.group].count++;
                    channels.push(current);
                }

                current = null;
            }
        }

        return {
            channels: channels,
            groups: groups,
            epgUrls: epgUrls
        };
    }

    function parseXmltvTime(value) {
        if (!value) return 0;

        var text = trim(value);
        var match = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4})?/);

        if (match) {
            var year = parseInt(match[1], 10);
            var month = parseInt(match[2], 10) - 1;
            var day = parseInt(match[3], 10);
            var hours = parseInt(match[4], 10);
            var minutes = parseInt(match[5], 10);
            var seconds = parseInt(match[6] || '0', 10);
            var offset = match[7];

            if (offset) {
                var sign = offset.charAt(0) === '-' ? -1 : 1;
                var offsetHours = parseInt(offset.substr(1, 2), 10);
                var offsetMinutes = parseInt(offset.substr(3, 2), 10);
                var utc = Date.UTC(year, month, day, hours, minutes, seconds);

                return utc - sign * (offsetHours * 60 + offsetMinutes) * 60000;
            }

            return new Date(year, month, day, hours, minutes, seconds).getTime();
        }

        var date = new Date(text);

        return isNaN(date.getTime()) ? 0 : date.getTime();
    }

    function parseXmltv(text) {
        var byId = {};
        var aliases = {};
        var channelPattern = /<channel\b([^>]*)>([\s\S]*?)<\/channel>/gi;
        var channelMatch;

        while ((channelMatch = channelPattern.exec(text))) {
            var channelId = trim(attrFrom(channelMatch[1], 'id'));

            if (!channelId) continue;

            var names = [channelId];
            var displayPattern = /<display-name\b[^>]*>([\s\S]*?)<\/display-name>/gi;
            var displayMatch;

            while ((displayMatch = displayPattern.exec(channelMatch[2]))) {
                names.push(decodeXml(displayMatch[1]));
            }

            names.forEach(function (name) {
                var key = normalizeName(name);

                if (key && !aliases[key]) aliases[key] = channelId;
            });
        }

        var programPattern = /<programme\b([^>]*)>([\s\S]*?)<\/programme>/gi;
        var programMatch;

        while ((programMatch = programPattern.exec(text))) {
            var programId = trim(attrFrom(programMatch[1], 'channel'));

            if (!programId) continue;

            var start = parseXmltvTime(attrFrom(programMatch[1], 'start'));
            var stop = parseXmltvTime(attrFrom(programMatch[1], 'stop'));

            if (!start || !stop || stop <= start) continue;

            var titleRu = /<title\b[^>]*\blang\s*=\s*["'](?:ru|uk|be)["'][^>]*>([\s\S]*?)<\/title>/i.exec(programMatch[2]);
            var titleAny = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(programMatch[2]);
            var title = decodeXml((titleRu || titleAny || [])[1] || '');

            if (!title) continue;

            if (!byId[programId]) byId[programId] = [];

            byId[programId].push({
                start: start,
                stop: stop,
                title: title
            });
        }

        Object.keys(byId).forEach(function (id) {
            byId[id].sort(function (a, b) {
                return a.start - b.start;
            });
        });

        return {
            byId: byId,
            aliases: aliases
        };
    }

    // -------------------------------------------------------------- кэш данных

    var instances = [];

    var memory = {
        playlistUrl: '',
        epgUrls: '',
        channels: null,
        groups: null,
        epg: null,
        loaded: 0
    };

    function clearMemory() {
        memory = {
            playlistUrl: '',
            epgUrls: '',
            channels: null,
            groups: null,
            epg: null,
            loaded: 0
        };
    }

    function loadPlaylist(callback) {
        var url = trim(getSetting(KEYS.playlist, ''));

        if (!url) {
            callback({
                type: 'no-playlist'
            });
            return;
        }

        if (memory.channels && memory.playlistUrl === url && Date.now() - memory.loaded < CACHE_TTL) {
            callback(null, memory);
            return;
        }

        clearMemory();
        memory.playlistUrl = url;

        requestText(url, function (text) {
            var parsed;

            try {
                parsed = parseM3U(text);
            } catch (error) {
                callback({
                    type: 'parse',
                    message: errorText(error)
                });
                return;
            }

            if (!parsed.channels.length) {
                callback({
                    type: 'empty'
                });
                return;
            }

            memory.channels = parsed.channels;
            memory.groups = parsed.groups;
            memory.epgUrls = parsed.epgUrls;
            memory.loaded = Date.now();

            callback(null, memory);
        }, function (error) {
            callback({
                type: 'network',
                message: errorText(error)
            });
        });
    }

    function channelCountryHint(channels) {
        var counts = {};

        channels.forEach(function (channel) {
            var id = String(channel.tvgId || '').toLowerCase();
            var suffix = /\.([a-z]{2})(?:@|$)/i.exec(id);
            var group = String(channel.group || '').toLowerCase();

            if (suffix) counts[suffix[1]] = (counts[suffix[1]] || 0) + 1;
            if (/russia|росси/.test(group)) counts.ru = (counts.ru || 0) + 2;
            if (/ukrain|украин/.test(group)) counts.ua = (counts.ua || 0) + 2;
            if (/kazakh|казах/.test(group)) counts.kz = (counts.kz || 0) + 2;
            if (/belarus|беларус/.test(group)) counts.by = (counts.by || 0) + 2;
        });

        var best = '';
        var max = 0;

        Object.keys(counts).forEach(function (key) {
            if (counts[key] > max) {
                max = counts[key];
                best = key;
            }
        });

        return best;
    }

    function epgUrlScore(url, hint) {
        if (!hint) return 0;

        var name = String(url).toLowerCase();
        var score = 0;

        if (hint === 'ru' && /russia|russian|росси/.test(name)) score += 20;
        if (hint === 'ua' && /ukrain|украин/.test(name)) score += 20;
        if (hint === 'kz' && /kazakh|казах/.test(name)) score += 20;
        if (hint === 'by' && /belarus|беларус/.test(name)) score += 20;

        if (new RegExp('(^|[^a-z])' + hint + '([^a-z]|$)').test(name)) score += 10;

        return score;
    }

    function sortEpgUrls(urls) {
        var hint = channelCountryHint(memory.channels || []);

        return urls.map(function (url, index) {
            return {
                url: url,
                index: index,
                score: epgUrlScore(url, hint)
            };
        }).sort(function (a, b) {
            return b.score - a.score || a.index - b.index;
        }).map(function (item) {
            return item.url;
        });
    }

    function epgMatches(parsed) {
        var previous = memory.epg;
        var found = false;

        memory.epg = parsed;

        for (var i = 0; i < (memory.channels || []).length; i++) {
            if (programsFor(memory.channels[i])) {
                found = true;
                break;
            }
        }

        memory.epg = previous;

        return found;
    }

    function loadEpg(callback) {
        if (memory.epg) {
            callback(null);
            return;
        }

        var custom = trim(getSetting(KEYS.epg, ''));
        var urls = custom ? [custom] : sortEpgUrls(memory.epgUrls || []);

        if (!urls.length) {
            memory.epg = {
                byId: {},
                aliases: {}
            };
            callback(null);
            return;
        }

        var index = 0;
        var attempts = 0;
        var maxAttempts = custom ? 1 : 8;

        function finish() {
            memory.epg = {
                byId: {},
                aliases: {}
            };
            callback(null);
        }

        function next() {
            if (index >= urls.length || attempts >= maxAttempts) {
                finish();
                return;
            }

            var url = urls[index++];

            attempts++;

            requestText(url, function (text) {
                var parsed;

                try {
                    parsed = parseXmltv(text);
                } catch (error) {
                    next();
                    return;
                }

                if (!parsed.byId || !Object.keys(parsed.byId).length) {
                    next();
                    return;
                }

                if (urls.length > 1 && !epgMatches(parsed)) {
                    next();
                    return;
                }

                memory.epg = parsed;
                callback(null);
            }, function () {
                next();
            });
        }

        next();
    }

    function programsFor(channel) {
        if (!memory.epg) return null;

        var id = channel.tvgId;
        var programs = id ? memory.epg.byId[id] : null;

        if (!programs) {
            var key = normalizeName(channel.tvgName || channel.name);
            var alias = key ? memory.epg.aliases[key] : '';

            if (alias) programs = memory.epg.byId[alias];
        }

        return programs || null;
    }

    function programAt(channel, time) {
        var programs = programsFor(channel);

        if (!programs || !programs.length) return null;

        for (var i = 0; i < programs.length; i++) {
            if (time >= programs[i].start && time < programs[i].stop) return programs[i];
        }

        return null;
    }

    function programPosition(channel, time) {
        var programs = programsFor(channel);

        if (!programs || !programs.length) return 0;

        for (var i = 0; i < programs.length; i++) {
            if (time >= programs[i].start && time < programs[i].stop) return i;
        }

        for (var j = programs.length - 1; j >= 0; j--) {
            if (programs[j].start <= time) return j;
        }

        return 0;
    }

    function programPercent(program, time) {
        if (!program) return 0;

        var total = program.stop - program.start;

        if (total <= 0) return 0;

        return Math.max(0, Math.min(100, (time - program.start) / total * 100));
    }

    // ---------------------------------------------------------------- избранное

    function favorites() {
        var list = Lampa.Storage.get(KEYS.favorites, []);

        return Array.isArray(list) ? list : [];
    }

    function isFavorite(channel) {
        return favorites().indexOf(channelKey(channel)) >= 0;
    }

    function toggleFavorite(channel) {
        var list = favorites();
        var key = channelKey(channel);
        var index = list.indexOf(key);

        if (index >= 0) list.splice(index, 1);
        else list.push(key);

        Lampa.Storage.set(KEYS.favorites, list);

        return index < 0;
    }

    // ---------------------------------------------------------------- компонент

    function TvComponent(object) {
        var self = this;
        var root = $('<div class="tvp layer--wheight"></div>');
        var sideMenu = null;
        var title = null;
        var main = null;
        var empty = null;
        var sideScroll = null;
        var gridScroll = null;
        var grid = null;
        var cards = [];
        var renderList = [];
        var renderIndex = 0;
        var moreElement = null;
        var RENDER_LIMIT = 150;
        var channels = [];
        var groups = [];
        var category = {
            type: 'all',
            value: ''
        };
        var query = '';
        var epgReady = false;
        var loading = false;
        var initialized = false;
        var destroyed = false;
        var timer = null;
        var lastFocus = null;
        var activeMenuItem = null;
        var sourcesSnapshot = '';
        var loadToken = 0;

        function sourcesKey() {
            return [
                trim(getSetting(KEYS.playlist, '')),
                trim(getSetting(KEYS.epg, '')),
                trim(getSetting(KEYS.proxy, ''))
            ].join('\n');
        }

        function resetData() {
            clearMemory();

            loadToken++;
            loading = false;
            epgReady = false;
            initialized = false;
            channels = [];
            groups = [];
            cards = [];
            renderList = [];
            renderIndex = 0;
            moreElement = null;
            lastFocus = null;

            empty.addClass('hide');
            sideScroll.clear();
            grid.empty();
            gridScroll.render().removeClass('hide');
            gridScroll.reset();
        }

        function build() {
            root.html(
                '<div class="tvp__body">' +
                    '<div class="tvp__side">' +
                        '<div class="tvp__side-head">' +
                            '<div class="tvp__title"></div>' +
                            '<div class="tvp__search selector">' + ICONS.search + '</div>' +
                        '</div>' +
                        '<div class="tvp__menu"></div>' +
                    '</div>' +
                    '<div class="tvp__main">' +
                        '<div class="tvp-empty hide"></div>' +
                    '</div>' +
                '</div>'
            );

            sideMenu = root.find('.tvp__menu');
            title = root.find('.tvp__title');
            main = root.find('.tvp__main');
            empty = root.find('.tvp-empty');

            sideScroll = new Lampa.Scroll({
                over: true
            });
            gridScroll = new Lampa.Scroll({
                over: true
            });

            sideScroll.render().addClass('tvp__scroll').appendTo(sideMenu);
            gridScroll.render().addClass('tvp__scroll').appendTo(main);

            grid = $('<div class="tvp__grid"></div>');

            gridScroll.append(grid);

            root.find('.tvp__search').on('hover:enter', function () {
                openSearch();
            });

            root.find('.tvp__search').on('hover:focus', function () {
                lastFocus = this;
            });
        }

        function showEmpty(titleText, text) {
            empty.removeClass('hide');
            gridScroll.render().addClass('hide');

            empty.html(
                '<div class="tvp-empty__title">' + escapeHtml(titleText) + '</div>' +
                '<div class="tvp-empty__text">' + text + '</div>'
            );
        }

        function hideEmpty() {
            empty.addClass('hide');
            gridScroll.render().removeClass('hide');
        }

        function visibleChannels() {
            if (category.type === 'favorites') {
                var favoritesList = favorites();

                return channels.filter(function (channel) {
                    return favoritesList.indexOf(channelKey(channel)) >= 0;
                });
            }

            if (category.type === 'group') {
                return channels.filter(function (channel) {
                    return channel.group === category.value;
                });
            }

            if (category.type === 'search') {
                if (!query) return [];

                var needle = normalizeName(query);

                return channels.filter(function (channel) {
                    return normalizeName(channel.name).indexOf(needle) >= 0 ||
                        normalizeName(channel.group).indexOf(needle) >= 0;
                });
            }

            return channels;
        }

        function buildMenuItem(item) {
            var element = $(
                '<div class="tvp-menu-item selector">' +
                    '<div class="tvp-menu-item__ico">' + item.icon + '</div>' +
                    '<div class="tvp-menu-item__text"></div>' +
                    '<div class="tvp-menu-item__count"></div>' +
                '</div>'
            );

            element.data('category', item.category);
            element.find('.tvp-menu-item__text').text(item.label);
            element.find('.tvp-menu-item__count').text(item.count == null ? '' : item.count);

            if (item.active) element.addClass('active');

            element.on('hover:focus', function () {
                lastFocus = element[0];
                sideScroll.update(element);
            });

            element.on('hover:enter', function () {
                if (item.action) {
                    item.action();
                    return;
                }

                category = item.category;
                query = '';

                renderMenu();
                renderGrid();
                focusFirstCard();
            });

            return element;
        }

        function renderMenu() {
            var currentQueryResults = query ? visibleChannels().length : 0;
            var items = [];

            activeMenuItem = null;

            items.push({
                label: 'Все каналы',
                icon: ICONS.list,
                count: channels.length,
                category: {
                    type: 'all'
                },
                active: category.type === 'all'
            });

            items.push({
                label: 'Избранное',
                icon: ICONS.star,
                count: favorites().length,
                category: {
                    type: 'favorites'
                },
                active: category.type === 'favorites'
            });

            items.push({
                label: 'Поиск',
                icon: ICONS.search,
                count: category.type === 'search' && query ? currentQueryResults : 0,
                category: {
                    type: 'search'
                },
                active: category.type === 'search',
                action: function () {
                    openSearch();
                }
            });

            groups.forEach(function (group) {
                items.push({
                    label: group.name,
                    icon: ICONS.folder,
                    count: group.count,
                    category: {
                        type: 'group',
                        value: group.name
                    },
                    active: category.type === 'group' && category.value === group.name
                });
            });

            sideScroll.clear();

            var activeElement = null;

            items.forEach(function (item) {
                var element = buildMenuItem(item);

                sideScroll.append(element);

                if (item.active) activeElement = element;
            });

            if (activeElement) {
                activeMenuItem = activeElement;
                sideScroll.update(activeElement);
            }
        }

        function buildCard(channel) {
            var element = $(
                '<div class="tvp-card selector">' +
                    '<div class="tvp-card__inner">' +
                        '<div class="tvp-card__logo"></div>' +
                        '<div class="tvp-card__info">' +
                            '<div class="tvp-card__prog"></div>' +
                            '<div class="tvp-card__bar"><i></i></div>' +
                        '</div>' +
                    '</div>' +
                '</div>'
            );

            var logoBox = element.find('.tvp-card__logo');
            var favorite = isFavorite(channel);

            if (favorite) {
                element.find('.tvp-card__inner').append('<div class="tvp-card__fav">' + ICONS.fav + '</div>');
            }

            function showCode() {
                logoBox.html('<div class="tvp-card__code">' + escapeHtml(channelCode(channel.name)) + '</div>');
            }

            if (channel.logo) {
                var image = $('<img alt="">');

                image.on('error', function () {
                    image.remove();
                    showCode();
                });

                logoBox.append(image);
                image.attr('src', channel.logo);
            } else {
                showCode();
            }

            var entry = {
                element: element,
                channel: channel,
                program: element.find('.tvp-card__prog'),
                bar: element.find('.tvp-card__bar i')
            };

            updateCard(entry);

            element.on('hover:focus', function () {
                lastFocus = element[0];
                gridScroll.update(element);
            });

            element.on('hover:enter', function () {
                play(channel);
            });

            element.on('hover:long', function () {
                showChannelMenu(channel);
            });

            return entry;
        }

        function updateCard(entry) {
            var now = Date.now();
            var program = epgReady ? programAt(entry.channel, now) : null;

            if (program) {
                entry.program.text(program.title);
                entry.bar.css('width', programPercent(program, now) + '%');
            } else {
                entry.program.text(entry.channel.name);
                entry.bar.css('width', '0%');
            }

            entry.program.attr('title', entry.program.text());
        }

        function updateCards() {
            cards.forEach(updateCard);
        }

        function renderGrid() {
            var list = visibleChannels();

            hideEmpty();
            grid.empty();
            cards = [];
            renderList = list;
            renderIndex = 0;
            moreElement = null;

            if (category.type === 'search' && !query) {
                showEmpty('Поиск каналов', 'Нажмите на лупу или пункт «Поиск», чтобы найти канал по названию или группе.');
                Lampa.Controller.collectionSet(root[0]);
                return;
            }

            if (!list.length) {
                showEmpty(
                    category.type === 'favorites' ? 'В избранном пусто' : 'Ничего не найдено',
                    category.type === 'favorites'
                        ? 'Удерживайте OK на канале, чтобы добавить его в избранное.'
                        : 'Попробуйте изменить запрос или выбрать другую категорию.'
                );
                Lampa.Controller.collectionSet(root[0]);
                return;
            }

            appendChunk();
        }

        function appendChunk() {
            var start = cards.length;
            var end = Math.min(renderList.length, renderIndex + RENDER_LIMIT);

            for (var i = renderIndex; i < end; i++) {
                var entry = buildCard(renderList[i]);

                cards.push(entry);
                grid.append(entry.element);
            }

            renderIndex = end;

            if (moreElement) {
                moreElement.remove();
                moreElement = null;
            }

            if (renderIndex < renderList.length) {
                moreElement = $('<div class="tvp-more selector">Показать ещё</div>');

                moreElement.on('hover:focus', function () {
                    lastFocus = moreElement[0];
                    gridScroll.update(moreElement);
                });

                moreElement.on('hover:enter', function () {
                    appendChunk();

                    if (cards[start]) {
                        Lampa.Controller.focus(cards[start].element[0]);
                    }
                });

                grid.append(moreElement);
            }

            if (start === 0) gridScroll.reset();

            Lampa.Controller.collectionSet(root[0]);
        }

        function focusFirstCard() {
            setTimeout(function () {
                if (destroyed) return;

                if (cards.length) {
                    Lampa.Controller.focus(cards[0].element[0]);
                } else if (activeMenuItem && activeMenuItem[0] && activeMenuItem[0].offsetParent) {
                    Lampa.Controller.focus(activeMenuItem[0]);
                } else {
                    var fallback = root.find('.tvp-menu-item.selector')[0] || root.find('.tvp__search')[0];

                    if (fallback) Lampa.Controller.focus(fallback);
                }
            }, 30);
        }

        function openSearch() {
            if (!Lampa.Input || typeof Lampa.Input.edit !== 'function') {
                Lampa.Noty.show('Ввод текста недоступен в этой версии Лампы');
                return;
            }

            $('body').addClass('ambience--enable');

            Lampa.Input.edit({
                title: 'Поиск каналов',
                value: query,
                free: true,
                nosave: true
            }, function (value) {
                $('body').removeClass('ambience--enable');

                query = trim(value);
                category = {
                    type: 'search'
                };

                Lampa.Controller.toggle('content');

                renderMenu();
                renderGrid();
                focusFirstCard();
            });
        }

        function showChannelMenu(channel) {
            var favorite = isFavorite(channel);
            var items = [{
                title: favorite ? 'Убрать из избранного' : 'Добавить в избранное',
                action: 'favorite'
            }];

            Lampa.Select.show({
                title: channel.name,
                items: items,
                onSelect: function (item) {
                    if (item.action === 'favorite') {
                        var added = toggleFavorite(channel);

                        Lampa.Noty.show(added ? 'Добавлено в избранное' : 'Удалено из избранного');

                        renderMenu();
                        renderGrid();
                        focusFirstCard();
                    }

                    Lampa.Controller.toggle('content');
                },
                onBack: function () {
                    Lampa.Controller.toggle('content');
                }
            });
        }

        function play(channel) {
            var list = visibleChannels();
            var index = list.indexOf(channel);

            if (index < 0) {
                list = [channel];
                index = 0;
            }

            if (!Lampa.Player || typeof Lampa.Player.iptv !== 'function') {
                if (!Lampa.Player || typeof Lampa.Player.play !== 'function') {
                    Lampa.Noty.show('Плеер недоступен в этой версии Лампы');
                    return;
                }

                Lampa.Player.play({
                    title: channel.name,
                    url: channel.url
                });
                return;
            }

            function prepare(position, forProgram) {
                var source = list[position];

                if (!source) return null;

                var prepared = {
                    name: source.name,
                    group: source.group || '',
                    logo: source.logo || '',
                    url: source.url,
                    tvgId: source.tvgId,
                    tvgName: source.tvgName,
                    icons: []
                };

                if (isFavorite(source)) prepared.icons.push(ICONS.fav);

                if (!forProgram) {
                    var programs = programsFor(source);
                    var programIndex = programs && programs.length
                        ? programPosition(source, Date.now())
                        : 0;

                    if (typeof Lampa.Player.programReady === 'function') {
                        setTimeout(function () {
                            if (destroyed) return;

                            Lampa.Player.programReady({
                                channel: prepared,
                                position: programIndex,
                                total: programs ? programs.length : 0
                            });
                        }, 20);
                    }
                }

                return prepared;
            }

            Lampa.Player.iptv({
                position: index,
                total: list.length,
                onGetChannel: function (position) {
                    return prepare(position, false);
                },
                onGetProgram: function (playerChannel, position, container) {
                    var box = $(container);

                    box.empty();

                    var programs = programsFor(playerChannel);

                    if (!programs || !programs.length) {
                        box.append('<div class="player-panel-iptv-item__prog-load">Нет программы передач</div>');
                        return;
                    }

                    var now = Date.now();
                    var slice = programs.slice(position, position + 3);

                    slice.forEach(function (program) {
                        var isNow = now >= program.start && now < program.stop;
                        var item = $('<div class="player-panel-iptv-item__prog-item"><span></span></div>');

                        item.find('span').text(
                            timeHHMM(program.start) +
                            (isNow ? ' - ' + timeHHMM(program.stop) : '') +
                            '   ' + program.title
                        );

                        if (isNow) {
                            item.addClass('watch');
                            item.append(
                                '<div class="player-panel-iptv-item__prog-timeline">' +
                                    '<div style="width:' + programPercent(program, now) + '%"></div>' +
                                '</div>'
                            );
                        }

                        box.append(item);
                    });
                }
            });
        }

        function onResize() {
            if (destroyed) return;

            Lampa.Layer.update(root);
        }

        function startTimer() {
            clearInterval(timer);
            timer = setInterval(function () {
                if (destroyed) return;

                updateCards();
            }, 30000);
        }

        this.create = function () {
            build();

            return root;
        };

        this.initialize = function () {
            if (loading) return;

            var token = ++loadToken;

            loading = true;

            if (this.activity) this.activity.loader(true);

            title.text(trim(getSetting(KEYS.name, 'Основной')) || 'Основной');
            sourcesSnapshot = sourcesKey();

            loadPlaylist(function (error, data) {
                if (destroyed || token !== loadToken) return;

                loading = false;

                if (error) {
                    if (self.activity) self.activity.loader(false);

                    if (error.type === 'no-playlist') {
                        showEmpty(
                            'Не задан плейлист',
                            'Откройте <b>Настройки → Телевидение</b> и укажите ссылку на плейлист ' +
                            '<b>M3U</b>. Программа передач (<b>XMLTV</b>) необязательна: её адрес можно ' +
                            'взять из заголовка плейлиста или указать отдельно.'
                        );
                    } else if (error.type === 'network') {
                        showEmpty(
                            'Не удалось загрузить плейлист',
                            'Проверьте ссылку и интернет. Если сервер не отдаёт файл из браузера ' +
                            '(CORS), укажите прокси в настройках плагина.<br><br>' +
                            escapeHtml(error.message || '')
                        );
                    } else {
                        showEmpty(
                            'Плейлист пуст или повреждён',
                            'В файле не найдено ни одного канала формата M3U. Проверьте ссылку ' +
                            'в настройках плагина.'
                        );
                    }

                    renderMenu();
                    return;
                }

                channels = data.channels;
                groups = data.groups;

                renderMenu();
                renderGrid();
                focusFirstCard();

                if (self.activity) self.activity.loader(false);

                epgReady = false;

                loadEpg(function () {
                    if (destroyed || token !== loadToken) return;

                    epgReady = true;

                    updateCards();
                });

                startTimer();
            });
        };

        this.start = function () {
            if (destroyed) return;

            Lampa.Layer.update(root);

            title.text(trim(getSetting(KEYS.name, 'Основной')) || 'Основной');

            if (initialized && sourcesSnapshot !== sourcesKey()) {
                resetData();
            }

            if (!initialized) {
                initialized = true;

                this.initialize();
            }

            Lampa.Controller.add('content', {
                invisible: true,
                toggle: function () {
                    Lampa.Controller.collectionSet(root[0]);
                    Lampa.Controller.collectionFocus(lastFocus || false, root[0]);
                },
                left: function () {
                    if (Navigator.canmove('left')) Navigator.move('left');
                    else Lampa.Controller.toggle('menu');
                },
                right: function () {
                    if (Navigator.canmove('right')) Navigator.move('right');
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
        };

        this.pause = function () {};

        this.stop = function () {};

        this.resize = function () {
            onResize();
        };

        this.refreshTitle = function () {
            if (title) title.text(trim(getSetting(KEYS.name, 'Основной')) || 'Основной');
        };

        this.reloadSources = function () {
            if (destroyed || !grid) return;
            if (sourcesSnapshot === sourcesKey()) return;

            resetData();

            initialized = true;

            this.initialize();
        };

        this.render = function () {
            return root;
        };

        this.destroy = function () {
            destroyed = true;

            clearInterval(timer);

            var index = instances.indexOf(this);

            if (index >= 0) instances.splice(index, 1);

            if (sideScroll) sideScroll.destroy();
            if (gridScroll) gridScroll.destroy();

            root.remove();
        };

        instances.push(this);
    }

    // ------------------------------------------------------------------- init

    function addMenuButton() {
        if (window.tv_menu_button) return;

        var button = $(
            '<li class="menu__item selector" data-action="tv">' +
                '<div class="menu__ico">' + ICONS.tv + '</div>' +
                '<div class="menu__text">' + MENU_TITLE + '</div>' +
            '</li>'
        );

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: SCREEN_TITLE,
                component: 'tv',
                page: 1
            });
        });

        $('.menu .menu__list').eq(0).append(button);

        window.tv_menu_button = button;
    }

    function removeMenuButton() {
        if (!window.tv_menu_button) return;

        window.tv_menu_button.remove();
        window.tv_menu_button = null;
    }

    function syncMenu() {
        if (isEnabled()) addMenuButton();
        else removeMenuButton();
    }

    function addSettings() {
        if (window.tv_settings_ready) return;

        window.tv_settings_ready = true;

        Lampa.SettingsApi.addComponent({
            component: 'tv_settings',
            icon: ICONS.tv,
            name: PLUGIN_NAME
        });

        Lampa.SettingsApi.addParam({
            component: 'tv_settings',
            param: {
                name: KEYS.enabled,
                type: 'trigger',
                values: '',
                default: true
            },
            field: {
                name: 'Включить',
                description: 'Показывает раздел «ТВ» в левом меню'
            },
            onChange: function () {
                syncMenu();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'tv_settings',
            param: {
                name: KEYS.name,
                type: 'input',
                values: '',
                placeholder: 'Основной',
                default: 'Основной'
            },
            field: {
                name: 'Название раздела',
                description: 'Заголовок над списком категорий'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'tv_settings',
            param: {
                type: 'title'
            },
            field: {
                name: 'Источники'
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'tv_settings',
            param: {
                name: KEYS.playlist,
                type: 'input',
                values: '',
                placeholder: 'https://example.com/playlist.m3u',
                default: ''
            },
            field: {
                name: 'Плейлист (M3U)',
                description: 'Ссылка на плейлист вашего IPTV-провайдера'
            },
            onChange: function () {
                clearMemory();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'tv_settings',
            param: {
                name: KEYS.epg,
                type: 'input',
                values: '',
                placeholder: 'не задан',
                default: ''
            },
            field: {
                name: 'Программа (XMLTV)',
                description: 'Необязательно: если пусто, берётся из заголовка плейлиста (x-tvg-url)'
            },
            onChange: function () {
                clearMemory();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'tv_settings',
            param: {
                name: KEYS.proxy,
                type: 'input',
                values: '',
                placeholder: 'не задан',
                default: ''
            },
            field: {
                name: 'Прокси для M3U и XMLTV',
                description: 'Если сервер не отдаёт файл из-за CORS. Вставьте {url} вместо ссылки или адрес, к которому она добавляется'
            },
            onChange: function () {
                clearMemory();
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'tv_settings',
            param: {
                type: 'button',
                name: 'tv_refresh'
            },
            field: {
                name: 'Обновить данные',
                description: 'Сбросить кэш плейлиста и программы передач'
            },
            onChange: function () {
                clearMemory();
                Lampa.Noty.show('Кэш телевидения сброшен');
            }
        });
    }

    function injectStyle() {
        if (document.getElementById('tv-plugin-style')) return;

        var style = document.createElement('style');

        style.id = 'tv-plugin-style';
        style.type = 'text/css';
        style.appendChild(document.createTextNode(CSS));

        document.head.appendChild(style);
    }

    function watchSettings() {
        if (window.tv_storage_listener) return;
        if (!Lampa.Storage || !Lampa.Storage.listener || !Lampa.Storage.listener.follow) return;

        window.tv_storage_listener = true;

        Lampa.Storage.listener.follow('change', function (event) {
            var name = event && event.name;

            if (!name) return;

            if (name === KEYS.playlist || name === KEYS.epg || name === KEYS.proxy) {
                instances.forEach(function (instance) {
                    instance.reloadSources();
                });
            }

            if (name === KEYS.name) {
                instances.forEach(function (instance) {
                    instance.refreshTitle();
                });
            }
        });
    }

    function init() {
        injectStyle();

        if (!Lampa.Component.get('tv')) {
            Lampa.Component.add('tv', TvComponent);
        }

        addSettings();
        watchSettings();
        syncMenu();
    }

    if (window.appready) init();
    else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') init();
        });
    }
})();
