/**
 * CORS-прокси к GraphQL Кинопоиска для плагина Lampa "Кинопоиск".
 *
 * Зачем: kinopoisk.ru не отдает CORS-заголовки, поэтому браузер Лампы не может
 * обратиться к их API напрямую. Этот Worker - ваш собственный прокси: OAuth-токен
 * уходит только сюда.
 *
 * Чем отличается от оригинального плагина:
 *  - токен принимается в теле POST / заголовке Authorization, а не в URL;
 *  - прокси ходит только на graphql.kinopoisk.ru, произвольный URL подставить нельзя;
 *  - токен нигде не логируется;
 *  - необязательный ключ PROXY_KEY, чтобы прокси не использовали посторонние.
 *
 * Что нового в версии 6:
 *  - список отдается плагину вместе с постером, рейтингом и годом Кинопоиска;
 *  - поддерживается быстрый режим { limit, offset } для первой страницы;
 *  - kpId кэшируется на сутки, готовый список - на 15 минут, страницы - на 30 минут;
 *  - alloha (KP -> TMDB) проксируется и кэшируется на 30 дней: браузерные
 *    блокировщики рекламы больше не мешают загрузке постеров и id TMDB;
 *  - неполный ответ (ошибка одной из страниц) помечается meta.complete=false,
 *    чтобы плагин не чистил кэш по обрезанному списку.
 *
 * Плагин ждет ответ в форме data.userProfile.userData.plannedToWatch, поэтому
 * Worker сам переупаковывает ответ Кинопоиска в эту структуру.
 *
 * Настройка: см. README.md в этой папке.
 */

const GRAPHQL_URL = 'https://graphql.kinopoisk.ru/graphql';

/**
 * Шаг 1: узнать kpId пользователя по токену.
 * Документ из белого списка Кинопоиска (чужой запрос шлюз не пропустит).
 */
const ID_QUERY = `query UserCanCreateKid { userProfile { ... on UserProfile { ...UserId family { canCreateKid __typename } __typename } __typename } } fragment UserId on UserProfileInterface { id { ottId kpId puid __typename } __typename }`;

/**
 * Шаг 2: список "Буду смотреть" (реакция PLANNED_TO_WATCH).
 * socialAlias у Кинопоиска - это kpId из шага 1.
 */
const WATCHLIST_QUERY = `query UserReactionMoviesPage($isAuthorized: Boolean!, $socialAlias: String!, $includeTypes: [ReactionType!]!, $limit: Int!, $offset: Int!, $orderBy: MovieReactionsOrderBy, $supportedFilterTypes: [FilterType]!, $filters: FilterValuesInput, $singleSelectFiltersLimit: Int!, $singleSelectFiltersOffset: Int!) { userProfileBySocialAlias(socialAlias: {socialAlias: $socialAlias}) { ...SocialUserProfileId userData { movieReactions(limit: $limit, offset: $offset, orderBy: $orderBy, includeTypes: $includeTypes, supportedFilterTypes: $supportedFilterTypes, filters: $filters) { ...UserReactionMoviesAvailableFilters items { ...UserReaction __typename } total limit offset __typename } __typename } __typename } } fragment ToggleFilter on BooleanFilter { id enabled name { russian __typename } __typename } fragment SingleSelectFilters on SingleSelectFilter { id name { russian __typename } hint { russian __typename } values(offset: $singleSelectFiltersOffset, limit: $singleSelectFiltersLimit) { items { name { russian __typename } selectable value __typename } __typename } __typename } fragment KpRatingValue on RatingValue { value isActive count __typename } fragment MovieForPoster on Movie { id title { russian original __typename } poster { avatarsUrl __typename } genres { id name __typename } rating { kinopoisk { ...KpRatingValue __typename } __typename } userData @include(if: $isAuthorized) { watchStatuses { watched { value __typename } __typename } __typename } viewOption { buttonText isAvailableOnline: isWatchable(filter: {anyDevice: false, anyRegion: false}) purchasabilityStatus contentPackageToBuy { billingFeatureName __typename } subscriptionBadge { image { avatarsUrl __typename } __typename } type posterWithRightholderLogo __typename } ... on Film { productionYear __typename } ... on Video { productionYear __typename } ... on TvSeries { releaseYears { start end __typename } __typename } ... on TvShow { releaseYears { start end __typename } __typename } ... on MiniSeries { releaseYears { start end __typename } __typename } __typename } fragment SocialUserProfileId on UserProfileInterface { id { kpId ottId puid __typename } __typename } fragment UserReactionMoviesAvailableFilters on PagingList_UserMovieReactions { availableFilters { ... on BooleanFilter { ...ToggleFilter __typename } ... on SingleSelectFilter { ...SingleSelectFilters __typename } __typename } __typename } fragment UserReaction on UserMovieReactions { movie { ...MovieForPoster contentId __typename } reactions(includeTypes: $includeTypes) { __typename ... on Watched { watched __typename } ... on Vote { value __typename } ... on PlannedToWatch { plannedToWatch __typename } } __typename } `;

