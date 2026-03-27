// IMDB multi-item pages - injects Seerr badges into list items and shoveler cards
(function () {
    // Skip individual title pages (imdb.js handles those)
    if (/\/title\/tt\d+/.test(document.location.pathname)) return;
    console.log('[Seerr] Multi-item script loaded on', document.location.pathname);

    const IMDB_RE = /\/title\/(tt\d+)/;
    const STATUS_TEXT = { 1: 'Unknown', 2: 'Pending', 3: 'Processing', 4: 'Partially Available', 5: 'Available' };

    function makeContainer(compact) {
        const cls = compact
            ? 'seerr-container oa-flex oa-flex-row oa-items-center' // shoveler: no margin, tight
            : 'seerr-container oa-flex oa-flex-row oa-items-center oa-mt-1'; // list: normal
        return $(`<div class="${cls}" style="gap:4px;">
            <img class="seerr-icon" src="${chrome.runtime.getURL('images/icon.png')}" alt="Seerr"${compact ? ' style="width:14px;height:14px;"' : ''}>
        </div>`);
    }

    function addSpinner(container) {
        container.append('<div class="seerr-spin"></div>');
    }

    function removeSpinner(container) {
        container.find('.seerr-spin').remove();
    }

    function addBadge(container, text, bgClass, href, bgColor) {
        const style = `white-space:nowrap;${bgColor ? 'background:' + bgColor + ';' : ''}`;
        container.append(`
            <a class="oa-flex oa-items-center oa-px-2 oa-py-1 oa-text-xs oa-leading-4 oa-font-medium oa-rounded-md seerr-text-white
                oa-transition oa-ease-in-out oa-duration-150 ${bgClass}" href="${href || 'javascript:;'}" target="_blank"
                style="${style}">${text}</a>
        `);
    }

    function addRequestButton(container, tmdbId, mediaType, mediaInfo, currentUserId) {
        const btn = $(`
            <a class="seerr-chart-request oa-flex oa-items-center oa-px-2 oa-py-1 oa-text-xs oa-leading-4 oa-font-medium oa-rounded-md seerr-text-white
                oa-bg-indigo-600 oa-border oa-border-indigo-600 hover:oa-bg-indigo-500 hover:oa-border-indigo-500 oa-transition oa-ease-in-out oa-duration-150"
                href="javascript:;" style="white-space:nowrap;">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:12px;height:12px;margin-right:2px;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                </svg>
                Request
            </a>
        `);
        btn.on('click', function () {
            btn.remove();
            addSpinner(container);
            let seasons = [];
            if (mediaType === 'tv' && mediaInfo && mediaInfo.seasons) {
                seasons = mediaInfo.seasons.map(s => s.seasonNumber).filter(n => n > 0);
            }
            chrome.runtime.sendMessage({
                contentScriptQuery: 'requestMedia',
                tmdbId: tmdbId,
                mediaType: mediaType,
                seasons: seasons
            }, json => {
                removeSpinner(container);
                if (!json || !json.media) {
                    addBadge(container, 'Error', 'oa-bg-red-600');
                    return;
                }
                addBadge(container, 'Requested', 'oa-bg-indigo-600', `${origin}/${mediaType}/${tmdbId}`);
            });
        });
        container.append(btn);
    }

    function fillItem(container, mediaInfo, tmdbId, mediaType, currentUserId) {
        const status = mediaInfo ? mediaInfo.status : 0;
        const seerrLink = tmdbId ? `${origin}/${mediaType}/${tmdbId}` : origin;

        switch (status) {
            case 0:
            case 1:
                addRequestButton(container, tmdbId, mediaType, null, currentUserId);
                break;
            case 2:
            case 3:
                addBadge(container, STATUS_TEXT[status], 'oa-bg-gradient-to-br oa-from-indigo-600 oa-to-purple-600', seerrLink);
                break;
            case 4:
                addBadge(container, STATUS_TEXT[status], 'oa-bg-gradient-to-br oa-from-indigo-600 oa-to-purple-600', seerrLink);
                break;
            case 5:
                addBadge(container, 'Available', '', seerrLink, '#059669');
                break;
        }
    }

    function queryAndFill(container, imdbId, currentUserId) {
        chrome.runtime.sendMessage({ contentScriptQuery: 'search', title: `imdb:${imdbId}` }, json => {
            if (!json || !json.results || json.results.length === 0) {
                removeSpinner(container);
                addBadge(container, 'Not found', 'oa-bg-gray-600');
                return;
            }
            const result = json.results[0];
            const mediaType = result.mediaType;
            chrome.runtime.sendMessage({ contentScriptQuery: 'queryMedia', tmdbId: result.id, mediaType: mediaType }, detail => {
                removeSpinner(container);
                if (detail && detail.externalIds && detail.externalIds.imdbId === imdbId) {
                    fillItem(container, detail.mediaInfo, detail.id, mediaType, currentUserId);
                } else {
                    addBadge(container, 'Not found', 'oa-bg-gray-600');
                }
            });
        });
    }

    // --- List/chart items (ipc-metadata-list-summary-item) ---
    function processListItem(item, currentUserId) {
        const link = item.querySelector('a[href*="/title/"]');
        if (!link) return;
        const match = link.getAttribute('href').match(IMDB_RE);
        if (!match) return;

        const container = makeContainer(false);
        addSpinner(container);
        const target = item.querySelector('[class*="cli-children"]') ||
                       item.querySelector('.ipc-metadata-list-summary-item__tc') ||
                       item;
        $(target).append(container);
        queryAndFill(container, match[1], currentUserId);
    }

    function processShovelerCard(card, currentUserId) {
        const link = card.querySelector('a[href*="/title/"]');
        if (!link) return;
        const match = link.getAttribute('href').match(IMDB_RE);
        if (!match) return;

        const container = makeContainer(true);
        addSpinner(container);
        $(card).append(container);
        queryAndFill(container, match[1], currentUserId);
    }

    const processed = new WeakSet();

    function processAll(currentUserId) {
        // List/chart items
        document.querySelectorAll('.ipc-metadata-list-summary-item').forEach(item => {
            if (processed.has(item)) return;
            processed.add(item);
            processListItem(item, currentUserId);
        });

        // Shoveler poster cards
        document.querySelectorAll('.ipc-poster-card').forEach(card => {
            if (processed.has(card)) return;
            if (!card.querySelector('a[href*="/title/"]')) return;
            processed.add(card);
            processShovelerCard(card, currentUserId);
        });
    }

    function init() {
        console.log('[Seerr] Multi-item init starting');
        pullStoredData(function () {
            console.log('[Seerr] pullStoredData done, userId:', userId);
            if (!userId) return;

            processAll(userId);
            // Observe for dynamically loaded content
            const observer = new MutationObserver(() => processAll(userId));
            observer.observe(document.body, { childList: true, subtree: true });
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
