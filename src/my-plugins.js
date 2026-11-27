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