// Кинопоиск не отдает больше 20 реакций за один запрос (ConstraintViolationError).
const PAGE_SIZE = 20;
// Одновременных соединений у Workers и так не больше шести.
const PARALLEL = 6;
// Free-тариф Workers: 50 subrequests на запрос. 700 позиций (35 страниц)
// оставляют запас на kpId, Cache API и один повтор упавшей страницы.
const MAX_ITEMS = 700;

const FULL_TTL = 900;
const QUICK_TTL = 1800;
const ID_TTL = 86400;
const ALLOHA_TTL = 2592000;
const ALLOHA_MISS_TTL = 3600;

const ALLOHA_URL = 'https://api.alloha.tv/';
const ALLOHA_TOKEN = '04941a9a3ca3ac16e2b4327347bbc1';

// Служебный адрес для ключей Cache API (в сеть не уходит).
const CACHE_ORIGIN = 'https://kp-cache.internal';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, x-proxy-key',
    'Access-Control-Max-Age': '86400'
};

const MAX_BODY_LENGTH = 16 * 1024;

const CACHE_ENABLED = (function () {
    try {
        return typeof caches !== 'undefined' && !!caches.default;
    } catch (e) {
        return false;
    }
})();

function reply(body, status) {
    return new Response(JSON.stringify(body), {
        status: status || 200,
        headers: Object.assign({
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store'
        }, CORS_HEADERS)
    });
}

function fail(message, status) {
    return reply({ errors: [{ message: message }] }, status || 400);
}

async function readBody(request) {
    const text = await request.text();

    if (text.length > MAX_BODY_LENGTH) {
        return null;
    }

    if (!text) {
        return {};
    }

    const type = (request.headers.get('content-type') || '').toLowerCase();

    if (type.indexOf('application/json') >= 0) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return {};
        }
    }

    const result = {};
    for (const [key, value] of new URLSearchParams(text)) {
        result[key] = value;
    }
    return result;
}

async function sha256(value) {
    const source = new TextEncoder().encode(String(value));
    const digest = await crypto.subtle.digest('SHA-256', source);
    const bytes = new Uint8Array(digest);
    let hash = '';

    for (let i = 0; i < bytes.length; i++) {
        hash += bytes[i].toString(16).padStart(2, '0');
    }

    return hash;
}

async function cacheKey(parts) {
    return new Request(CACHE_ORIGIN + '/' + await sha256(parts.join('|')), { method: 'GET' });
}

async function cacheGet(key) {
    if (!CACHE_ENABLED) return null;

    try {
        const response = await caches.default.match(key);

        if (!response) return null;

        const data = await response.json();

        if (!data || !data.expires || data.expires < Date.now()) return null;

        return data.value;
    } catch (e) {
        return null;
    }
}

async function cachePut(key, value, ttl, ctx) {
    if (!CACHE_ENABLED) return;

    try {
        const response = new Response(JSON.stringify({
            expires: Date.now() + ttl * 1000,
            value: value
        }), {
            headers: {
                'content-type': 'application/json; charset=utf-8',
                'cache-control': 'public, max-age=' + ttl
            }
        });
        const promise = caches.default.put(key, response).catch(function () {
            // кэш не критичен
        });

        if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(promise);
        else await promise;
    } catch (e) {
        // кэш не критичен: без него просто сходим в Кинопоиск
    }
}

async function kinopoisk(operationName, query, variables, oauth) {
    const response = await fetch(
        GRAPHQL_URL + '?operationName=' + encodeURIComponent(operationName),
        {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                accept: 'application/json',
                'accept-language': 'ru-RU,ru;q=0.9',
                'x-preferred-language': 'ru',
                'service-id': '25',
                'x-kp-client-platform': 'web',
                authorization: 'OAuth ' + oauth,
                origin: 'https://www.kinopoisk.ru'
            },
            body: JSON.stringify({
                operationName: operationName,
                query: query,
                variables: variables
            }),
            signal: AbortSignal.timeout(45000)
        }
    );

    const text = await response.text();

    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error('upstream returned non-JSON response');
    }
}

