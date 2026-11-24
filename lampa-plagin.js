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
 *
 * Собрано: 20261124222042
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

    var VERSION = '20261124222042';

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
        { name: 'Strawberry / sisi (si.skaz.tv)', file: 'plugins/sisi.js' }
    ];

    console.log('[lampa-plagin] установщик, плагинов: ' + PLUGINS.length + ', база: ' + BASE);

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
