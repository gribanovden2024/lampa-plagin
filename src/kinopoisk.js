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

    function getProxyUrl() {
        var url = Lampa.Storage.get('kinopoisk_proxy_url', '');
        if (!url && SELF_ORIGIN) url = SELF_ORIGIN + PROXY_PATH;
        return String(url || '').trim().replace(/\/+$/, '');
    }

    function getCachedMovies() {
        var movies = Lampa.Storage.get('kinopoisk_movies', []);
        if (typeof movies === 'string') {
            try {
                movies = JSON.parse(movies);
            } catch (e) {
                movies = [];
            }
        }
        return Array.isArray(movies) ? movies : [];
    }

    function calculateProgress(total, current) {
        if(total == current) {
            Lampa.Noty.show('Обновление списка фильмов Кинопоиска завершено (' + String(total) + ')');
            if(Lampa.Storage.get('kinopoisk_launched_before', false) == false) {
                Lampa.Storage.set('kinopoisk_launched_before', true);
                Lampa.Activity.push({
                    url: '',
                    title: 'Кинопоиск',
                    component: 'kinopoisk',
                    page: 1
                });
            }
        }
    }

    function processKinopoiskData(data) {
        // use cache
        if(data && data.data.userProfile && data.data.userProfile.userData && data.data.userProfile.userData.plannedToWatch) {
            var kinopoiskMovies = getCachedMovies();
            var receivedMovies = data.data.userProfile.userData.plannedToWatch.movies.items;
            var receivedMoviesCount = receivedMovies.length;
            var moviesCount = data.data.userProfile.userData.plannedToWatch.movies.total;
            console.log('Kinopoisk', "Total planned to watch movies found: " + String(moviesCount));
            console.log('Kinopoisk', "Movies received count: " + String(receivedMoviesCount));
            if(receivedMoviesCount == 0) {
                Lampa.Noty.show('В списке "Буду смотреть" Кинопоиска нет фильмов');
            }
            const receivedMovieIds = new Set(receivedMovies.map(m => String(m.movie.id)));
            // filter out movies that are no longer present in receivedMovies
            kinopoiskMovies = kinopoiskMovies.filter(movie => receivedMovieIds.has(String(movie.kinopoisk_id)));
            Lampa.Storage.set('kinopoisk_movies', kinopoiskMovies);
            let processedItems = 1;
            receivedMovies.forEach(m => {
                const existsInLocalStorage = kinopoiskMovies.some(km => km.kinopoisk_id === String(m.movie.id));
                if (!existsInLocalStorage) {
                    // get movie data
                    var title = m.movie.title.localized || m.movie.title.original;
                    console.log('Kinopoisk', 'Getting details for movie: ' + String(m.movie.id) + ', movie title: ' + title);
                    // getting imdb id based on kinopoisk id
                    // network.silent('https://kinopoiskapiunofficial.tech/api/v2.2/films/' + String(m.movie.id), function(data) {
                    network.silent('https://api.alloha.tv/?token=04941a9a3ca3ac16e2b4327347bbc1&kp=' + String(m.movie.id), function(data) {
                        if (data && data.data) {
                            var movieIMDBid = data.data.id_imdb;
                            var movieTMDBid = data.data.id_tmdb ? data.data.id_tmdb : null;
                            var movieTitle = data.data.original_name ? data.data.original_name : data.data.name;
                            if (data.data.category == 1) {
                                var movieType = 'movie';
                            } else { // 2
                                var movieType = 'tv';
                            }
                            var movieYear = data.data.year;
                            if (movieTMDBid) {
                                console.log('Kinopoisk', 'TMDB movie id found: ' + String(movieTMDBid) + ' for kinopoisk id: ' + String(m.movie.id));
                                var url = Lampa.Utils.protocol() + 'tmdb.'+ Lampa.Manifest.cub_domain +'/3/' + movieType + '/' + String(movieTMDBid) + '?api_key=4ef0d7355d9ffb5151e987764708ce96&language=ru';
                            } else {
                                if (movieType === 'movie') {
                                    console.log('Kinopoisk', 'No IMDB movie id found for kinopoisk id: ' + String(m.movie.id) + ', will search by movie title: ' + movieTitle);
                                    var url = Lampa.Utils.protocol() + 'tmdb.'+ Lampa.Manifest.cub_domain +'/3/search/movie?query=' + encodeURIComponent(movieTitle) + '&api_key=4ef0d7355d9ffb5151e987764708ce96&year=' + String(movieYear) + '&language=ru';
                                } else { // TV_SERIES
                                    console.log('Kinopoisk', 'No IMDB movie id found for kinopoisk id: ' + String(m.movie.id) + ', will search by tv series title: ' + movieTitle);
                                    var url = Lampa.Utils.protocol() + 'tmdb.'+ Lampa.Manifest.cub_domain +'/3/search/tv?query=' + encodeURIComponent(movieTitle) + '&api_key=4ef0d7355d9ffb5151e987764708ce96&year=' + String(movieYear) + '&language=ru';
                                }
                            }
                            // getting movie details
                            network.silent(url, function(data) {
                                if(data) {
                                    if (movieTMDBid) {
                                        var movieItem = data;
                                    } else {
                                        if (data.movie_results && data.movie_results[0]) {
                                            var movieItem = data.movie_results[0];
                                        } else if(data.tv_results && data.tv_results[0]) {
                                            var movieItem = data.tv_results[0];
                                        } else if(data.results && data.results[0]) {
                                            var movieItem = data.results[0];
                                        }
                                    }
                                    if(movieItem) {

                                        // console.log('Kinopoisk', 'Movie details received: ' + JSON.stringify(movieItem));
                                        console.log('Kinopoisk', 'TMDB id found: ' + movieItem.id + ' for IMDB movie id: ' + movieIMDBid + ', kinopoisk id: ' + String(m.movie.id));

                                        var movieDateStr = movieItem.release_date || movieItem.first_air_date; // film or tv series
                                        var movieDate = new Date(movieDateStr);

                                        if (movieDate <= new Date()) {                                            
                                            movieItem.kinopoisk_id = String(m.movie.id);
                                            movieItem.source = "tmdb";
                                            kinopoiskMovies = getCachedMovies(); // re-read data if another process modified it
                                            kinopoiskMovies.unshift(movieItem);
                                            Lampa.Storage.set('kinopoisk_movies', kinopoiskMovies);
                                        } else {
                                            console.log('Kinopoisk', 'Movie or TV with kinopoisk id ' + String(m.movie.id) + ' not released yet, release date:', movieDate);    
                                            if (Lampa.Storage.get('kinopoisk_add_to_favorites', false)) { // add to favorites
                                                Lampa.Favorite.add('wath', movieItem, 100);
                                            }
                                        }
                                        
                                    } else {
                                        console.log('Kinopoisk', 'No result found for ' + movieTitle + ', ' + movieYear, data);
                                    }
                                } else {
                                    console.log('Kinopoisk', 'No movie found by IMDB id: ' + String(movieIMDBid));
                                }
                                calculateProgress(receivedMoviesCount, processedItems++);
                            }, function(data) {
                                console.log('Kinopoisk', 'apitmdb.cub.red error, data: ' + String(data));
                                calculateProgress(receivedMoviesCount, processedItems++);
                            });
                        } else {
                            console.log('Kinopoisk', 'No movie found for kinopoisk id: ' + String(m.movie.id) + ', movie: ' + title);
                            calculateProgress(receivedMoviesCount, processedItems++);
                        }
                    }, function(data) {
                        console.log('Kinopoisk', 'alloha.tv error, data: ' + String(data));
                        calculateProgress(receivedMoviesCount, processedItems++);
                    }, false, {
                        type: 'get'
                    });
                } else {
                    console.log('Kinopoisk', 'Reading data from local storage for movie: ' + String(m.movie.id))
                    calculateProgress(receivedMoviesCount, processedItems++);
                }
            })
        } else {
            Lampa.Noty.show('Невозможно обработать данные, полученные от Кинопоиска');
            console.log('Kinopoisk', 'processKinopoiskData - ');
            console.log('Kinopoisk', data);
        }
    }

    function getKinopoiskData() {
        console.log('Kinopoisk', 'Starting to get Kinopoisk data...');

        var oauth = Lampa.Storage.get('kinopoisk_access_token');
        var proxy = getProxyUrl();

        if (!proxy) {
            Lampa.Noty.show('Не задан адрес прокси: Настройки - Кинопоиск - Адрес прокси');
            console.log('Kinopoisk', 'Proxy URL is not configured, remote list is disabled');
            return;
        }

        if (!oauth) {
            console.log('Kinopoisk', 'No access token, remote list is disabled');
            return;
        }

        // Токен передается только на собственный прокси (Cloudflare Worker),
        // в теле POST, чтобы он не попадал в URL и логи.
        var payload = {
            oauth: oauth
        };

        var proxy_key = Lampa.Storage.get('kinopoisk_proxy_key', '');
        if (proxy_key) {
            payload.key = proxy_key;
        }

        network.silent(proxy, function(data) { // on success
            if (data && data.errors && data.errors.length) {
                console.log('Kinopoisk', 'Proxy returned GraphQL errors', data.errors);
                Lampa.Noty.show('Кинопоиск: ' + (data.errors[0].message || 'ошибка запроса'));
            }
            processKinopoiskData(data);
        }, function(data) { // on error
            var status = data && data.status ? data.status : 0;
            var body = data && data.responseText ? String(data.responseText).slice(0, 300) : '';

            console.log('Kinopoisk', 'Proxy error, status:', status, body);

            if (status === 403) {
                Lampa.Noty.show('Прокси: неверный ключ (Настройки - Кинопоиск)');
            } else if (!status) {
                Lampa.Noty.show('Прокси недоступен: проверьте адрес и интернет');
            } else {
                Lampa.Noty.show('Прокси ответил ошибкой ' + status);
            }
        }, payload, {
            type: 'post',
            // прокси собирает весь список одним вызовом, на больших списках это долго
            timeout: 180000
        });
    }

    function full(params, oncomplete, onerror) {
        // https://github.com/yumata/lampa-source/blob/main/src/utils/reguest.js
        // https://github.com/yumata/lampa-source/blob/main/plugins/collections/api.js
        var oauth = Lampa.Storage.get('kinopoisk_access_token');
        if(oauth) {
            getKinopoiskData();
        }
        oncomplete({
            "secuses": true,
            "page": 1,
            "results": getCachedMovies()
        });
    }

    function clear() {
        network.clear();
    }
    var Api = {
        full: full,
        clear: clear
    };

    function component(object) {
        var comp = new Lampa.InteractionCategory(object);
        comp.create = function() {
            Api.full(object, this.build.bind(this), this.empty.bind(this));
        };
        comp.nextPageReuest = function(object, resolve, reject) {
            Api.full(object, resolve.bind(comp), reject.bind(comp));
        };
        return comp;
    }
    // getting/refreshing oauth kinopoisk token
    var KINOPOISK_CLIENT_ID = 'b8b9c7a09b79452094e12f6990009934';
    var KINOPOISK_CLIENT_SECRET = '0e7001e272944c05ae5a0df16e3ea8bd';

    var auth_poll_timer = null;
    var auth_poll_stopped = true;

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
                Lampa.Storage.set('kinopoisk_access_token', data.access_token);
                Lampa.Storage.set('kinopoisk_refresh_token', data.refresh_token);
                Lampa.Storage.set('kinopoisk_token_expires', data.expires_in * 1000 + Date.now());
                Lampa.Modal.close();
                getUserEmail();
                getKinopoiskData();

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
                var link = '<a href="' + verify_url + '" target="_blank" rel="noopener">' + verify_url + '</a>';
                var show_qr = Lampa.Utils && Lampa.Utils.qrcode && (Lampa.Platform.tv() || Lampa.Platform.desktop() || Lampa.Platform.mouse());

                if (show_qr) {
                    hint.html('Отсканируйте QR-код или откройте ' + link + ' и введите код');
                    Lampa.Utils.qrcode(verify_url, qr, function() {
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


    function startPlugin() {
        var manifest = {
            type: 'video',
            version: '0.5.0',
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
                                // Lampa.Storage.set('kinopoisk_movies', []);
                                Lampa.Storage.set('kinopoisk_token_expires', 0); 
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
                Lampa.Storage.set('kinopoisk_movies', []);
                Lampa.Noty.show('Кэш Кинопоиска очищен');
            }
        });        
    }
    if(!window.kinopoisk_ready) startPlugin();
})();
