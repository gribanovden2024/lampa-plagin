/* ========================================================================
 * LGBT — выключение раздела
 * файл-источник: src/lgbt.js
 * регистрирует: ничего не регистрирует, только ставит флаг window.lampa_settings.disable_features.lgbt = true
 * примечание: загружается первым: флаг должен успеть до построения меню
 * ======================================================================== */

try {
(function () {
	'use strict';

	//Lampa. LGBT plugin
	window.lampa_settings.disable_features.lgbt=true;

})();
} catch (e) {
    console.error('[lampa-plagin] LGBT — выключение раздела не загрузился:', e);
}
