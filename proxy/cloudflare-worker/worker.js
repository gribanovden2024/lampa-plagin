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
 * Плагин ждет ответ в форме data.userProfile.userData.plannedToWatch, поэтому
 * Worker сам переупаковывает ответ Кинопоиска в эту структуру. Плагин менять не нужно.
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
// Страницы тянем пачками параллельно; поле total в ответе не приходит, поэтому
// ориентируемся на длину страниц, а не на него.
const PAGE_SIZE = 20;
const PARALLEL = 6;
const MAX_ITEMS = 1000;

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type, authorization, x-proxy-key',
    'Access-Control-Max-Age': '86400'
};

const MAX_BODY_LENGTH = 16 * 1024;

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
            signal: AbortSignal.timeout(20000)
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
function toPluginShape(items, total) {
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
        }
    };
}

function mapReaction(item) {
    const movie = (item && item.movie) || {};
    const title = movie.title || {};

    return {
        movie: {
            id: movie.id,
            title: {
                localized: title.russian || '',
                original: title.original || ''
            }
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

async function fetchPage(kpId, oauth, offset) {
    const payload = await kinopoisk(
        'UserReactionMoviesPage',
        WATCHLIST_QUERY,
        watchlistVariables(kpId, PAGE_SIZE, offset),
        oauth
    );

    const reactions = reactionsOf(payload);

    if (!reactions) {
        return { payload: payload, reactions: null, items: [], total: 0 };
    }

    const parsedTotal = Number(reactions.total);

    return {
        payload: payload,
        reactions: reactions,
        items: (reactions.items || []).map(mapReaction),
        total: Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : 0
    };
}

/**
 * Собирает весь список пачками по PARALLEL страниц.
 * Кинопоиск не отдает total, поэтому конец определяется по неполным страницам.
 */
async function fetchWatchlist(kpId, oauth) {
    const items = [];
    let total = 0;

    const first = await fetchPage(kpId, oauth, 0);

    // ошибку Кинопоиска отдаем как есть
    if (!first.reactions) {
        return first.payload;
    }

    first.items.forEach(function (item) {
        items.push(item);
    });

    total = first.total;

    if (first.items.length < PAGE_SIZE) {
        return toPluginShape(items, total);
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

        let gotSomething = false;
        let hitEnd = false;

        pages.forEach(function (page) {
            const list = page && page.items;

            if (!list || !list.length) {
                hitEnd = true;
                return;
            }

            gotSomething = true;

            if (list.length < PAGE_SIZE) {
                hitEnd = true;
            }

            list.forEach(function (item) {
                items.push(item);
            });

            if (page.total) {
                total = page.total;
            }
        });

        if (!gotSomething) {
            break;
        }

        offset += PARALLEL * PAGE_SIZE;

        if (hitEnd || (total && items.length >= total)) {
            break;
        }
    }

    return toPluginShape(items.slice(0, MAX_ITEMS), total || items.length);
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

export default {
    async fetch(request, env) {
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        const url = new URL(request.url);

        if (url.pathname === '/health') {
            return reply({
                ok: true,
                version: 4,
                has_key: Boolean(env.PROXY_KEY)
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

        if (env.PROXY_KEY && key !== env.PROXY_KEY) {
            return fail('forbidden', 403);
        }

        if (!oauth) {
            return fail('oauth token is missing', 400);
        }

        if (!/^[\w.\-]{8,4096}$/.test(oauth)) {
            return fail('oauth token looks malformed', 400);
        }

        let kpId = '';

        try {
            const identifiers = await kinopoisk('UserCanCreateKid', ID_QUERY, {}, oauth);

            if (identifiers.errors && !(identifiers.data && identifiers.data.userProfile)) {
                return reply(identifiers, 200);
            }

            kpId = identifiers
                && identifiers.data
                && identifiers.data.userProfile
                && identifiers.data.userProfile.id
                && identifiers.data.userProfile.id.kpId;

            kpId = kpId ? String(kpId) : '';
        } catch (e) {
            return fail('upstream request failed: ' + (e && e.message ? e.message : 'unknown error'), 502);
        }

        if (!kpId) {
            return reply({
                errors: [{
                    message: 'Не удалось определить профиль Кинопоиска. Войдите в аккаунт на kinopoisk.ru и повторите.'
                }]
            }, 200);
        }

        try {
            return reply(await fetchWatchlist(kpId, oauth), 200);
        } catch (e) {
            return fail('upstream request failed: ' + (e && e.message ? e.message : 'unknown error'), 502);
        }
    }
};
