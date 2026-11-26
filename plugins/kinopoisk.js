/* ========================================================================
 * Кинопоиск — «Буду смотреть»
 * файл-источник: src/kinopoisk.js
 * регистрирует: компонент kinopoisk, раздел настроек kinopoisk_settings, кнопка в левом меню
 * примечание: список показывается из кэша, TMDB-идентификаторы догружаются в фоне; OAuth-токен уходит только в собственный Cloudflare Worker
 * ======================================================================== */

try {
(function() {
    'use strict';
    var network = new Lampa.Reguest();

    // Адрес самого плагина: если он раздается с того же домена, что и прокси
    // (Cloudflare Worker), адрес прокси подставляется автоматически.
    var SELF_ORIGIN = (function() {
        try {
            var src = document.currentScript && document.currentScript.src;
            return src ? new URL(src).origin : '';
        } catch (e) {
            return '';
        }
    })();

    var PROXY_PATH = '/kp';

    function getStoredProxyUrl() {
        return String(Lampa.Storage.get('kinopoisk_proxy_url', '') || '').trim().replace(/\/+$/, '');
    }

    function getProxyUrl() {
        var url = getStoredProxyUrl();
        if (!url && SELF_ORIGIN) url = SELF_ORIGIN + PROXY_PATH;
        return String(url || '').trim().replace(/\/+$/, '');
    }

    // ---------------------------------------------------------------------
    // Список и кэш
    //
    // Список "Буду смотреть" отдается из localStorage сразу. Прокси вместе
    // со списком присылает постер, рейтинг и год Кинопоиска, поэтому карточки
    // видны до обращения к TMDB. Идентификаторы TMDB догружаются в фоне и
    // записываются в те же объекты, которые уже отрисованы.
    // ---------------------------------------------------------------------

    var STORAGE_KEY = 'kinopoisk_movies';
    var LAST_SYNC_KEY = 'kinopoisk_last_sync';
    var LAST_ATTEMPT_KEY = 'kinopoisk_last_attempt';
    var QUICK_SIZE = 20;
    var SYNC_INTERVAL = 5 * 60 * 1000;
    var RETRY_INTERVAL = 60 * 1000;
    var PARTIAL_RETRY = 15 * 1000;
    var ENRICH_LIMIT = 5;
    var REQUEST_TIMEOUT = 15000;
    var COLD_TIMEOUT = 12000;
    var ALLOHA_TOKEN = '04941a9a3ca3ac16e2b4327347bbc1';
    var TMDB_API_KEY = '4ef0d7355d9ffb5151e987764708ce96';
    var DEBUG = false;

    function log() {
        if (!DEBUG) return;

        var args = Array.prototype.slice.call(arguments);

        args.unshift('Kinopoisk');

        console.log.apply(console, args);
    }

    function getCachedMovies() {
        var movies = Lampa.Storage.get(STORAGE_KEY, []);
        if (typeof movies === 'string') {
            try {
                movies = JSON.parse(movies);
            } catch (e) {
                movies = [];
            }
        }
        return Array.isArray(movies) ? movies : [];
    }

    function apiResponse(results) {
        // secuses - опечатка из оригинального плагина, ее читает старый InteractionCategory
        return {
            secuses: true,
            page: 1,
            results: results || []
        };
    }

    function kpKey(item) {
        return item && item.kinopoisk_id ? String(item.kinopoisk_id) : '';
    }

    // Карточке хватает 300x450: на телевизоре это ~22 КБ вместо ~85 КБ.
    function smallPoster(url) {
        if (!url) return '';
        return String(url).replace(/\/(\d{2,4})x(\d{2,4})(\?[^#]*)?$/, function (match, width, height, query) {
            return '/300x450' + (query || '');
        });
    }

    function toRating(value) {
        if (typeof value === 'number') return isFinite(value) ? value : 0;

        var number = parseFloat(String(value == null ? '' : value).replace(',', '.'));

        return isFinite(number) ? number : 0;
    }

    function isFutureDate(value) {
        if (!value) return false;

        var time = new Date(value).getTime();

        return isFinite(time) && time > Date.now();
    }

    // Минимальная карточка из данных Кинопоиска: видна сразу, но пока без id TMDB.
    function createLiteItem(movie) {
        var title = movie.title || {};
        var item = {
            kinopoisk_id: String(movie.id),
            source: 'tmdb',
            poster: movie.poster ? smallPoster(movie.poster) : '',
            vote_average: movie.rating ? toRating(movie.rating) : 0,
            release_date: movie.year ? String(movie.year) + '-01-01' : '',
            _kp_pending: true
        };

        if (movie.series) {
            item._kp_series = true;
            item.name = title.localized || title.original || '';
            item.first_air_date = item.release_date;
        } else {
            item.title = title.localized || title.original || '';
            item.original_title = title.original || '';
        }

        return item;
    }

    // Обновляем только недостающие поля, чтобы не затереть данные TMDB.
    function applyListMeta(item, movie) {
        var title = movie.title || {};
        var rating;

        if (!item.poster && !item.poster_path && movie.poster) item.poster = smallPoster(movie.poster);

        if (!item.vote_average && movie.rating) {
            rating = toRating(movie.rating);
            if (rating) item.vote_average = rating;
        }

        if (!item.release_date && movie.year) item.release_date = String(movie.year) + '-01-01';

        if (movie.series) {
            item._kp_series = true;
            if (!item.name) item.name = title.localized || title.original || item.title || '';
            if (!item.first_air_date && item.release_date) item.first_air_date = item.release_date;
        } else if (!item.title) {
            item.title = title.localized || title.original || item.name || '';
        }
    }

    // Пересобираем список в порядке Кинопоиска, переиспользуя объекты:
    // карточки держат ссылки, поэтому их не нужно перерисовывать.
    function mergeList(incoming, complete) {
        var cached = getCachedMovies();
        var byKp = {};
        var seen = {};
        var merged = [];
        var added = [];

        cached.forEach(function (item) {
            var key = kpKey(item);
            if (key) byKp[key] = item;
        });

        incoming.forEach(function (raw) {
            var movie = raw && raw.movie;
            var key;
            var item;

            if (!movie || movie.id == null) return;

            key = String(movie.id);
            if (seen[key]) return;
            seen[key] = true;

            item = byKp[key];

            if (item) {
                applyListMeta(item, movie);
            } else {
                item = createLiteItem(movie);
                added.push(item);
            }

            merged.push(item);
        });

        // Неполный ответ (ошибка одной из страниц) не должен чистить кэш.
        if (!complete) {
            cached.forEach(function (item) {
                var key = kpKey(item);
                if (key && !seen[key]) merged.push(item);
            });
        }

        Lampa.Storage.set(STORAGE_KEY, merged);

        return { movies: merged, added: added, complete: complete };
    }

    function getWatchlist(data) {
        var profile = data && data.data && data.data.userProfile;
        var userData = profile && profile.userData;

        return userData && userData.plannedToWatch && userData.plannedToWatch.movies;
    }

    function applyListResponse(data, mode) {
        var movies = getWatchlist(data);
        var meta = (data && data.meta) || {};
        var complete;

        if (!movies || !Array.isArray(movies.items)) return null;

        if (mode === 'quick') {
            if (typeof meta.complete === 'boolean') {
                complete = meta.complete;
            } else if (!data.meta && movies.items.length > QUICK_SIZE) {
                // старый Worker без limit/offset вернул сразу весь список
                complete = true;
            } else {
                complete = movies.items.length < QUICK_SIZE;
            }
        } else {
            complete = typeof meta.complete === 'boolean' ? meta.complete : true;
        }

        return mergeList(movies.items, complete);
    }

    function requestList(mode, callback) {
        var oauth = Lampa.Storage.get('kinopoisk_access_token');
        var proxy = getProxyUrl();
        var payload;
        var proxy_key;

        if (!oauth) {
            log('No access token, remote list is disabled');
            callback({ status: 0, silent: true });
            return;
        }

        if (!proxy) {
            callback({
                status: 0,
                message: 'Не задан адрес прокси: Настройки - Кинопоиск - Адрес прокси'
            });
            return;
        }

        payload = {
            oauth: oauth
        };

        proxy_key = Lampa.Storage.get('kinopoisk_proxy_key', '');
        if (proxy_key) payload.key = proxy_key;

        if (mode === 'quick') {
            payload.offset = 0;
            payload.limit = QUICK_SIZE;
        }

        log('Request list', mode);

        network.silent(proxy, function (data) {
            callback(null, data || {});
        }, function (error) {
            callback(error || { status: 0 });
        }, payload, {
            type: 'post',
            timeout: 120000
        });
    }

    var last_notify_at = 0;

    function notify(message) {
        if (Date.now() - last_notify_at < 30000) return;

        last_notify_at = Date.now();

        Lampa.Noty.show(message);
    }

    function proxyMessage(error) {
        var status = error && error.status ? error.status : 0;

        if (status === 403) return 'Прокси: неверный ключ (Настройки - Кинопоиск)';
        if (!status) return 'Прокси недоступен: проверьте адрес и интернет';
        if (status === 200) return 'Кинопоиск вернул ошибку';

        return 'Прокси ответил ошибкой ' + status;
    }

    function graphqlMessage(data) {
        var message = data && data.errors && data.errors[0] && data.errors[0].message;

        return message ? 'Кинопоиск: ' + message : '';
    }

    // ---------------------------------------------------------------------
    // Фоновая догрузка id TMDB
    // ---------------------------------------------------------------------

    var save_timer = null;
    var enrich_queue = [];
    var enrich_queued = {};
    var enrich_active = 0;

    function saveSoon() {
        if (save_timer) return;

        save_timer = setTimeout(function () {
            save_timer = null;

            Lampa.Storage.set(STORAGE_KEY, getCachedMovies());
        }, 2500);
    }

    function applyAlloha(item, data) {
        var tmdb = Number(data.id_tmdb);
        var series = Number(data.category) === 2 || (!!item._kp_series && !data.category);
        var date = data.premiere_ru || data.premiere || '';
        var poster = data.poster || '';
        var rating = toRating(data.rating_kp);

        if (!tmdb || !isFinite(tmdb)) return false;

        item.id = tmdb;
        item.source = 'tmdb';

        if (series) {
            item._kp_series = true;
            item.name = data.name || item.name || item.title || '';
            item.original_name = data.original_name || item.original_name || '';

            if (!item.first_air_date) item.first_air_date = date || item.release_date || '';
            if (!item.release_date || /-01-01$/.test(item.release_date)) item.release_date = item.first_air_date;
        } else {
            item.title = item.title || data.name || '';
            item.original_title = item.original_title || data.original_name || '';

            if (date && (!item.release_date || /-01-01$/.test(item.release_date))) item.release_date = date;
        }

        if (!item.poster && !item.poster_path && poster) item.poster = smallPoster(poster);
        if (!item.vote_average && rating) item.vote_average = rating;

        delete item._kp_pending;

        return true;
    }

    function applyTmdbResult(item, result) {
        var series = !!item._kp_series || (!!result.name && !result.title);

        item.id = result.id;
        item.source = 'tmdb';

        if (series) {
            item._kp_series = true;
            item.name = result.name || result.title || item.name || '';
            item.original_name = result.original_name || result.original_title || item.original_name || '';
            item.first_air_date = result.first_air_date || item.first_air_date || '';
            item.release_date = item.release_date || item.first_air_date;
        } else {
            item.title = result.title || item.title || '';
            item.original_title = result.original_title || item.original_title || '';
            item.release_date = result.release_date || item.release_date || '';
        }

        if (result.poster_path && !item.poster_path) item.poster_path = result.poster_path;
        if (result.vote_average && !item.vote_average) item.vote_average = result.vote_average;

        delete item._kp_pending;
    }

    function tmdbBase() {
        return Lampa.Utils.protocol() + 'tmdb.' + Lampa.Manifest.cub_domain;
    }

    function pickTmdbResult(data, series) {
        var movie = data && data.movie_results && data.movie_results[0];
        var tv = data && data.tv_results && data.tv_results[0];

        return series ? (tv || movie) : (movie || tv);
    }

    function findTmdb(item, imdb, done) {
        if (!imdb) {
            done(false);
            return;
        }

        var url = tmdbBase() + '/3/find/' + encodeURIComponent(imdb) +
            '?api_key=' + TMDB_API_KEY + '&language=ru&external_source=imdb_id';

        requestGet(url, function (data) {
            var result = pickTmdbResult(data, !!item._kp_series);

            if (!result || !result.id) {
                done(false);
                return;
            }

            applyTmdbResult(item, result);
            done(true);
        }, function () {
            done(false);
        });
    }

    function searchTmdb(item, done) {
        var query = item.title || item.name || '';
        var series = !!item._kp_series;
        var year = String(item.release_date || item.first_air_date || '').slice(0, 4);
        var url;

        if (!query) {
            done(false);
            return;
        }

        url = tmdbBase() + '/3/search/' + (series ? 'tv' : 'movie') +
            '?query=' + encodeURIComponent(query) +
            '&api_key=' + TMDB_API_KEY + '&language=ru';

        if (year) {
            url += (series ? '&first_air_date_year=' : '&year=') + encodeURIComponent(year);
        }

        requestGet(url, function (data) {
            var result = data && data.results && data.results[0];

            if (!result || !result.id) {
                done(false);
                return;
            }

            applyTmdbResult(item, result);
            done(true);
        }, function () {
            done(false);
        });
    }

    function maybeFavorite(item) {
        if (!isFutureDate(item.release_date || item.first_air_date)) return;
        if (!Lampa.Storage.get('kinopoisk_add_to_favorites', false)) return;

        try {
            Lampa.Favorite.add('wath', item, 100);
        } catch (e) {
            log('Favorite add error', e);
        }
    }

    function requestGet(url, success, error) {
        var params = {
            type: 'get',
            timeout: REQUEST_TIMEOUT
        };

        // quiet не копит ссылки на сотни запросов в памяти, как silent
        if (network.quiet) network.quiet(url, success, error, false, params);
        else network.silent(url, success, error, false, params);
    }

    function requestAllohaOnce(url, callback) {
        requestGet(url, function (data) {
            if (data && data.status === 'success' && data.data) callback(data.data, true);
            else callback(null, true); // ответ получен, повторы не помогут
        }, function () {
            callback(null, false); // сеть/таймаут: имеет смысл повторить
        });
    }

    function loadAlloha(kp, callback) {
        var url = 'https://api.alloha.tv/?token=' + ALLOHA_TOKEN + '&kp=' + encodeURIComponent(kp);

        requestAllohaOnce(url, function (data, definitive) {
            if (data || definitive) {
                callback(data);
                return;
            }

            // один повтор: не теряем фильм из-за короткого обрыва сети
            setTimeout(function () {
                requestAllohaOnce(url, function (retry) {
                    callback(retry);
                });
            }, 700);
        });
    }

    function enrichOne(item, done) {
        var finished = false;

        function finish(ok) {
            if (finished) return;
            finished = true;

            if (ok) {
                saveSoon();
                updateCardVisual(item);
                maybeFavorite(item);
                log('Enriched', item.kinopoisk_id, item.id);
            } else {
                log('Not enriched', item.kinopoisk_id);
            }

            done();
        }

        loadAlloha(String(item.kinopoisk_id), function (data) {
            if (data && data.id_tmdb && applyAlloha(item, data)) {
                finish(true);
                return;
            }

            if (data && data.id_imdb) {
                if (Number(data.category) === 2) item._kp_series = true;

                findTmdb(item, data.id_imdb, function (ok) {
                    if (ok) finish(true);
                    else searchTmdb(item, finish);
                });
                return;
            }

            searchTmdb(item, finish);
        });
    }

    function updateCardVisual(item) {
        var comp = active_comp;
        var card = null;
        var node;
        var img;
        var rating;
        var vote;
        var view;
        var age;

        if (!comp || comp._kp_destroyed || !comp.items) return;

        for (var i = 0; i < comp.items.length; i++) {
            if (comp.items[i] && comp.items[i].data === item) {
                card = comp.items[i];
                break;
            }
        }

        if (!card) return;

        node = card.card || card.html;
        if (!node) return;

        img = card.img;
        if (img && item.poster && img.src && String(img.src).indexOf('img_broken') >= 0) {
            img.src = item.poster;
        }

        if (item.vote_average && !node.querySelector('.card__vote')) {
            view = node.querySelector('.card__view');
            rating = parseFloat(item.vote_average);

            if (view && isFinite(rating) && rating > 0) {
                vote = document.createElement('div');
                vote.className = 'card__vote';
                vote.innerText = rating >= 10 ? '10' : rating.toFixed(1);
                view.appendChild(vote);
            }
        }

        age = node.querySelector('.card__age');
        if (age && !age.innerText && item.release_date) {
            age.innerText = String(item.release_date).slice(0, 4);
        }
    }

    function enrichItem(item) {
        if (!item || !item._kp_pending || item.id) return;

        enqueue(item, true);
    }

    function enqueue(item, urgent) {
        var key = kpKey(item);

        if (!key || enrich_queued[key]) return;

        enrich_queued[key] = true;

        if (urgent) enrich_queue.unshift(item);
        else enrich_queue.push(item);

        pumpEnrichment();
    }

    function startEnrichment() {
        var movies = getCachedMovies();

        for (var i = 0; i < movies.length; i++) {
            if (movies[i] && movies[i]._kp_pending && !movies[i].id) enqueue(movies[i], false);
        }

        pumpEnrichment();
    }

    function pumpEnrichment() {
        while (enrich_active < ENRICH_LIMIT && enrich_queue.length) {
            var item = enrich_queue.shift();
            var key = kpKey(item);

            if (!key) continue;

            if (!item._kp_pending || item.id) {
                delete enrich_queued[key];
                continue;
            }

            enrich_active++;

            (function (current, current_key) {
                try {
                    enrichOne(current, function () {
                        enrich_active--;
                        delete enrich_queued[current_key];
                        pumpEnrichment();
                    });
                } catch (e) {
                    enrich_active--;
                    delete enrich_queued[current_key];
                    console.error('Kinopoisk', 'enrich error', e);
                }
            })(item, key);
        }
    }

    // ---------------------------------------------------------------------
    // Синхронизация списка
    // ---------------------------------------------------------------------

    var sync_state = {
        running: false,
        waiters: [],
        quick_served: false
    };

    function syncList(options) {
        options = options || {};

        var cold = !!options.cold;

        if (sync_state.running) {
            if (cold && typeof options.onFirst === 'function') sync_state.waiters.push(options.onFirst);
            return;
        }

        if (!cold) {
            var last = Number(Lampa.Storage.get(LAST_SYNC_KEY, 0)) || 0;
            var attempt = Number(Lampa.Storage.get(LAST_ATTEMPT_KEY, 0)) || 0;

            if (last && Date.now() - last < SYNC_INTERVAL) {
                startEnrichment();
                return;
            }

            // неполный список (получили первую страницу, а полную — нет)
            // пробуем добрать быстрее, чем после обычной ошибки
            var retry = !last && getCachedMovies().length ? PARTIAL_RETRY : RETRY_INTERVAL;

            if (attempt && Date.now() - attempt < retry) {
                startEnrichment();
                return;
            }
        }

        sync_state.running = true;
        sync_state.quick_served = false;
        sync_state.waiters = cold && typeof options.onFirst === 'function' ? [options.onFirst] : [];

        Lampa.Storage.set(LAST_ATTEMPT_KEY, Date.now());

        function getWaiters() {
            var waiters = sync_state.waiters;
            var cache = getCachedMovies();
            var served = 0;

            sync_state.waiters = [];

            waiters.forEach(function (fn) {
                try {
                    // timeout мог уже отдать пустой экран; serve() вернет false
                    if (fn(apiResponse(cache)) !== false) served++;
                } catch (e) {
                    console.error('Kinopoisk', e);
                }
            });

            return served;
        }

        function stop() {
            sync_state.running = false;
            startEnrichment();
        }

        function fail(error, message) {
            log('Sync failed', error);

            if (!(error && error.silent) && (cold || message)) {
                notify(message || proxyMessage(error));
            } else if (error && error.status === 403) {
                notify(proxyMessage(error));
            }

            getWaiters();
            sync_state.running = false;
        }

        function applyResponse(data, mode) {
            var result = applyListResponse(data, mode);

            if (!result) log('No watchlist in response');

            return result;
        }

        function requestFull() {
            requestList('full', function (error, data) {
                var result;
                var served;

                if (error) {
                    fail(error);
                    return;
                }

                result = applyResponse(data, 'full');

                if (!result) {
                    fail(data, graphqlMessage(data));
                    return;
                }

                served = getWaiters() > 0;

                if (result.complete) Lampa.Storage.set(LAST_SYNC_KEY, Date.now());

                var shouldAppend = !served || sync_state.quick_served;

                stop();

                if (shouldAppend) appendNew(result.added);
            });
        }

        if (!cold) {
            requestFull();
            return;
        }

        requestList('quick', function (error, data) {
            var result;

            if (error) {
                requestFull();
                return;
            }

            result = applyResponse(data, 'quick');

            if (!result) {
                requestFull();
                return;
            }

            sync_state.quick_served = getWaiters() > 0;

            startEnrichment();

            if (result.complete) {
                Lampa.Storage.set(LAST_SYNC_KEY, Date.now());

                var shouldAppend = !sync_state.quick_served;

                stop();

                if (shouldAppend) appendNew(result.added);
            } else {
                requestFull();
            }
        });
    }

    function full(params, oncomplete, onerror) {
        var cached = getCachedMovies();
        var served = false;
        var timer = null;

        if (cached.length) {
            oncomplete(apiResponse(cached));
            syncList({});
            startEnrichment();
            return;
        }

        function serve(data) {
            if (served) return false;

            served = true;

            if (timer) {
                clearTimeout(timer);
                timer = null;
            }

            oncomplete(data);

            return true;
        }

        timer = setTimeout(function () {
            timer = null;
            log('Cold start timeout');
            serve(apiResponse(getCachedMovies()));
        }, COLD_TIMEOUT);

        syncList({ cold: true, onFirst: serve });
        startEnrichment();
    }

    function clear() {
        network.clear();
    }
    var Api = {
        full: full,
        clear: clear
    };

    // ---------------------------------------------------------------------
    // Компонент
    // ---------------------------------------------------------------------

    var active_comp = null;

    function prepareRender(items) {
        if (!Lampa.Card) return items;

        items.forEach(function (item) {
            if (item && item._kp_pending && !item.id && !item.cardClass) {
                item.cardClass = pendingCardClass;
            }
        });

        return items;
    }

    function appendChunks(comp, items) {
        if (!items || !items.length) return;

        var index = 0;

        prepareRender(items);

        function step() {
            var chunk;

            if (!comp || comp._kp_destroyed) return;

            chunk = items.slice(index, index + 30);
            index += chunk.length;

            if (chunk.length) {
                try {
                    comp.append({ results: chunk }, true);
                } catch (e) {
                    console.error('Kinopoisk', e);
                }
            }

            if (index < items.length) {
                setTimeout(step, 16);
            } else {
                try {
                    comp.limit();
                } catch (e) {}
            }
        }

        step();
    }

    function refreshActive() {
        try {
            var current = Lampa.Activity.active();

            if (current && current.component === 'kinopoisk') Lampa.Activity.refresh();
        } catch (e) {}
    }

    function appendNew(items) {
        var comp = active_comp;

        if (!items || !items.length) return;

        if (!comp || comp._kp_destroyed) return;

        // не трогаем DOM, если пользователь уже ушел с раздела
        try {
            var current = Lampa.Activity.active();

            if (!current || current.component !== 'kinopoisk') return;
        } catch (e) {}

        if (!comp._kp_built) {
            if (comp._kp_empty) refreshActive();
            return;
        }

        appendChunks(comp, items);
    }

    function pendingCardClass(element, params) {
        var card = new Lampa.Card(element, params);
        var enter = null;

        function pendingEnter() {
            Lampa.Noty.show('Кинопоиск: фильм ещё загружается, подождите пару секунд');
            enrichItem(element);
        }

        try {
            Object.defineProperty(card, 'onEnter', {
                configurable: true,
                get: function () {
                    if (element._kp_pending && !element.id) return pendingEnter;
                    return enter;
                },
                set: function (fn) {
                    enter = fn;
                }
            });
        } catch (e) {
            log('cardClass accessor failed', e);
        }

        return card;
    }

    function component(object) {
        var comp = new Lampa.InteractionCategory(object);
        var original_build = comp.build;
        var original_empty = comp.empty;
        var original_destroy = comp.destroy;

        comp.build = function (data) {
            var has = !!(data && data.results && data.results.length);

            comp._kp_built = has;
            comp._kp_empty = !has;

            return original_build.call(comp, data);
        };

        comp.empty = function (status) {
            comp._kp_empty = true;

            return original_empty.call(comp, status);
        };

        comp.create = function () {
            active_comp = comp;
            comp._kp_built = false;
            comp._kp_empty = false;

            Api.full(object, function (data) {
                var results;
                var first;

                if (comp._kp_destroyed) return;

                results = data && data.results ? data.results : [];
                first = results.slice(0, 60);

                prepareRender(first);

                comp.build(apiResponse(first));

                if (results.length > first.length) appendChunks(comp, results.slice(first.length));
            }, function () {
                if (!comp._kp_destroyed) comp.empty();
            });
        };

        comp.nextPageReuest = function (object, resolve, reject) {
            resolve(apiResponse(getCachedMovies()));
        };

        comp.destroy = function () {
            comp._kp_destroyed = true;

            if (active_comp === comp) active_comp = null;

            if (original_destroy) original_destroy.call(comp);
        };

        return comp;
    }

    if (window.addEventListener) {
        window.addEventListener('beforeunload', function () {
            if (save_timer) {
                clearTimeout(save_timer);
                save_timer = null;

                Lampa.Storage.set(STORAGE_KEY, getCachedMovies());
            }
        });
    }

    // getting/refreshing oauth kinopoisk token
    var KINOPOISK_CLIENT_ID = 'b8b9c7a09b79452094e12f6990009934';
    var KINOPOISK_CLIENT_SECRET = '0e7001e272944c05ae5a0df16e3ea8bd';

    var auth_poll_timer = null;
    var auth_poll_stopped = true;
    var proxy_setup_pending = false;

    function stopAuthPolling() {
        auth_poll_stopped = true;

        if (auth_poll_timer) {
            clearTimeout(auth_poll_timer);
            auth_poll_timer = null;
        }
    }

    function requestToken(device_code, refresh, callbacks) {
        callbacks = callbacks || {};

        var token_data;

        if (!refresh) {
            token_data = {
                'grant_type': 'device_code',
                'code': device_code,
                'client_id': KINOPOISK_CLIENT_ID,
                'client_secret': KINOPOISK_CLIENT_SECRET
            };
        } else { // refresh token
            token_data = {
                'grant_type': 'refresh_token',
                'refresh_token': device_code,
                'client_id': KINOPOISK_CLIENT_ID,
                'client_secret': KINOPOISK_CLIENT_SECRET
            };
        }

        network.silent('https://oauth.yandex.ru/token', function(data) { // on token success
            if (data.access_token) {
                stopAuthPolling();

                Lampa.Storage.set('kinopoisk_access_token', data.access_token);
                Lampa.Storage.set('kinopoisk_refresh_token', data.refresh_token);
                Lampa.Storage.set('kinopoisk_token_expires', data.expires_in * 1000 + Date.now());
                Lampa.Modal.close();
                getUserEmail();
                // после входа список нужно забрать заново, даже если кэш свежий
                Lampa.Storage.set(LAST_SYNC_KEY, 0);
                Lampa.Storage.set(LAST_ATTEMPT_KEY, 0);
                afterAuth(refresh);

                if (callbacks.success) callbacks.success(data);
            } else if (callbacks.error) {
                callbacks.error(null, data);
            } else {
                Lampa.Noty.show('Не удалось получить token');
                console.log('Kinopoisk', 'Error during OAuth', data.error);
            }
        }, function(data) { // on token error
            var error = data && data.responseJSON && data.responseJSON.error;

            if (callbacks.error) {
                callbacks.error(error, data);
            } else {
                Lampa.Noty.show((data && data.responseJSON && data.responseJSON.error_description) || 'Не удалось получить token');
                console.log('Kinopoisk', 'Token error', data);
            }
        }, token_data);
    }

    function getToken(device_code, refresh) {
        requestToken(device_code, refresh);
    }

    function startAuthPolling(device_code, interval, expires_in, onStatus) {
        stopAuthPolling();
        auth_poll_stopped = false;

        var delay = Math.max(2, Number(interval) || 5);
        var deadline = Date.now() + (Number(expires_in) || 300) * 1000;

        function schedule() {
            if (auth_poll_stopped) return;
            auth_poll_timer = setTimeout(poll, delay * 1000);
        }

        function poll() {
            if (auth_poll_stopped) return;

            if (Date.now() > deadline) {
                stopAuthPolling();
                if (onStatus) onStatus('expired');
                return;
            }

            requestToken(device_code, false, {
                success: function() {
                    stopAuthPolling();
                },
                error: function(error) {
                    if (error === 'authorization_pending') {
                        schedule();
                    } else if (error === 'slow_down') {
                        delay += 5;
                        schedule();
                    } else if (error === 'expired_token' || error === 'invalid_grant') {
                        stopAuthPolling();
                        if (onStatus) onStatus('expired');
                    } else {
                        stopAuthPolling();
                        if (onStatus) onStatus('error', error);
                    }
                }
            });
        }

        schedule();
    }

    // getting oauth user_code
    // https://yandex.ru/dev/id/doc/ru/codes/screen-code-oauth
    function getDeviceCode() {
        stopAuthPolling();

        // generating unique device id
        const uuid4 = () => {
            const ho = (n, p) => n.toString(16).padStart(p, 0);
            const data = crypto.getRandomValues(new Uint8Array(16));
            data[6] = (data[6] & 0xf) | 0x40;
            data[8] = (data[8] & 0x3f) | 0x80;
            const view = new DataView(data.buffer);
            return `${ho(view.getUint32(0), 8)}${ho(view.getUint16(4), 4)}${ho(view.getUint16(6), 4)}${ho(view.getUint16(8), 4)}${ho(view.getUint32(10), 8)}${ho(view.getUint16(14), 4)}`; /// Compile the canonical textual form from the array data
        };
        Lampa.Storage.set('kinopoisk_deviceid', uuid4());
        var device_code_data = {
            'client_id': KINOPOISK_CLIENT_ID,
            'device_id': Lampa.Storage.get('kinopoisk_deviceid', ''),
            'device_name': Lampa.Storage.get('device_name', 'Lampa')
        }
        network.silent('https://oauth.yandex.ru/device/code', function(data) { // on device code success
            if(data.user_code && data.device_code) {
                var verify_url = data.verification_url || 'https://oauth.yandex.ru/device';

                var modal = $(
                    '<div class="kinopoisk-auth">' +
                        '<div class="about kinopoisk-auth__hint"></div>' +
                        '<div class="kinopoisk-auth__qr"></div>' +
                        '<div class="kinopoisk-auth__code"><b>' + data.user_code + '</b></div>' +
                        '<div class="kinopoisk-auth__status about">Ожидание подтверждения…</div>' +
                        '<div class="broadcast__device selector kinopoisk-auth__done">Готово</div>' +
                    '</div>'
                );

                var qr = modal.find('.kinopoisk-auth__qr');
                var status = modal.find('.kinopoisk-auth__status');
                var hint = modal.find('.kinopoisk-auth__hint');
                var code_url = Lampa.Utils.addUrlComponent(verify_url, 'user_code=' + encodeURIComponent(data.user_code));
                var link = '<a href="' + code_url + '" target="_blank" rel="noopener">' + verify_url + '</a>';
                var show_qr = Lampa.Utils && Lampa.Utils.qrcode && (Lampa.Platform.tv() || Lampa.Platform.desktop() || Lampa.Platform.mouse());

                if (show_qr) {
                    hint.html('Отсканируйте QR-код или откройте ' + link + ' и введите код');
                    Lampa.Utils.qrcode(code_url, qr, function() {
                        qr.remove();
                    });
                } else {
                    hint.html('Откройте ' + link + ' и введите код');
                    qr.remove();
                }

                qr.find('svg').css({ width: '100%', height: 'auto', display: 'block' });
                qr.css({
                    display: 'inline-block',
                    background: '#fff',
                    padding: '10px',
                    borderRadius: '10px',
                    width: '260px',
                    maxWidth: '70vw',
                    margin: '16px auto'
                });
                modal.find('.kinopoisk-auth__code').css({
                    fontSize: '2em',
                    letterSpacing: '0.12em',
                    textAlign: 'center',
                    margin: '8px 0'
                });
                modal.find('.kinopoisk-auth__status').css('textAlign', 'center');
                modal.find('.kinopoisk-auth__done').css('textAlign', 'center');

                function showStatus(type) {
                    if (type === 'expired') {
                        status.text('Код истёк. Закройте окно и попробуйте снова.');
                    } else if (type === 'error') {
                        status.text('Не удалось проверить код. Попробуйте ещё раз.');
                    }
                }

                Lampa.Modal.open({
                    title: 'Авторизация Кинопоиска',
                    html: modal,
                    align: 'center',
                    onBack: () => {
                        stopAuthPolling();
                        Lampa.Modal.close();
                    },
                    onSelect: () => { // manual check, then continue waiting if pending
                        stopAuthPolling();
                        status.text('Проверяем…');

                        requestToken(data.device_code, false, {
                            error: function(error) {
                                if (error === 'authorization_pending') {
                                    status.text('Ещё не подтверждено, ждём…');
                                    startAuthPolling(data.device_code, data.interval, data.expires_in, showStatus);
                                } else if (error === 'slow_down') {
                                    status.text('Ещё не подтверждено, ждём…');
                                    startAuthPolling(data.device_code, (Number(data.interval) || 5) + 5, data.expires_in, showStatus);
                                } else if (error === 'expired_token' || error === 'invalid_grant') {
                                    status.text('Код истёк. Закройте окно и попробуйте снова.');
                                } else {
                                    status.text('Не удалось проверить код. Попробуйте ещё раз.');
                                    console.log('Kinopoisk', 'Token check error', error);
                                }
                            }
                        });
                    }
                });

                startAuthPolling(data.device_code, data.interval, data.expires_in, showStatus);
            } else {
                Lampa.Noty.show('Не удалось получить user_code');
                console.log('Kinopoisk', 'Failed to get user_code', data.error);
            }
        }, function(data) { // on device code error
            Lampa.Noty.show((data && data.responseJSON && data.responseJSON.error_description) || 'Не удалось получить код');
            console.log('Kinopoisk', 'Failed to get device code', data);
        }, device_code_data);
    }

    function getUserEmail() {
        network.silent('https://login.yandex.ru/info?format=json', function(data) {
            if (data.default_email) {
                Lampa.Storage.set('kinopoisk_email', data.default_email);

                $('div[data-name="kinopoisk_auth"]').find('.settings-param__name').text(data.default_email); // NOT WORKING?
            } else {
                Lampa.Noty.show('Не удалось получить email пользователя');
                console.log('Kinopoisk', 'Failed to get user email', data.error);                
            }
        }, function(data) { // on device code error
            Lampa.Noty.show(data.responseText);
            console.log('Kinopoisk', 'Failed to get user email', data);
        }, false, {
            type: 'get',
            headers: {
                'Authorization': 'OAuth ' + Lampa.Storage.get('kinopoisk_access_token')
            }
        });
        
    }

    // После первого входа предлагаем сразу настроить прокси: без него список
    // не загрузится. Два окна ввода Lampa: адрес Worker и ключ PROXY_KEY.
    function openProxyInput(params, callback, done) {
        try {
            Lampa.Input.edit(params, callback);
        } catch (e) {
            console.error('Kinopoisk', 'Proxy input error', e);
            Lampa.Noty.show('Не удалось открыть ввод. Настройте прокси в Настройки - Кинопоиск');
            done();
        }
    }

    function promptProxySetup(done) {
        done = done || function () {};

        if (!Lampa.Input || !Lampa.Input.edit) {
            Lampa.Noty.show('Кинопоиск: укажите адрес прокси в Настройки - Кинопоиск');
            done();
            return;
        }

        openProxyInput({
            title: 'Адрес прокси Cloudflare Worker',
            value: getStoredProxyUrl(),
            nosave: true,
            nomic: true
        }, function (value) {
            var url = String(value || '').trim().replace(/\/+$/, '');

            if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;

            if (!url) {
                Lampa.Noty.show('Кинопоиск: без прокси список не загрузится. Адрес можно указать позже в Настройки - Кинопоиск');
                done();
                return;
            }

            Lampa.Storage.set('kinopoisk_proxy_url', url);

            openProxyInput({
                title: 'Ключ прокси (PROXY_KEY), если задан',
                value: Lampa.Storage.get('kinopoisk_proxy_key', ''),
                nosave: true,
                nomic: true
            }, function (key) {
                Lampa.Storage.set('kinopoisk_proxy_key', String(key || '').trim());
                Lampa.Noty.show('Кинопоиск: прокси сохранён');

                done();
            }, done);
        }, done);
    }

    function afterAuth(refresh) {
        // обновление токена не должно открывать мастер настройки
        if (refresh || getStoredProxyUrl()) {
            syncList({});
            return;
        }

        if (proxy_setup_pending) return;

        proxy_setup_pending = true;

        // даем модалке авторизации закрыться, затем показываем ввод
        setTimeout(function () {
            promptProxySetup(function () {
                proxy_setup_pending = false;

                // без сохраненного адреса не дергаем прокси: иначе уйдем
                // на автоопределенный адрес GitHub Pages и получим 404
                if (getStoredProxyUrl()) syncList({});
            });
        }, 500);
    }

    function startPlugin() {
        var manifest = {
            type: 'video',
            version: '0.6.1',
            name: 'Кинопоиск',
            description: 'Список "Буду смотреть" через собственный CORS-прокси',
            component: 'kinopoisk'
        };
        Lampa.Manifest.plugins = manifest;
        Lampa.Component.add('kinopoisk', component);
        if(Lampa.Storage.get('kinopoisk_access_token', '') !== '' && Lampa.Storage.get('kinopoisk_token_expires', 0) < Date.now()) { // refresh token needed
            console.log('Kinopoisk', 'Token should be refreshed')
            getToken(Lampa.Storage.get('kinopoisk_refresh_token', ''), true);
        }

        function add() {
            var button = $("<li class=\"menu__item selector\">\n            <div class=\"menu__ico\">\n                <svg width=\"239\" height=\"239\" viewBox=\"0 0 239 239\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" xml:space=\"preserve\"><path fill=\"currentColor\" d=\"M215 121.415l-99.297-6.644 90.943 36.334a106.416 106.416 0 0 0 8.354-29.69z\" /><path fill=\"currentColor\" d=\"M194.608 171.609C174.933 197.942 143.441 215 107.948 215 48.33 215 0 166.871 0 107.5 0 48.13 48.33 0 107.948 0c35.559 0 67.102 17.122 86.77 43.539l-90.181 48.07L162.57 32.25h-32.169L90.892 86.862V32.25H64.77v150.5h26.123v-54.524l39.509 54.524h32.169l-56.526-57.493 88.564 46.352z\" /><path d=\"M206.646 63.895l-90.308 36.076L215 93.583a106.396 106.396 0 0 0-8.354-29.688z\" fill=\"currentColor\"/></svg>\n            </div>\n            <div class=\"menu__text\">".concat(manifest.name, "</div>\n        </li>"));
            button.on('hover:enter', function() {
                if(Lampa.Storage.get('kinopoisk_access_token', '') == '') { // initial authorization needed
                    getDeviceCode();
                }
                Lampa.Activity.push({
                    url: '',
                    title: manifest.name,
                    component: 'kinopoisk',
                    page: 1
                });
            });
            $('.menu .menu__list').eq(0).append(button);
            // $('.head__actions').eq(0).append(button);
        }
        if(window.appready) add();
        else {
            Lampa.Listener.follow('app', function(e) {
                if(e.type == 'ready') add();
            });
        }
        // SETTINGS
        if(!window.kinopoisk_settings_ready) { // собственный пункт настроек плагина
            window.kinopoisk_settings_ready = true;
            Lampa.SettingsApi.addComponent({
                component: 'kinopoisk_settings',
                icon: '<svg width="239" height="239" viewBox="0 0 239 239" fill="currentColor" xmlns="http://www.w3.org/2000/svg" xml:space="preserve"><path d="M215 121.415l-99.297-6.644 90.943 36.334a106.416 106.416 0 0 0 8.354-29.69z"/><path d="M194.608 171.609C174.933 197.942 143.441 215 107.948 215 48.33 215 0 166.871 0 107.5 0 48.13 48.33 0 107.948 0c35.559 0 67.102 17.122 86.77 43.539l-90.181 48.07L162.57 32.25h-32.169L90.892 86.862V32.25H64.77v150.5h26.123v-54.524l39.509 54.524h32.169l-56.526-57.493 88.564 46.352z"/><path d="M206.646 63.895l-90.308 36.076L215 93.583a106.396 106.396 0 0 0-8.354-29.688z"/></svg>',
                name: 'Кинопоиск'
            });
        }
        Lampa.SettingsApi.addParam({
            component: 'kinopoisk_settings',
            param: {
                type: 'title'
            },
            field: {
                name: 'Свой прокси',
            }
        })
        Lampa.SettingsApi.addParam({
            component: 'kinopoisk_settings',
            param: {
                name: 'kinopoisk_proxy_url',
                type: 'input',
                // values обязателен: Lampa регистрирует input через Params.select,
                // и без строки здесь падает update() при отрисовке настроек
                values: '',
                placeholder: 'не задан',
                default: ''
            },
            field: {
                name: 'Адрес прокси',
                description: 'Cloudflare Worker, например https://kp-proxy.имя.workers.dev/kp. Пусто - взять с домена плагина'
            }
        })
        Lampa.SettingsApi.addParam({
            component: 'kinopoisk_settings',
            param: {
                name: 'kinopoisk_proxy_key',
                type: 'input',
                values: '',
                placeholder: 'не задан',
                default: ''
            },
            field: {
                name: 'Ключ прокси',
                description: 'Необязательно: значение PROXY_KEY, заданное в Worker'
            }
        })

        Lampa.SettingsApi.addParam({
            component: 'kinopoisk_settings',
            param: {
                type: 'title'
            },
            field: {
                name: 'Аккаунт',
            }
        })
        var kinopoisk_email = Lampa.Storage.get('kinopoisk_email', false);
        Lampa.SettingsApi.addParam({
            component: 'kinopoisk_settings',
            param: {
                type: 'button',
                name: 'kinopoisk_auth'
            },
            field: {
                name: kinopoisk_email ? kinopoisk_email : 'Авторизоваться',
            },
            onChange: () => {
                if (Lampa.Storage.get('kinopoisk_email', false)) { // user authorized
                    Lampa.Select.show({
                        title: 'Выйти из аккаунта',
                        items: [{
                            title: 'Да',
                            confirm: true
                        }, {
                            title: 'Нет'
                        }],
                        onSelect: (a) => {
                            if(a.confirm) {
                                Lampa.Storage.set('kinopoisk_email', '');
                                Lampa.Storage.set('kinopoisk_access_token', '');
                                Lampa.Storage.set('kinopoisk_refresh_token', '');
                                Lampa.Storage.set('kinopoisk_token_expires', 0); 
                                Lampa.Storage.set(LAST_SYNC_KEY, 0);
                                Lampa.Storage.set(LAST_ATTEMPT_KEY, 0);
                                // чужой аккаунт не должен показывать старый список
                                enrich_queue = [];
                                enrich_queued = {};
                                Lampa.Storage.set(STORAGE_KEY, []);
                                $('div[data-name="kinopoisk_auth"]').find('.settings-param__name').text('Авторизоваться');                           
                            }

                            Lampa.Controller.toggle('settings_component');
                        },
                        onBack: ()=>{
                            Lampa.Controller.toggle('settings_component');
                        },
                    })
                } else { // user not authorized
                    Lampa.Controller.toContent(); // hide settings menu
                    getDeviceCode(); // start auth process
                }
            }
        });

        Lampa.SettingsApi.addParam({
            component: 'kinopoisk_settings',
            param: {
                type: 'title'
            },
            field: {
                name: 'Список Буду смотреть',
            }
        })
        Lampa.SettingsApi.addParam({
            component: 'kinopoisk_settings',
            param: {
                name: 'kinopoisk_add_to_favorites',
                type: 'trigger',
                default: false
            },
            field: {
                name: 'Добавлять в Избранное',
                description: 'Будущие, еще не вышедшие релизы добавляются в список Позже'
            }
        })        
        Lampa.SettingsApi.addParam({
            component: 'kinopoisk_settings',
            param: {
                type: 'button',
                name: 'kinopoisk_delete_cache'
            },
            field: {
                name: 'Очистить кэш фильмов',
                description: 'Необходимо при возникновении проблем'
            },
            onChange: () => {
                enrich_queue = [];
                enrich_queued = {};
                Lampa.Storage.set(STORAGE_KEY, []);
                Lampa.Storage.set(LAST_SYNC_KEY, 0);
                Lampa.Storage.set(LAST_ATTEMPT_KEY, 0);
                Lampa.Noty.show('Кэш Кинопоиска очищен');
            }
        });        
    }
    if(!window.kinopoisk_ready) startPlugin();
})();
} catch (e) {
    console.error('[lampa-plagin] Кинопоиск — «Буду смотреть» не загрузился:', e);
}