/** Переупаковка ответа Кинопоиска в структуру, которую ждет плагин. */
function toPluginShape(items, total, extra) {
    extra = extra || {};

    return {
        data: {
            userProfile: {
                userData: {
                    plannedToWatch: {
                        movies: {
                            total: typeof total === 'number' ? total : items.length,
                            items: items
                        }
                    }
                }
            }
        },
        meta: {
            version: 6,
            complete: extra.complete !== false,
            hasMore: !!extra.hasMore,
            truncated: !!extra.truncated,
            fetched: items.length,
            total: typeof total === 'number' ? total : 0,
            offset: extra.offset || 0,
            limit: extra.limit || 0
        }
    };
}

/**
 * Постер Кинопоиска приходит базовым URL без размера. Добавляем 300x450,
 * переводим на HTTPS: без этого CDN отвечает 400 и карточки без картинок.
 */
function normalizePoster(url) {
    let value = String(url || '').trim();
    let query = '';
    let q;

    if (!value) return '';
    if (/^(data:|blob:)/i.test(value) || value.indexOf('image.tmdb.org') >= 0) return value;

    if (/^\/\//.test(value)) value = 'https:' + value;
    else value = value.replace(/^http:\/\//i, 'https://');

    q = value.indexOf('?');
    if (q >= 0) {
        query = value.slice(q);
        value = value.slice(0, q);
    }

    if (/\.(jpe?g|png|webp)$/i.test(value)) return value + query;

    if (/\/(\d{2,4})x(\d{2,4})$/.test(value)) {
        value = value.replace(/\/(\d{2,4})x(\d{2,4})$/, '/300x450');
    } else {
        value = value.replace(/\/+$/, '') + '/300x450';
    }

    return value + query;
}

/**
 * В ответе Кинопоиска уже есть постер, рейтинг, год и тип.
 * Плагин показывает их сразу, не дожидаясь alloha/TMDB.
 */
function mapReaction(item) {
    const movie = (item && item.movie) || {};
    const title = movie.title || {};
    const kpRating = movie.rating && movie.rating.kinopoisk ? movie.rating.kinopoisk.value : 0;
    const year = movie.productionYear || (movie.releaseYears && movie.releaseYears.start) || 0;
    const type = movie.__typename || '';

    return {
        movie: {
            id: movie.id,
            title: {
                localized: title.russian || '',
                original: title.original || ''
            },
            poster: normalizePoster(movie.poster && movie.poster.avatarsUrl),
            rating: Number.isFinite(Number(kpRating)) ? Number(kpRating) : 0,
            year: Number(year) || 0,
            series: type === 'TvSeries' || type === 'TvShow' || type === 'MiniSeries'
        }
    };
}

function reactionsOf(payload) {
    return payload
        && payload.data
        && payload.data.userProfileBySocialAlias
        && payload.data.userProfileBySocialAlias.userData
        && payload.data.userProfileBySocialAlias.userData.movieReactions;
}

function watchlistVariables(socialAlias, limit, offset) {
    return {
        isAuthorized: true,
        socialAlias: String(socialAlias),
        includeTypes: ['PLANNED_TO_WATCH'],
        supportedFilterTypes: ['BOOLEAN', 'SINGLE_SELECT'],
        limit: limit,
        offset: offset || 0,
        orderBy: 'UPDATED_AT_DESC',
        filters: {
            booleanFilterValues: [],
            intRangeFilterValues: [],
            singleSelectFilterValues: [],
            multiSelectFilterValues: [],
            realRangeFilterValues: []
        },
        singleSelectFiltersLimit: 1,
        singleSelectFiltersOffset: 0
    };
}

async function fetchPage(kpId, oauth, offset) {
    let lastError = null;

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const payload = await kinopoisk(
                'UserReactionMoviesPage',
                WATCHLIST_QUERY,
                watchlistVariables(kpId, PAGE_SIZE, offset),
                oauth
            );

            const reactions = reactionsOf(payload);

            if (!reactions) {
                return { payload: payload, reactions: null, items: [], total: 0, ok: false };
            }

            const parsedTotal = Number(reactions.total);

            return {
                payload: payload,
                reactions: reactions,
                items: (reactions.items || []).map(mapReaction),
                total: Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : 0,
                ok: true
            };
        } catch (e) {
            lastError = e;
        }
    }

    throw lastError || new Error('upstream request failed');
}

