/*
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


/* ===================== Кинопоиск "Буду смотреть" (свой CORS-прокси) ===================== */

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
    function getToken(device_code, refresh) {
        var client_id = 'b8b9c7a09b79452094e12f6990009934';
        if(!refresh) {
            var token_data = {
                'grant_type': 'device_code',
                'code': device_code,
                'client_id': client_id,
                'client_secret': '0e7001e272944c05ae5a0df16e3ea8bd'
            }
        } else { // refresh token
            var token_data = {
                'grant_type': 'refresh_token',
                'refresh_token': device_code, // pass refresh token as device_code
                'client_id': client_id,
                'client_secret': '0e7001e272944c05ae5a0df16e3ea8bd'
            }
        }
        network.silent('https://oauth.yandex.ru/token', function(data) { // on token success
            if(data.access_token) {
                Lampa.Storage.set('kinopoisk_access_token', data.access_token);
                Lampa.Storage.set('kinopoisk_refresh_token', data.refresh_token);
                Lampa.Storage.set('kinopoisk_token_expires', data.expires_in * 1000 + Date.now());
                Lampa.Modal.close();
                getUserEmail();
                getKinopoiskData();
            } else {
                Lampa.Noty.show('Не удалось получить token');
                console.log('Kinopoisk', 'Error during OAuth', data.error);
            }
        }, function(data) { // on token error
            Lampa.Noty.show(data.responseJSON.error_description);
            console.log('Kinopoisk', 'Token error', data);
        }, token_data);
    }
    // getting oauth user_code
    // https://yandex.ru/dev/id/doc/ru/codes/screen-code-oauth
    function getDeviceCode() {
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
        var client_id = 'b8b9c7a09b79452094e12f6990009934';
        var device_code_data = {
            'client_id': client_id,
            'device_id': Lampa.Storage.get('kinopoisk_deviceid', '')
        }
        network.silent('https://oauth.yandex.ru/device/code', function(data) { // on device code success
            if(data.user_code && data.device_code) {
                // Lampa.Utils.copyTextToClipboard(data.user_code, ()=>{});
                // ask user to authorize
                let modal = $('<div><div class="about">Перейдите по ссылке https://ya.ru/device на любом устройстве и введите код<br><br><b>' + data.user_code + '</b><br><br></div><br><div class="broadcast__device selector" style="textalign: center">Готово</div></div>')
                Lampa.Modal.open({
                    title: 'Авторизация',
                    html: modal,
                    align: 'center',
                    onBack: () => {
                        Lampa.Modal.close()
                    },
                    onSelect: () => { // on button click
                        getToken(data.device_code, false);
                    }
                })
            } else {
                Lampa.Noty.show('Не удалось получить user_code');
                console.log('Kinopoisk', 'Failed to get user_code', data.error);
            }
        }, function(data) { // on device code error
            Lampa.Noty.show(data.responseJSON.error_description);
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
        if(!window.lampa_settings.kinopoisk) { // re-use kinopoisk_ratings element, if exists
            Lampa.SettingsApi.addComponent({
                component: 'kinopoisk',
                icon: '<svg width=\"239\" height=\"239\" viewBox=\"0 0 239 239\" fill=\"currentColor\" xmlns=\"http://www.w3.org/2000/svg\" xml:space=\"preserve\"><path fill=\"currentColor\" d=\"M215 121.415l-99.297-6.644 90.943 36.334a106.416 106.416 0 0 0 8.354-29.69z\" /><path fill=\"currentColor\" d=\"M194.608 171.609C174.933 197.942 143.441 215 107.948 215 48.33 215 0 166.871 0 107.5 0 48.13 48.33 0 107.948 0c35.559 0 67.102 17.122 86.77 43.539l-90.181 48.07L162.57 32.25h-32.169L90.892 86.862V32.25H64.77v150.5h26.123v-54.524l39.509 54.524h32.169l-56.526-57.493 88.564 46.352z\" /><path d=\"M206.646 63.895l-90.308 36.076L215 93.583a106.396 106.396 0 0 0-8.354-29.688z\" fill=\"currentColor\"/></svg>',
                name: 'Кинопоиск'
            });
        }
        Lampa.SettingsApi.addParam({
            component: 'kinopoisk',
            param: {
                type: 'title'
            },
            field: {
                name: 'Свой прокси',
            }
        })
        Lampa.SettingsApi.addParam({
            component: 'kinopoisk',
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
            component: 'kinopoisk',
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
            component: 'kinopoisk',
            param: {
                type: 'title'
            },
            field: {
                name: 'Аккаунт',
            }
        })
        var kinopoisk_email = Lampa.Storage.get('kinopoisk_email', false);
        Lampa.SettingsApi.addParam({
            component: 'kinopoisk',
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
            component: 'kinopoisk',
            param: {
                type: 'title'
            },
            field: {
                name: 'Список Буду смотреть',
            }
        })
        Lampa.SettingsApi.addParam({
            component: 'kinopoisk',
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
            component: 'kinopoisk',
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


/* ===================== Strawberry / sisi (si.skaz.tv) ===================== */

(function() {
  'use strict';

  var Defined = {
    use_api: 'lampac',
    localhost: 'http://si.skaz.tv/sisi',
    framework: ''
  };

  var luid = Lampa.Storage.get('lampac_unic_id', '');
  if (!luid) {
    luid = Lampa.Utils.uid(8).toLowerCase();
    Lampa.Storage.set('lampac_unic_id', luid);
  }

  Lampa.Lang.add({
    lampac_sisiname: {
      ru: 'Клубничка',
      en: 'Strawberry',
      uk: 'Полуничка',
      zh: '草莓'
    }
  });

  var network = new Lampa.Reguest();
  var preview_timer, preview_video;

  function sourceTitle(title) {
    return Lampa.Utils.capitalizeFirstLetter(title.split('.')[0]);
  }

  function isVIP(element) {
    return /vip.mp4/.test(element.video);
  }

    function getAndroidVersion() {
  if (Lampa.Platform.is('android')) {
    try {
      var current = AndroidJS.appVersion().split('-');
      return parseInt(current.pop());
    } catch (e) {
      return 0;
    }
  } else {
    return 0;
  }
}

var hostkey = 'http://si.skaz.tv'.replace('http://', '').replace('https://', '');

if (!window.rch_nws || !window.rch_nws[hostkey]) {
  if (!window.rch_nws) window.rch_nws = {};

  window.rch_nws[hostkey] = {
    type: Lampa.Platform.is('android') ? 'apk' : Lampa.Platform.is('tizen') ? 'cors' : undefined,
    startTypeInvoke: false,
    rchRegistry: false,
    apkVersion: getAndroidVersion()
  };
}

window.rch_nws[hostkey].typeInvoke = function rchtypeInvoke(host, call) {
  if (!window.rch_nws[hostkey].startTypeInvoke) {
    window.rch_nws[hostkey].startTypeInvoke = true;

    var check = function check(good) {
      window.rch_nws[hostkey].type = Lampa.Platform.is('android') ? 'apk' : good ? 'cors' : 'web';
      call();
    };

    if (Lampa.Platform.is('android') || Lampa.Platform.is('tizen')) check(true);
    else {
      var net = new Lampa.Reguest();
      net.silent('http://si.skaz.tv'.indexOf(location.host) >= 0 ? 'https://github.com/' : host + '/cors/check', function() {
        check(true);
      }, function() {
        check(false);
      }, false, {
        dataType: 'text'
      });
    }
  } else call();
};

window.rch_nws[hostkey].Registry = function RchRegistry(client, startConnection) {
  window.rch_nws[hostkey].typeInvoke('http://si.skaz.tv', function() {

    client.invoke("RchRegistry", {
      version: 154,
      host: location.host,
      rchtype: Lampa.Platform.is('android') ? 'apk' : Lampa.Platform.is('tizen') ? 'cors' : (window.rch_nws[hostkey].type || 'web'),
      apkVersion: window.rch_nws[hostkey].apkVersion,
      player: Lampa.Storage.field('player'),
	  account_email: Lampa.Storage.get('account_email', ''),
	  unic_id: Lampa.Storage.get('lampac_unic_id', ''),
	  profile_id: Lampa.Storage.get('lampac_profile_id', ''),
	  token: ''
    });

    if (client._shouldReconnect && window.rch_nws[hostkey].rchRegistry) {
      if (startConnection) startConnection();
      return;
    }

    window.rch_nws[hostkey].rchRegistry = true;

    client.on('RchRegistry', function(clientIp) {
      if (startConnection) startConnection();
    });

    client.on("RchClient", function(rchId, url, data, headers, returnHeaders) {
      var network = new Lampa.Reguest();
	  
	  function sendResult(uri, html) {
	    $.ajax({
	      url: 'http://si.skaz.tv/rch/' + uri + '?id=' + rchId,
	      type: 'POST',
	      data: html,
	      async: true,
	      cache: false,
	      contentType: false,
	      processData: false,
	      success: function(j) {},
	      error: function() {
	        client.invoke("RchResult", rchId, '');
	      }
	    });
	  }

      function result(html) {
        if (Lampa.Arrays.isObject(html) || Lampa.Arrays.isArray(html)) {
          html = JSON.stringify(html);
        }

        if (typeof CompressionStream !== 'undefined' && html && html.length > 15000) {
          var compressionStream = new CompressionStream('gzip');
          var encoder = new TextEncoder();
          var readable = new ReadableStream({
            start: function(controller) {
              controller.enqueue(encoder.encode(html));
              controller.close();
            }
          });
          var compressedStream = readable.pipeThrough(compressionStream);
          new Response(compressedStream).arrayBuffer()
            .then(function(compressedBuffer) {
              var compressedArray = new Uint8Array(compressedBuffer);
              if (compressedArray.length > html.length) {
                sendResult('result', html);
              } else {
                // Оборачиваем в Blob чтоб XHR отдал тело с Content-Length,
                // а не Transfer-Encoding: chunked. GZipStream на сервере
                // на chunked-теле в Electron/Chromium ловил EndOfStream → 400.
                sendResult('gzresult', new Blob([compressedArray], { type: 'application/octet-stream' }));
              }
            })
            .catch(function() {
              sendResult('result', html);
            });

        } else {
          sendResult('result', html);
        }
      }

      if (url == 'eval') {
        console.log('RCH', url, data);
        result(eval(data));
      } else if (url == 'evalrun') {
        console.log('RCH', url, data);
        eval(data);
      } else if (url == 'ping') {
        result('pong');
      } else {
        console.log('RCH', url);
        network["native"](url, result, function(e) {
          console.log('RCH', 'result empty, ' + e.status);
          result('');
        }, data, {
          dataType: 'text',
          timeout: 1000 * 8,
          headers: headers,
          returnHeaders: returnHeaders
        });
      }
    });

    client.on('Connected', function(connectionId) {
      console.log('RCH', 'ConnectionId: ' + connectionId);
      window.rch_nws[hostkey].connectionId = connectionId;
    });
    client.on('Closed', function() {
      console.log('RCH', 'Connection closed');
    });
    client.on('Error', function(err) {
      console.log('RCH', 'error:', err);
    });
  });
};
  window.rch_nws[hostkey].typeInvoke('http://si.skaz.tv', function() {});

  function rchInvoke(json, call) {
    if (window.nwsClient && window.nwsClient[hostkey] && window.nwsClient[hostkey]._shouldReconnect){
      call();
      return;
    }
    if (!window.nwsClient) window.nwsClient = {};
    if (window.nwsClient[hostkey] && window.nwsClient[hostkey].socket)
      window.nwsClient[hostkey].socket.close();
    window.nwsClient[hostkey] = new NativeWsClient(json.nws, {
      autoReconnect: false
    });
    window.nwsClient[hostkey].on('Connected', function(connectionId) {
      window.rch_nws[hostkey].Registry(window.nwsClient[hostkey], function() {
        call();
      });
    });
    window.nwsClient[hostkey].connect();
  }

  function rchRun(json, call) {
    if (typeof NativeWsClient == 'undefined') {
      Lampa.Utils.putScript(["http://si.skaz.tv/js/nws-client-es5.js?v03022026"], function() {}, false, function() {
        rchInvoke(json, call);
      }, true);
    } else {
      rchInvoke(json, call);
    }
  }

  function modal(text) {
    var id = Lampa.Storage.get('sisi_unic_id', '').toLowerCase();
    var controller = Lampa.Controller.enabled().name;
    var content = "<div class=\"about\">\n<div>"+(text||'Добавьте идентификатор устройства в init.conf')+"</div>\n<div class=\"about__contacts\">\n<div>\n<small>unic_id</small><br>\n"+luid+"\n</div>\n\n<div>\n<small>box_mac</small><br>\n"+id+"\n</div>\n</div>\n</div>";
	// "<div class=\"about\">\n<div>\u042D\u0442\u043E \u0432\u0438\u0434\u0435\u043E \u0434\u043E\u0441\u0442\u0443\u043F\u043D\u043E \u0441 VIP \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u043E\u0439. \u0414\u043B\u044F \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F VIP \u043F\u043E\u0434\u043F\u0438\u0441\u043A\u0438, \u043F\u0435\u0440\u0435\u0439\u0434\u0438\u0442\u0435 \u043D\u0430 \u0441\u0430\u0439\u0442 \u043A\u043E\u0442\u043E\u0440\u044B\u0439 \u0443\u043A\u0430\u0437\u0430\u043D \u043D\u0438\u0436\u0435 \u0438 \u0443\u043A\u0430\u0436\u0438\u0442\u0435 \u0432\u0430\u0448 ID</div>\n<div class=\"about__contacts\">\n<div>\n                <small>\u0421\u0430\u0439\u0442</small><br>\n{vip_site}\n</div>\n\n<div>\n<small>\u0412\u0430\u0448 ID</small><br>\n".concat(id, "\n</div>\n</div>\n</div>");
    Lampa.Modal.open({
      title: 'Доступ ограничен',
      html: $(content),
      size: 'medium', // small|medium
      onBack: function onBack() {
        Lampa.Modal.close();
        Lampa.Controller.toggle(controller);
      }
    });
  }

  function qualityDefault(qualitys) {
    var preferably = Lampa.Storage.get('video_quality_default', '1080') + 'p';
    var url;

    if (qualitys) {
      for (var q in qualitys) {
        if (q.indexOf(preferably) == 0) url = qualitys[q];
      }

      if (!url) url = qualitys[Lampa.Arrays.getKeys(qualitys)[0]];
    }

    return url;
  }

  function play(element) {
    var controller_enabled = Lampa.Controller.enabled().name;

    if (isVIP(element)) {
      return modal();
    }
	
    if (true && !element.history_uid && element.bookmark && Lampa.Storage.field('sisi_history')) {
      network.silent(Api.account(Defined.localhost + '/history/add'), function(e) {}, function() {}, JSON.stringify(element), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }

    if (element.json) {
      Lampa.Loading.start(function() {
        network.clear();
        Lampa.Loading.stop();
      });
      Api.account(element.video + '&json=true');
      Api.qualitys(element.video, function(data) {
        if (data.error) {
          Lampa.Noty.show(Lampa.Lang.translate('torrent_parser_nofiles'));
          Lampa.Loading.stop();
          return;
        }

        var qualitys = data.qualitys || data;
        var recomends = data.recomends || [];
        Lampa.Loading.stop();

        for (var i in qualitys) {
          qualitys[i] = Api.account(qualitys[i], true);
        }

        var video = {
          title: element.name,
          url: Api.account(qualityDefault(qualitys), true),
          url_reserve: data.qualitys_proxy ? Api.account(qualityDefault(data.qualitys_proxy), true) : false,
          quality: qualitys,
		  headers: data.headers_stream
        };
        Lampa.Player.play(video);

        if (recomends.length) {
          recomends.forEach(function(a) {
            a.title = Lampa.Utils.shortText(a.name, 50);
            a.icon = '<img class="size-youtube" src="' + a.picture + '" />';
            a.template = 'selectbox_icon';

            a.url = function(call) {
              if (a.json) {
                Api.qualitys(a.video, function(data) {
                  a.quality = data.qualitys;
                  a.url = Api.account(qualityDefault(data.qualitys), true);
                  if (data.qualitys_proxy) a.url_reserve = Api.account(qualityDefault(data.qualitys_proxy), true);
                  call();
                });
              } else {
                a.url = a.video;
                call();
              }
            };
          });
          Lampa.Player.playlist(recomends);
        } else {
          Lampa.Player.playlist([video]);
        }

        Lampa.Player.callback(function() {
          Lampa.Controller.toggle(controller_enabled);
        });
      }, function() {
        Lampa.Noty.show(Lampa.Lang.translate('torrent_parser_nofiles'));
        Lampa.Loading.stop();
      });
    } else {
      if (element.qualitys) {
        for (var i in element.qualitys) {
          element.qualitys[i] = Api.account(element.qualitys[i], true);
        }
      }

      var video = {
        title: element.name,
        url: Api.account(qualityDefault(element.qualitys) || element.video, true),
        url_reserve: Api.account(qualityDefault(element.qualitys_proxy) || element.video_reserve || '', true),
        quality: element.qualitys
      };
      Lampa.Player.play(video);
      Lampa.Player.playlist([video]);
      Lampa.Player.callback(function() {
        Lampa.Controller.toggle(controller_enabled);
      });
    }
  }

  function fixCards(json) {
    json.forEach(function(m) {
      m.background_image = m.picture;
      m.poster = m.picture;
      m.img = m.picture;
      m.name = Lampa.Utils.capitalizeFirstLetter(m.name).replace(/\&(.*?);/g, '');
    });
  }

  function hidePreview() {
    clearTimeout(preview_timer);

    if (preview_video) {
      var vid = preview_video.find('video')
			  
	  var pausePromise;

		try{
			pausePromise = vid.pause()
		}
		catch(e){ }

		if (pausePromise !== undefined) {
			pausePromise.then(function(){
				
			})
			.catch(function(e){
				
			});
		}
      preview_video.addClass('hide');
      preview_video = false;
    }
  }

  function preview(target, element) {
    hidePreview();
    preview_timer = setTimeout(function() {
      if (!element.preview || !Lampa.Storage.field('sisi_preview')) return;
      var video = target.find('video');
      var container = target.find('.sisi-video-preview');

      if (!video) {
        video = document.createElement('video');
        container = document.createElement('div');
        container.addClass('sisi-video-preview');
        container.style.position = 'absolute';
        container.style.width = '100%';
        container.style.height = '100%';
        container.style.left = '0';
        container.style.top = '0';
        container.style.overflow = 'hidden';
        container.style.borderRadius = '1em';
        video.style.position = 'absolute';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.left = '0';
        video.style.top = '0';
        video.style.objectFit = 'cover';
        container.append(video);
        target.find('.card__view').append(container);
        video.src = element.preview; // 'https://thumb-v4.xhcdn.com/a/og0z25CtaTIZXgzkV7qJ8Q/023/463/094/526x298.44.t.webm'
		video.addEventListener('ended', function() {
			container.addClass('hide')
		})
        video.load();
      }

      preview_video = container;
	  
	  var playPromise;

		try{
			playPromise = video.play()
		}
		catch(e){ }


		if (playPromise !== undefined) {
			playPromise.then(function(){
				
			})
			.catch(function(e){
				
			});
		}

      container.removeClass('hide');
    }, 1500);
  }

  function fixList(list) {
    list.forEach(function(a) {
      if (!a.quality && a.time) a.quality = a.time;
    });
    return list;
  }

  function menu$2(target, card_data) {
    if (!card_data.bookmark) return;
    var cm = [{
      title: !card_data.bookmark.uid ? 'В закладки' : 'Удалить из закладок'
    }];

    if (card_data.history_uid) {
      cm.push({
        title: 'Удалить из истории',
        history: true
      });
    }

    if (card_data.related) {
      cm.push({
        title: 'Похожие',
        related: true
      });
    }

    if (card_data.model) {
      cm.push({
        title: card_data.model.name,
        model: true
      });
    }
	
    if (Lampa.Platform.is('android') && Lampa.Storage.field('player') !== 'inner') {
      cm.push({
        title: 'Плеер Lampa',
        lampaplayer: true
      });
    }

    Lampa.Select.show({
      title: 'Меню',
      items: cm,
      onSelect: function onSelect(m) {
        if (m.model) {
          Lampa.Activity.push({
            url: Defined.localhost.replace('/sisi', '') + '/' + card_data.model.uri,
            title: 'Модель - ' + card_data.model.name,
            component: 'sisi_view_' + Defined.use_api,
            page: 1
          });
        } else if (m.related) {
          Lampa.Activity.push({
            url: card_data.video + '&related=true',
            title: 'Похожие - ' + card_data.title,
            component: 'sisi_view_' + Defined.use_api,
            page: 1
          });
        } else if (m.history) {
          Api.history(card_data, function(status) {
            Lampa.Noty.show('Успешно');
          });
          Lampa.Controller.toggle('content');
        } else if (m.lampaplayer) {
          Lampa.Controller.toggle('content');
          play(card_data);
        } else {
          Api.bookmark(card_data, !card_data.bookmark.uid, function(status) {
            Lampa.Noty.show('Успешно');
          });
          Lampa.Controller.toggle('content');
        }
      },
      onBack: function onBack() {
        Lampa.Controller.toggle('content');
      }
    });
  }

  var Utils = {
    sourceTitle: sourceTitle,
    play: play,
    fixCards: fixCards,
    isVIP: isVIP,
    preview: preview,
    hidePreview: hidePreview,
    fixList: fixList,
    menu: menu$2
  };

  var menu$1;

  function ApiPWA() {
    var _this = this;

    var network = new Lampa.Reguest();

    this.menu = function(success, error) {
      if (menu$1) return success(menu$1);
      DotNet.invokeMethodAsync("JinEnergy", 'sisi', '').then(function(data) {
        if (data) {
          menu$1 = data;
          success(menu$1);
        } else {
          error(data.msg);
        }
      })["catch"](function() {
        console.log('Sisi', 'no load menu');
        error();
      });
    };

    this.view = function(params, success, error) {
      var u = this.account(Lampa.Utils.addUrlComponent(params.url, 'pg=' + (params.page || 1)));
      DotNet.invokeMethodAsync("JinEnergy", u.path, u.query).then(function(json) {
        if (json.list) {
          json.results = Utils.fixList(json.list);
          json.collection = true;
          json.total_pages = json.total_pages || 30;
          Utils.fixCards(json.results);
          delete json.list;
          success(json);
        } else {
          error();
        }
      })["catch"](function() {
        console.log('Sisi', 'no load', u.path + '+' + u.query);
        error();
      });
    };

    this.bookmark = function(element, add, call) {
      call(true);
    };

    this.account = function(u, join) {
      if (join) {
        if (Defined.use_api == 'lampac' && u.indexOf(Defined.localhost.replace('/sisi', '')) == -1) return u;
      }

      var unic_id = Lampa.Storage.get('sisi_unic_id', '');
      var uid = Lampa.Storage.get('lampac_unic_id', '');
      var email = Lampa.Storage.get('account', {}).email;

      if (u.indexOf('box_mac=') == -1) u = Lampa.Utils.addUrlComponent(u, 'box_mac=' + unic_id);

      if (email) {
        if (u.indexOf('account_email=') == -1) u = Lampa.Utils.addUrlComponent(u, 'account_email=' + encodeURIComponent(email));
      }

      if (uid) {
        if (u.indexOf('uid=') == -1) u = Lampa.Utils.addUrlComponent(u, 'uid=' + encodeURIComponent(uid));
      }

      if (u.indexOf('token=') == -1) {
        var token = '';
        if (token != '') u = Lampa.Utils.addUrlComponent(u, 'token=');
      }

      if (join) return u;
      return {
        path: u.split('?')[0],
        query: u.split('?')[1]
      };
    };

    this.playlist = function(add_url_query, oncomplite, error) {
      var load = function load() {
        var status = new Lampa.Status(menu$1.length);

        status.onComplite = function(data) {
          var items = [];
          menu$1.forEach(function(m) {
            if (data[m.playlist_url] && data[m.playlist_url].results.length) items.push(data[m.playlist_url]);
          });
          if (items.length) oncomplite(items);
          else error();
        };

        menu$1.forEach(function(m, i) {
          var separator = m.playlist_url.indexOf('?') !== -1 ? '&' : '?';
          var url_query = add_url_query.indexOf('?') !== -1 || add_url_query.indexOf('&') !== -1 ? add_url_query.substring(1) : add_url_query;
          var u = _this.account(m.playlist_url + separator + url_query);

          var b = false;
          var w = setTimeout(function() {
            b = true;
            status.error();
          }, 1000 * 8);
          DotNet.invokeMethodAsync("JinEnergy", u.path, u.query).then(function(json) {
            clearTimeout(w);
            if (b) return;

            if (json.list) {
              json.title = Utils.sourceTitle(m.title);
              json.results = Utils.fixList(json.list);
              json.url = m.playlist_url;
              json.collection = true;
              json.line_type = 'none';
              json.card_events = {
                onMenu: Utils.menu,
                onEnter: function onEnter(card, element) {
                  Utils.hidePreview();
                  Utils.play(element);
                }
              };
              Utils.fixCards(json.results);
              delete json.list;
              status.append(m.playlist_url, json);
            } else {
              status.error();
            }
          })["catch"](function() {
            console.log('Sisi', 'no load', u.path + '+' + u.query);
            clearTimeout(w);
            status.error();
          });
        });
      };

      if (menu$1) load();
      else {
        _this.menu(load, error);
      }
    };

    this.main = function(params, oncomplite, error) {
      this.playlist('', oncomplite, error);
    };

    this.search = function(params, oncomplite, error) {
      this.playlist('?search=' + encodeURIComponent(params.query), oncomplite, error);
    };

    this.qualitys = function(video_url, oncomplite, error) {
      var u = this.account(video_url + '&json=true');
      DotNet.invokeMethodAsync("JinEnergy", u.path, u.query).then(oncomplite)["catch"](function(e) {
        console.log('Sisi', 'no load', u.path + '+' + u.query);
        error();
      });
    };

    this.clear = function() {
      network.clear();
    };
  }

  var ApiPWA$1 = new ApiPWA();

  var menu;

  function ApiHttp() {
    var _this = this;

    var network = new Lampa.Reguest();

    this.menu = function(success, error) {
      if (menu) return success(menu);
      network.silent(this.account(Defined.localhost)+'&rchtype='+((window.rch_nws && window.rch_nws[hostkey] ? window.rch_nws[hostkey].type : window.rch && window.rch[hostkey] ? window.rch[hostkey].type : '') || ''), function(data) {
        if (data.channels) {
          menu = data.channels;
          success(menu);
        } else {
          error(data.msg);
        }
      }, error);
    };

    this.view = function(params, success, error, waiting_rch) {
      var u = Lampa.Utils.addUrlComponent(params.url, 'pg=' + (params.page || 1));
      network.silent(this.account(u), function(json) {
        if (json.rch) {
          if (waiting_rch){
            error();
            return;
          }
          rchRun(json, function() {
            _this.view(params, success, error, true);
          });
        } else if (json.accsdb) {
          error();
          Lampa.Noty.show(json.denymsg || json.msg, {style: 'error', time: 8000});
        } else if (json.list) {
          json.results = Utils.fixList(json.list);
          json.collection = true;
          json.total_pages = json.total_pages || 30;
          Utils.fixCards(json.results);
          delete json.list;
          success(json);
        } else {
          error();
        }
      }, error);
    };

    this.bookmark = function(element, add, call) {
      var u = Defined.localhost + '/bookmark/' + (add ? 'add' : 'remove?id=' + element.bookmark.uid);
      network.silent(this.account(u), function(e) {
        call(true);
      }, function() {
        call(false);
      }, JSON.stringify(element), {
        headers: {
          'Content-Type': 'application/json'
        }
      });
    };

    this.history = function(element, call) {
      var u = Defined.localhost + '/history/remove?id=' + element.history_uid;
      network.silent(this.account(u), function(e) {
        call(true);
      }, function() {
        call(false);
      });
    };

    this.account = function(u) {
      u = u.replace(/^[\?&]+/, '');
      u = u.replace(/[\?&]+$/, '');
	  
      if (u.indexOf(Defined.localhost.replace('/sisi', '')) === -1 && window.location.hostname !== 'localhost') return u;

      var unic_id = Lampa.Storage.get('sisi_unic_id', '');
      var uid = Lampa.Storage.get('lampac_unic_id', '');
      var email = Lampa.Storage.get('account', {}).email;

      if (u.indexOf('box_mac=') === -1) 
		  u = Lampa.Utils.addUrlComponent(u, 'box_mac=' + unic_id);

      if (email) {
        if (u.indexOf('account_email=') === -1) 
			u = Lampa.Utils.addUrlComponent(u, 'account_email=' + encodeURIComponent(email));
      }

      if (uid) {
        if (u.indexOf('uid=') === -1) 
			u = Lampa.Utils.addUrlComponent(u, 'uid=' + encodeURIComponent(uid));
      }

      if (u.indexOf('token=') === -1) {
        var token = '';
        if (token != '') u = Lampa.Utils.addUrlComponent(u, 'token=');
      }
	  
	  var profile_id = Lampa.Storage.get('lampac_profile_id', '');
	  if (profile_id != '') u = Lampa.Utils.addUrlComponent(u, 'profile_id='+profile_id);
	  
      if (u.indexOf('nws_id=') === -1 && window.rch_nws && window.rch_nws[hostkey]) {
        var nws_id = window.rch_nws[hostkey].connectionId || Lampa.Storage.get('lampac_nws_id', '');
        if (nws_id) u = Lampa.Utils.addUrlComponent(u, 'nws_id=' + encodeURIComponent(nws_id));
      }
	  
      return u;
    };

    this.playlist = function(add_url_query, oncomplite, error) {
      var load = function load() {
        var status = new Lampa.Status(menu.length);

        status.onComplite = function(data) {
          var items = [];
          menu.forEach(function(m) {
            if (data[m.playlist_url] && data[m.playlist_url].results.length) items.push(data[m.playlist_url]);
          });
          if (items.length) oncomplite(items);
          else error();
        };

        menu.forEach(function(m) {
          function loadThis() {
            var separator = m.playlist_url.indexOf('?') !== -1 ? '&' : '?';
            network.silent(_this.account(m.playlist_url.replace(/[\?&]+$/, '') + separator + add_url_query.replace(/^[\?&]+/, '')), function(json) {
              if (json.rch) {
                rchRun(json, function() {
                  loadThis();
                });
              } else if (json.accsdb) {
                status.error();
                Lampa.Noty.show(json.denymsg || json.msg, {style: 'error', time: 8000});
              } else if (json.list) {
                json.title = Utils.sourceTitle(m.title);
                json.results = Utils.fixList(json.list);
                json.url = m.playlist_url;
                json.collection = true;
                json.line_type = 'none';
                json.card_events = {
                  onMenu: Utils.menu,
                  onEnter: function onEnter(card, element) {
                    Utils.hidePreview();
                    Utils.play(element);
                  }
                };
                Utils.fixCards(json.results);
                delete json.list;
                status.append(m.playlist_url, json);
              } else {
                status.error();
              }
            }, status.error.bind(status));
          }

          loadThis();
        });
      };

      if (menu) load();
      else {
        _this.menu(load, error);
      }
    };

    this.main = function(params, oncomplite, error) {
      this.playlist('', oncomplite, error);
    };

    this.search = function(params, oncomplite, error) {
      this.playlist('?search=' + encodeURIComponent(params.query), oncomplite, error);
    };

    this.qualitys = function(video_url, oncomplite, error, waiting_rch) {
      network.silent(this.account(video_url + '&json=true'), function(json) {
        if (json.rch) {
          if (waiting_rch) {
            error();
            return;
          }
          rchRun(json, function() {
            _this.qualitys(video_url, oncomplite, error, true);
          });
        } else if (json.accsdb) {
          error();
          Lampa.Noty.show(json.denymsg || json.msg, {style: 'error', time: 8000});
        } else oncomplite(json);
      }, error);
    };

    this.clear = function() {
      network.clear();
    };
  }

  var ApiHttp$1 = new ApiHttp();

  var Api = ApiHttp$1; //true ? ApiPWA$1 : ApiHttp$1;

  function Sisi(object) {
    var comp = new Lampa.InteractionMain(object);

    comp.create = function() {
      this.activity.loader(true);
      Api.main(object, this.build.bind(this), this.empty.bind(this));
      return this.render();
    };

    comp.empty = function(er) {
      var _this = this;

      var empty = new Lampa.Empty({
        descr: typeof er == 'string' ? er : Lampa.Lang.translate('empty_text_two')
      });
      Lampa.Activity.all().forEach(function(active) {
        if (_this.activity == active.activity) active.activity.render().find('.activity__body > div')[0].appendChild(empty.render(true));
      });
      this.start = empty.start.bind(empty);
      this.activity.loader(false);
      this.activity.toggle();
    };

    comp.onMore = function(data) {
      Lampa.Activity.push({
        url: data.url,
        title: data.title,
        component: 'sisi_view_' + Defined.use_api,
        page: 2
      });
    };

    comp.onAppend = function(line, element) {
      line.onAppend = function(card) {
        var origFocus = card.onFocus;

        card.onFocus = function(target, card_data) {
          origFocus(target, card_data);
          Utils.preview(target, card_data);
        };
      };
    };

    return comp;
  }

  function View(object) {
    var comp = new Lampa.InteractionCategory(object);
    var menu;

    comp.create = function() {
      var _this = this;

      this.activity.loader(true);
      Api.view(object, function(data) {
        menu = data.menu;

        if (menu) {
          menu.forEach(function(m) {
            var spl = m.title.split(':');
            m.title = spl[0].trim();
            if (spl[1]) m.subtitle = Lampa.Utils.capitalizeFirstLetter(spl[1].trim().replace(/all/i, 'Любой'));

            if (m.submenu) {
              m.submenu.forEach(function(s) {
                s.title = Lampa.Utils.capitalizeFirstLetter(s.title.trim().replace(/all/i, 'Любой'));
              });
            }
          });
        }

        _this.build(data);
		
	  comp.render().find('.category-full').addClass('mapping--grid cols--3');

        if (!data.results.length && object.url.indexOf('/bookmarks')) {
          Lampa.Noty.show('Удерживайте ОК на видео для добавления в закладки.', {
            time: 10000
          });
        }
      }, this.empty.bind(this));
    };

    comp.nextPageReuest = function(object, resolve, reject) {
      Api.view(object, resolve.bind(this), reject.bind(this));
    };

    comp.cardRender = function(object, element, card) {
      card.onMenu = function(target, card_data) {
        return Utils.menu(target, card_data);
      };

      card.onEnter = function() {
        Utils.hidePreview();
        Utils.play(element);
      };

      var origFocus = card.onFocus;

      card.onFocus = function(target, card_data) {
        origFocus(target, card_data);
        Utils.preview(target, element);
      };
    };

    comp.filter = function() {
      if (menu) {
        var items = menu.filter(function(m) {
          return !m.search_on;
        });
        var search = menu.find(function(m) {
          return m.search_on;
        });
        if (!search) search = object.search_start;
        if (!items.length && !search) return;

        if (search) {
          Lampa.Arrays.insert(items, 0, {
				title: 'Найти',
				onSelect: function onSelect() {
				  $('body').addClass('ambience--enable')
				  Lampa.Input.edit({
					title: 'Поиск',
					value: '',
					free: true,
					nosave: true
				  }, function (value) {
					$('body').removeClass('ambience--enable')
					Lampa.Controller.toggle('content');

					if (value) {
					  var separator = search.playlist_url.indexOf('?') !== -1 ? '&' : '?';
					  Lampa.Activity.push({
						url: search.playlist_url + separator + 'search=' + encodeURIComponent(value),
						title: 'Поиск - ' + value,
						component: 'sisi_view_' + Defined.use_api,
						search_start: search,
						page: 1
					  });
					}
				  });
				}
			  });
        }

        Lampa.Select.show({
          title: 'Фильтр',
          items: items,
          onBack: function onBack() {
            Lampa.Controller.toggle('content');
          },
          onSelect: function onSelect(a) {
            menu.forEach(function(m) {
              m.selected = m == a ? true : false;
            });

            if (a.submenu) {
              Lampa.Select.show({
                title: a.title,
                items: a.submenu,
                onBack: function onBack() {
                  comp.filter();
                },
                onSelect: function onSelect(b) {
                  Lampa.Activity.push({
                    title: object.title,
                    url: b.playlist_url,
                    component: 'sisi_view_' + Defined.use_api,
                    page: 1
                  });
                }
              });
            } else {
              comp.filter();
            }
          }
        });
      }
    };

    comp.onRight = comp.filter.bind(comp);
    return comp;
  }
  
    var Search = {
      title: 'Клубничка',
      search: function search(params, oncomplite) {
        network.silent('http://si.skaz.tv/rch/check/connected', function(json) {
          if (json.rch) {
            rchRun(json, function() {
              Api.search(params, oncomplite);
            });
          } else {
            Api.search(params, oncomplite);
          }
        }, function() {
          oncomplite([]);
        });
      },
      onCancel: function onCancel() {
        Api.clear();
      },
      params: {
        lazy: true,
        align_left: true,
        card_events: {
          onMenu: function onMenu() {}
        }
      },
      onMore: function onMore(params, close) {
        close();
        var url = Lampa.Utils.addUrlComponent(params.data.url, 'search=' + encodeURIComponent(params.query));
        Lampa.Activity.push({
          url: url,
          title: 'Поиск - ' + params.query,
          component: 'sisi_view_' + Defined.use_api,
          page: 2
        });
      },
      onSelect: function onSelect(params, close) {
        Utils.play(params.element);
      },
      onAppend: function onAppend(card) {
        card.render().addClass('card--collection');
      }
    };
	

  function startPlugin() {
    window['plugin_sisi_' + Defined.use_api + '_ready'] = true;
    var unic_id = Lampa.Storage.get('sisi_unic_id', '');

    if (!unic_id) {
      unic_id = Lampa.Utils.uid(8).toLowerCase();
      Lampa.Storage.set('sisi_unic_id', unic_id);
    }

    Lampa.Component.add('sisi_' + Defined.use_api, Sisi);
    Lampa.Component.add('sisi_view_' + Defined.use_api, View); 
	//addSourceSearch();
	Lampa.Search.addSource(Search);

    function addFilter() {
      var activi;
      var timer;
      var button = $("<div class=\"head__action head__settings selector\">\n            <svg height=\"36\" viewBox=\"0 0 38 36\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n                <rect x=\"1.5\" y=\"1.5\" width=\"35\" height=\"33\" rx=\"1.5\" stroke=\"currentColor\" stroke-width=\"3\"></rect>\n                <rect x=\"7\" y=\"8\" width=\"24\" height=\"3\" rx=\"1.5\" fill=\"currentColor\"></rect>\n                <rect x=\"7\" y=\"16\" width=\"24\" height=\"3\" rx=\"1.5\" fill=\"currentColor\"></rect>\n                <rect x=\"7\" y=\"25\" width=\"24\" height=\"3\" rx=\"1.5\" fill=\"currentColor\"></rect>\n                <circle cx=\"13.5\" cy=\"17.5\" r=\"3.5\" fill=\"currentColor\"></circle>\n                <circle cx=\"23.5\" cy=\"26.5\" r=\"3.5\" fill=\"currentColor\"></circle>\n                <circle cx=\"21.5\" cy=\"9.5\" r=\"3.5\" fill=\"currentColor\"></circle>\n            </svg>\n        </div>");
      button.hide().on('hover:enter', function() {
        if (activi) {
          if(Lampa.Manifest.app_digital >= 300) activi.activity.component.filter();
          else activi.activity.component().filter();
        }
      });
      $('.head .open--search').after(button);
      Lampa.Listener.follow('activity', function(e) {
        if (e.type == 'start') activi = e.object;
        clearTimeout(timer);
        timer = setTimeout(function() {
          if (activi) {
            if (activi.component !== 'sisi_view_' + Defined.use_api) {
              button.hide();
              activi = false;
            }
          }
        }, 1000);

        if (e.type == 'start' && e.component == 'sisi_view_' + Defined.use_api) {
          button.show();
          activi = e.object;
        }
      });
    }

    function addSettings() {
      if (window.sisi_add_param_ready) return;
      window.sisi_add_param_ready = true;
      Lampa.SettingsApi.addComponent({
        component: 'sisi',
        name: Lampa.Lang.translate('lampac_sisiname'),
        icon: "<svg width=\"200\" height=\"243\" viewBox=\"0 0 200 243\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M187.714 130.727C206.862 90.1515 158.991 64.2019 100.983 64.2019C42.9759 64.2019 -4.33044 91.5669 10.875 130.727C26.0805 169.888 63.2501 235.469 100.983 234.997C138.716 234.526 168.566 171.303 187.714 130.727Z\" stroke=\"currentColor\" stroke-width=\"15\"/><path d=\"M102.11 62.3146C109.995 39.6677 127.46 28.816 169.692 24.0979C172.514 56.1811 135.338 64.2018 102.11 62.3146Z\" stroke=\"currentColor\" stroke-width=\"15\"/><path d=\"M90.8467 62.7863C90.2285 34.5178 66.0667 25.0419 31.7127 33.063C28.8904 65.1461 68.8826 62.7863 90.8467 62.7863Z\" stroke=\"currentColor\" stroke-width=\"15\"/><path d=\"M100.421 58.5402C115.627 39.6677 127.447 13.7181 85.2149 9C82.3926 41.0832 83.5258 35.4214 100.421 58.5402Z\" stroke=\"currentColor\" stroke-width=\"15\"/><rect x=\"39.0341\" y=\"98.644\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/><rect x=\"90.8467\" y=\"92.0388\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/><rect x=\"140.407\" y=\"98.644\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/><rect x=\"116.753\" y=\"139.22\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/><rect x=\"64.9404\" y=\"139.22\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/><rect x=\"93.0994\" y=\"176.021\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/></svg>"
      });
      Lampa.SettingsApi.addParam({
        component: 'sisi',
        param: {
          name: 'sisi_preview',
          type: 'trigger',
          values: '',
          "default": true
        },
        field: {
          name: 'Предпросмотр',
          description: 'Показывать предпросмотр при наведение на карточку'
        },
        onRender: function onRender(item) {}
      });
	  Lampa.SettingsApi.addParam({
        component: 'sisi',
        param: {
          name: 'sisi_history',
          type: 'trigger',
          values: '',
          "default": true
        },
        field: {
          name: 'История',
          description: 'Сохранять историю просмотров'
        },
        onRender: function onRender(item) {}
      });
    }

    function add() {
      var button = $("<li class=\"menu__item selector\" data-action=\"sisi\">\n            <div class=\"menu__ico\">\n                <svg width=\"200\" height=\"243\" viewBox=\"0 0 200 243\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M187.714 130.727C206.862 90.1515 158.991 64.2019 100.983 64.2019C42.9759 64.2019 -4.33044 91.5669 10.875 130.727C26.0805 169.888 63.2501 235.469 100.983 234.997C138.716 234.526 168.566 171.303 187.714 130.727Z\" stroke=\"currentColor\" stroke-width=\"15\"/><path d=\"M102.11 62.3146C109.995 39.6677 127.46 28.816 169.692 24.0979C172.514 56.1811 135.338 64.2018 102.11 62.3146Z\" stroke=\"currentColor\" stroke-width=\"15\"/><path d=\"M90.8467 62.7863C90.2285 34.5178 66.0667 25.0419 31.7127 33.063C28.8904 65.1461 68.8826 62.7863 90.8467 62.7863Z\" stroke=\"currentColor\" stroke-width=\"15\"/><path d=\"M100.421 58.5402C115.627 39.6677 127.447 13.7181 85.2149 9C82.3926 41.0832 83.5258 35.4214 100.421 58.5402Z\" stroke=\"currentColor\" stroke-width=\"15\"/><rect x=\"39.0341\" y=\"98.644\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/><rect x=\"90.8467\" y=\"92.0388\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/><rect x=\"140.407\" y=\"98.644\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/><rect x=\"116.753\" y=\"139.22\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/><rect x=\"64.9404\" y=\"139.22\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/><rect x=\"93.0994\" y=\"176.021\" width=\"19.1481\" height=\"30.1959\" rx=\"9.57407\" fill=\"currentColor\"/></svg>\n            </div>\n            <div class=\"menu__text\">" + Lampa.Lang.translate('lampac_sisiname') + "</div>\n        </li>");

      if (true) {
        var pw = $('<div>s</div>');
        pw.css({
          position: 'absolute',
          right: '-0.3em',
          bottom: '-0.5em',
          backgroundColor: '#fff',
          color: '#000',
          padding: '0.2em 0.4em',
          fontSize: '0.6em',
          borderRadius: '0.5em',
          fontWeight: 900,
          textTransform: 'uppercase'
        });
        button.find('.menu__ico').css('position', 'relative').append(pw);
      }

      button.on('hover:enter', function() {
        // Проверка и создание Lampa.ParentalControl, если не существует
        if (!Lampa.ParentalControl) {
            Lampa.ParentalControl = {
            query: function(success, error) {
                // По умолчанию всегда разрешает доступ
                if (typeof success === 'function') success();
            }
            };
        }
        Lampa.ParentalControl.query(function() {
          Api.menu(function(data) {
            // let items = [{
            //     title: 'Все'
            // }]
            var items = [];
			
            if (false && (Defined.use_api !== 'pwa' || Lampa.Platform.is('android'))) {
              items.push({
                title: 'Все'
              });
            }

            data.forEach(function(a) {
              a.title = Utils.sourceTitle(a.title);
            });
            items = items.concat(data);
            Lampa.Select.show({
              title: 'Сайты',
              items: items,
              onSelect: function onSelect(a) {
                if (a.playlist_url) {
                  Lampa.Activity.push({
                    url: a.playlist_url,
                    title: a.title,
                    component: 'sisi_view_' + Defined.use_api,
                    page: 1
                  });
                } else {
                  Lampa.Activity.push({
                    url: '',
                    title: Lampa.Lang.translate('lampac_sisiname'),
                    component: 'sisi_' + Defined.use_api,
                    page: 1
                  });
                }
              },
              onBack: function onBack() {
                Lampa.Controller.toggle('menu');
              }
            });
          }, function(e) {
			  if (typeof e == 'string') modal(e)
		  });
        }, function() {});
      });
      $('.menu .menu__list').eq(0).append(button);
      
    }
	
	function init(){
		if(window.lampa_settings.sisi_app){
			Api.menu(function(data) {
				data.forEach(function(a) {
				  a.title = Utils.sourceTitle(a.title);
				  
				  Lampa.Menu.addButton('<img src="./img/icons/settings/more.svg">', a.title, function(){
					  if (a.playlist_url) {
						  Lampa.Activity.push({
							url: a.playlist_url,
							title: a.title,
							component: 'sisi_view_' + Defined.use_api,
							page: 1
						  });
						} else {
						  Lampa.Activity.push({
							url: '',
							title: Lampa.Lang.translate('lampac_sisiname'),
							component: 'sisi_' + Defined.use_api,
							page: 1
						  });
						}
				  })
				});
			})
		}
		else{
			add()
		}
		
		addFilter();
		addSettings();
	}

    if (window.appready) init();
    else {
      Lampa.Listener.follow('app', function(e) {
        if (e.type == 'ready') init();
      });
    }
  }

  if (!window['plugin_sisi_' + Defined.use_api + '_ready']) {
    startPlugin();
    /*
    if(true){
        let s = document.createElement('script')
            s.onload = function(){
                Blazor.start({
                    loadBootResource: function (type, name, defaultUri, integrity) {
                        return Defined.framework+'/_framework/' + name
                    }
                })
                  startPlugin()
            }
              s.setAttribute('autostart', 'false')
            s.setAttribute('src', Defined.framework+'/_framework/blazor.webassembly.js')
        
            document.body.appendChild(s)
    }
    else startPlugin()
    */
  }

})();

