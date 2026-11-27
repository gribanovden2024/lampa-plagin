/*
 * lampa-plagin — установщик.
 *
 * В Лампу добавляется только этот файл: Настройки -> Расширения -> Добавить плагин.
 * Он последовательно подгружает отдельные плагины из папки plugins/.
 *
 * Список того, что будет загружено:
 *   1) LGBT — выключение раздела  ->  plugins/lgbt.js
 *   2) Кинопоиск — «Буду смотреть»  ->  plugins/kinopoisk.js
 *   3) Strawberry / sisi (si.skaz.tv)  ->  plugins/sisi.js
 *   4) Телевидение — IPTV (M3U + XMLTV)  ->  plugins/tv.js
 *   5) ТВ онлайн — 20 федеральных каналов  ->  plugins/tvonline.js
 *
 * Собрано: 20261127224518
 */

(function () {
    'use strict';

    // Встроенная проверка расширений Лампы ищет в файле подстроку "Lampa."
    // и без неё показывает ошибку 500 «не плагин».
    if (!window.Lampa) {
        console.error('[lampa-plagin] не найдено приложение Lampa. Плагин не загружен');
        return;
    }

    if (window.lampa_plagin_installer) {
        console.log('[lampa-plagin] установщик уже запущен');
        return;
    }

    window.lampa_plagin_installer = true;

    var VERSION = '20261127224518';

    // Папка, из которой загружен этот файл. Нужна, чтобы плагины подхватывались
    // с того же адреса (GitHub Pages, свой сервер, локальная папка).
    var BASE = (function () {
        try {
            var src = document.currentScript && document.currentScript.src;

            if (src) {
                return src.replace(/[^\/]*$/, '');
            }
        } catch (e) {}

        return 'https://gribanovden2024.github.io/lampa-plagin/';
    })();

    var PLUGINS = [
        { name: 'LGBT — выключение раздела', file: 'plugins/lgbt.js' },
        { name: 'Кинопоиск — «Буду смотреть»', file: 'plugins/kinopoisk.js' },
        { name: 'Strawberry / sisi (si.skaz.tv)', file: 'plugins/sisi.js' },
        { name: 'Телевидение — IPTV (M3U + XMLTV)', file: 'plugins/tv.js' },
        { name: 'ТВ онлайн — 20 федеральных каналов', file: 'plugins/tvonline.js' }
    ];

    // Разделы настроек, которые собираются в «Мои плагины».
    var PLUGIN_SETTINGS = [
        { component: 'kinopoisk_settings', name: 'Кинопоиск' },
        { component: 'tv_settings', name: 'Телевидение' },
        { component: 'tvonline_settings', name: 'ТВ онлайн' },
        { component: 'sisi_settings', name: 'Strawberry 18+' }
    ];

    // «Мои плагины»: папка в настройках и переходы в настройки плагинов.
    /**
     * «Мои плагины» — единый раздел настроек для всех плагинов набора.
     *
     * Регистрирует в настройках Лампы папку «Мои плагины». Внутри — пункты
     * «Кинопоиск», «Телевидение», «ТВ онлайн» и т.д.; при выборе открывается
     * штатный экран настроек соответствующего плагина. Отдельные пункты этих
     * плагинов из корня настроек скрываются.
     *
     * Файл встраивается в установщик (lampa-plagin.js) при сборке; список
     * компонентов передаётся из build.mjs массивом plugins -> settings.
     */
    function setupMyPluginsSettings(pluginSettings) {
        'use strict';
    
        var COMPONENT = 'lampa_plagin_settings';
        var FOLDER_NAME = 'Мои плагины';
        var FOLDER_ICON = '<svg width="37" height="37" viewBox="0 0 37 37" fill="none" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M3 10.5C3 8.567 4.567 7 6.5 7H13.2L16.2 10H30.5C32.433 10 34 11.567 34 13.5V27.5C34 29.433 32.433 31 30.5 31H6.5C4.567 31 3 29.433 3 27.5V10.5Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>' +
            '<path d="M3 14.5H34" stroke="currentColor" stroke-width="3"/>' +
        '</svg>';
    
        if (!window.Lampa || !Lampa.SettingsApi || !Lampa.Settings || !Lampa.Settings.listener) {
            return;
        }
    
        function getComponent(id) {
            if (typeof Lampa.SettingsApi.getComponent !== 'function') return null;
    
            return Lampa.SettingsApi.getComponent(id);
        }
    
        function getInfo(item) {
            var registered = getComponent(item.component);
            var params = null;
    
            if (!registered && typeof Lampa.SettingsApi.getParam === 'function') {
                params = Lampa.SettingsApi.getParam(item.component);
            }
    
            // Плагин не загрузился или не зарегистрировал настройки — не показываем.
            if (!registered && !params) return null;
    
            return {
                component: item.component,
                name: (registered && registered.name) || item.name || item.component,
                icon: (registered && registered.icon) || FOLDER_ICON
            };
        }
    
        function openFolder() {
            Lampa.Settings.create(COMPONENT);
        }
    
        function openPlugin(component) {
            // Закрываем «Мои плагины» штатным back текущего компонента: он удалит
            // DOM и отпишет listener'ы. Controller.back() здесь не используем,
            // чтобы не срабатывала защита от тройного нажатия «Назад».
            try {
                var enabled = Lampa.Controller && Lampa.Controller.enabled();
    
                if (enabled && enabled.name === 'settings_component' &&
                    enabled.controller && typeof enabled.controller.back === 'function') {
                    enabled.controller.back();
                }
            } catch (e) {}
    
            Lampa.Settings.create(component, { onBack: openFolder });
        }
    
        function renderFolder(param, info) {
            param.removeClass('settings-param');
            param.addClass('settings-folder');
            param.attr('data-static', 'true');
            param.empty();
    
            param.append('<div class="settings-folder__icon">' + info.icon + '</div>');
            param.append('<div class="settings-folder__name"></div>');
            param.find('.settings-folder__name').text(info.name);
    
            param.on('hover:enter', function () {
                openPlugin(info.component);
            });
        }
    
        function buildParams() {
            var count = 0;
    
            if (typeof Lampa.SettingsApi.removeParams === 'function') {
                Lampa.SettingsApi.removeParams(COMPONENT);
            }
    
            pluginSettings.forEach(function (item) {
                if (!item || !item.component) return;
    
                var info = getInfo(item);
    
                if (!info) return;
    
                count++;
    
                Lampa.SettingsApi.addParam({
                    component: COMPONENT,
                    param: {
                        type: 'static'
                    },
                    field: {
                        name: info.name
                    },
                    onRender: function (param) {
                        renderFolder(param, info);
                    }
                });
            });
    
            return count;
        }
    
        function hidePluginComponents(body) {
            pluginSettings.forEach(function (item) {
                if (!item || !item.component) return;
    
                body.find('[data-component="' + item.component + '"]').remove();
            });
        }
    
        function positionFolder(body) {
            var folder = body.find('[data-component="' + COMPONENT + '"]');
    
            if (!folder.length) return;
    
            var plugins = body.find('[data-component="plugins"]');
    
            if (plugins.length) {
                folder.insertAfter(plugins);
                return;
            }
    
            var more = body.find('[data-component="more"]');
    
            if (more.length) folder.insertBefore(more);
        }
    
        function init() {
            if (window.lampa_plagin_settings_ready) return;
    
            window.lampa_plagin_settings_ready = true;
    
            Lampa.SettingsApi.addComponent({
                component: COMPONENT,
                icon: FOLDER_ICON,
                name: FOLDER_NAME
            });
    
            console.log('[lampa-plagin] раздел «Мои плагины» зарегистрирован');
    
            Lampa.Settings.listener.follow('open', function (e) {
                if (!e || e.name !== 'main') return;
    
                var count = buildParams();
    
                if (!count) {
                    e.body.find('[data-component="' + COMPONENT + '"]').remove();
                    return;
                }
    
                hidePluginComponents(e.body);
                positionFolder(e.body);
            });
        }
    
        init();
    }

    try {
        setupMyPluginsSettings(PLUGIN_SETTINGS);
    } catch (e) {
        console.error('[lampa-plagin] не удалось зарегистрировать «Мои плагины»:', e);
    }

    console.log('[lampa-plagin] установщик ' + VERSION + ', плагинов: ' + PLUGINS.length + ', база: ' + BASE);

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