/**
 * Собирает весь список пачками по PARALLEL страниц.
 * Кинопоиск не отдает total, поэтому конец определяется по неполным страницам.
 * Неполный ответ помечается complete=false.
 */
async function fetchWatchlist(kpId, oauth) {
    const items = [];
    let total = 0;
    let complete = true;
    let truncated = false;

    const first = await fetchPage(kpId, oauth, 0);

    // ошибку Кинопоиска отдаем как есть
    if (!first.ok) {
        return { payload: first.payload, ok: false, complete: false };
    }

    first.items.forEach(function (item) {
        items.push(item);
    });

    total = first.total;

    if (first.items.length < PAGE_SIZE) {
        return {
            payload: toPluginShape(items, total || items.length, { complete: true }),
            ok: true,
            complete: true
        };
    }

    let offset = PAGE_SIZE;

    while (items.length < MAX_ITEMS) {
        const offsets = [];

        for (let i = 0; i < PARALLEL; i++) {
            offsets.push(offset + i * PAGE_SIZE);
        }

        const pages = await Promise.all(offsets.map(function (pageOffset) {
            return fetchPage(kpId, oauth, pageOffset).catch(function () {
                return null;
            });
        }));

        let batchFailed = false;
        let hitEnd = false;

        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];

            // ошибка страницы: не рвем список посередине и не чистим кэш
            if (!page || !page.ok) {
                batchFailed = true;
                break;
            }

            if (!page.items.length) {
                hitEnd = true;
                break;
            }

            for (let j = 0; j < page.items.length; j++) {
                items.push(page.items[j]);
            }

            if (page.total) {
                total = page.total;
            }

            if (page.items.length < PAGE_SIZE) {
                hitEnd = true;
                break;
            }

            if (total && items.length >= total) {
                hitEnd = true;
                break;
            }
        }

        if (batchFailed) {
            complete = false;
            break;
        }

        offset += PARALLEL * PAGE_SIZE;

        if (hitEnd) break;

        if (items.length >= MAX_ITEMS) {
            complete = false;
            truncated = true;
            break;
        }
    }

    if (items.length >= MAX_ITEMS) {
        complete = false;
        truncated = true;
    }

    const sliced = items.slice(0, MAX_ITEMS);

    return {
        payload: toPluginShape(sliced, total || sliced.length, {
            complete: complete,
            truncated: truncated
        }),
        ok: true,
        complete: complete
    };
}

/** Быстрый режим: одна страница для первого экрана. */
async function fetchQuick(kpId, oauth, offset, limit) {
    const page = await fetchPage(kpId, oauth, offset);

    if (!page.ok) {
        return { payload: page.payload, ok: false, complete: false, hasMore: false };
    }

    const items = page.items;
    const hasMore = items.length === limit;
    const complete = offset === 0 && !hasMore;

    return {
        payload: toPluginShape(items, page.total, {
            complete: complete,
            hasMore: hasMore,
            offset: offset,
            limit: limit
        }),
        ok: true,
        complete: complete,
        hasMore: hasMore
    };
}

function slicePluginResponse(payload, offset, limit) {
    const movies = payload
        && payload.data
        && payload.data.userProfile
        && payload.data.userProfile.userData
        && payload.data.userProfile.userData.plannedToWatch
        && payload.data.userProfile.userData.plannedToWatch.movies;

    if (!movies || !Array.isArray(movies.items)) return null;

    const items = movies.items.slice(offset, offset + limit);
    const hasMore = offset + items.length < movies.items.length;

    return toPluginShape(items, movies.total, {
        complete: !hasMore,
        hasMore: hasMore,
        offset: offset,
        limit: limit
    });
}

async function resolveKpId(oauth, tokenHash, ctx) {    const key = await cacheKey(['id', tokenHash]);
    const cached = await cacheGet(key);

    if (cached && cached.kpId) {
        return { kpId: String(cached.kpId), payload: null };
    }

    const identifiers = await kinopoisk('UserCanCreateKid', ID_QUERY, {}, oauth);
    const kpId = identifiers
        && identifiers.data
        && identifiers.data.userProfile
        && identifiers.data.userProfile.id
        && identifiers.data.userProfile.id.kpId;

    if (!kpId) {
        return { kpId: '', payload: identifiers };
    }

    const value = String(kpId);

    await cachePut(key, { kpId: value }, ID_TTL, ctx);

    return { kpId: value, payload: null };
}

async function handleAlloha(kp, ctx) {
    if (!/^\d{1,12}$/.test(kp)) {
        return fail('invalid kinopoisk id', 400);
    }

    const lookupKey = await cacheKey(['alloha', kp]);
    const cached = await cacheGet(lookupKey);

    if (cached) return reply(cached, 200);

    const response = await fetch(
        ALLOHA_URL + '?token=' + ALLOHA_TOKEN + '&kp=' + encodeURIComponent(kp),
        {
            method: 'GET',
            headers: {
                accept: 'application/json',
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
            },
            signal: AbortSignal.timeout(10000)
        }
    );

    const text = await response.text();
    let data;

    try {
        data = JSON.parse(text);
    } catch (e) {
        throw new Error('alloha returned non-JSON response');
    }

    await cachePut(
        lookupKey,
        data,
        data && data.status === 'success' ? ALLOHA_TTL : ALLOHA_MISS_TTL,
        ctx
    );

    return reply(data, 200);
}

export default {
    async fetch(request, env, ctx) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        const url = new URL(request.url);

        if (url.pathname === '/health') {
            return reply({
                ok: true,
                version: 6,
                has_key: Boolean(env.PROXY_KEY),
                cache: CACHE_ENABLED
            });
        }

        if (request.method !== 'POST') {
            return fail('only POST is supported', 405);
        }

        const body = await readBody(request);

        if (body === null) {
            return fail('request body is too large', 413);
        }

        const auth = request.headers.get('authorization') || '';
        let oauth = /^OAuth\s+/i.test(auth) ? auth.replace(/^OAuth\s+/i, '').trim() : '';
        oauth = oauth || String(body.oauth || '').trim();

        const key = request.headers.get('x-proxy-key') || String(body.key || '');
        const limit = Math.min(Math.max(parseInt(body.limit, 10) || 0, 0), PAGE_SIZE);
        const offset = Math.min(Math.max(parseInt(body.offset, 10) || 0, 0), MAX_ITEMS);
        // fresh обходит кэш Worker: ручное обновление должно видеть
        // актуальный список, а не страницы тридцатиминутной давности.
        const fresh = body.fresh === true;

        if (env.PROXY_KEY && key !== env.PROXY_KEY) {
            return fail('forbidden', 403);
        }

        // alloha проксируется через Worker: браузерные блокировщики рекламы
        // не режут api.alloha.tv, а ответы кэшируются на 30 дней.
        const allohaKp = String(body.alloha || '').trim();

        if (allohaKp) {
            try {
                return await handleAlloha(allohaKp, ctx);
            } catch (e) {
                return fail('alloha request failed: ' + (e && e.message ? e.message : 'unknown error'), 502);
            }
        }

        if (!oauth) {
            return fail('oauth token is missing', 400);
        }

        if (!/^[\w.\-]{8,4096}$/.test(oauth)) {
            return fail('oauth token looks malformed', 400);
        }

        const tokenHash = await sha256(oauth);

        try {
            const resolved = await resolveKpId(oauth, tokenHash, ctx);

            if (!resolved.kpId) {
                return reply(resolved.payload || {
                    errors: [{
                        message: 'Не удалось определить профиль Кинопоиска. Войдите в аккаунт на kinopoisk.ru и повторите.'
                    }]
                }, 200);
            }

            const kpId = resolved.kpId;

            if (limit > 0) {
                const quickKey = await cacheKey(['quick', tokenHash, kpId, offset, limit]);

                if (!fresh) {
                    // полный список свежее быстрого кэша: если он есть, отдаем срез из него
                    const fullKey = await cacheKey(['full', tokenHash, kpId]);
                    const cachedFull = await cacheGet(fullKey);
                    const sliced = cachedFull ? slicePluginResponse(cachedFull, offset, limit) : null;

                    if (sliced) return reply(sliced, 200);

                    const cachedQuick = await cacheGet(quickKey);

                    if (cachedQuick) return reply(cachedQuick, 200);
                }

                const quick = await fetchQuick(kpId, oauth, offset, limit);

                if (quick.ok) await cachePut(quickKey, quick.payload, QUICK_TTL, ctx);

                return reply(quick.payload, 200);
            }

            const fullKey = await cacheKey(['full', tokenHash, kpId]);

            if (!fresh) {
                const cached = await cacheGet(fullKey);

                if (cached) return reply(cached, 200);
            }

            const full = await fetchWatchlist(kpId, oauth);

            if (full.ok && full.complete) {
                await cachePut(fullKey, full.payload, FULL_TTL, ctx);
            }

            return reply(full.payload, 200);
        } catch (e) {
            return fail('upstream request failed: ' + (e && e.message ? e.message : 'unknown error'), 502);
        }
    }
};
