if (typeof importScripts !== 'undefined') importScripts('js/storage.js');


function encodeURIComponentSafe(value) {
    return encodeURIComponent(value)
        .replace(/!/g, '%21')
        .replace(/\~/g, '%7E')
        .replace(/\*/g, '%2A')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29');
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.contentScriptQuery === 'queryMedia') {
        console.log(`Querying ${request.mediaType} '${request.tmdbId}'`);
        pullStoredData(function() {
            fetch(`${origin}/api/v1/${request.mediaType}/${encodeURIComponent(request.tmdbId)}`, {
                credentials: 'include'
            })
                .then(response => response.json())
                .then(json => sendResponse(json))
                .catch(error => console.error(error));
        });
        return true;
    }

    else if (request.contentScriptQuery === 'requestMedia') {
        console.log(`Requesting media '${request.tmdbId}' of type '${request.mediaType}'`);
        pullStoredData(function() {
            const storageKey = request.mediaType === 'movie' ? 'movieOverrides' : 'tvOverrides';
            chrome.storage.sync.get([storageKey], function(data) {
                const overrides = data[storageKey] || {};
                const body = { mediaType: request.mediaType, mediaId: request.tmdbId, seasons: request.seasons };
                if (overrides.profileId) body.profileId = overrides.profileId;
                if (overrides.rootFolder) body.rootFolder = overrides.rootFolder;
                if (overrides.serverId !== undefined && overrides.serverId !== null) body.serverId = overrides.serverId;
                fetch(`${origin}/api/v1/request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(body)
                })
                    .then(response => response.json())
                    .then(json => sendResponse(json))
                    .catch(error => console.error(error));
            });
        });
        return true;
    }

    else if (request.contentScriptQuery === 'search') {
        console.log(`Searching movie '${request.title}'`);
        pullStoredData(function() {
            fetch(`${origin}/api/v1/search?query=${encodeURIComponentSafe(request.title)}`, {
                credentials: 'include'
            })
                .then(response => response.json())
                .then(json => sendResponse(json))
                .catch(error => console.error(error));
        });
        return true;
    }

    else if (request.contentScriptQuery === 'login') {
        console.log('Logging in');
        pullStoredData(function() {
            function onSuccess(user) {
                userId = user.id;
                chrome.storage.sync.set({ userId: userId });
                sendResponse({ success: true, user: user });
            }

            // Try local auth first (email + password)
            fetch(`${origin}/api/v1/auth/local`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email: request.username, password: request.password })
            })
                .then(response => {
                    if (response.ok) return response.json().then(onSuccess);
                    // Local auth failed, try Jellyfin auth (username + password)
                    return fetch(`${origin}/api/v1/auth/jellyfin`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ username: request.username, password: request.password })
                    }).then(jfResponse => {
                        if (jfResponse.ok) return jfResponse.json().then(onSuccess);
                        return jfResponse.json().then(err => sendResponse({ success: false, error: err.message || 'Login failed' }));
                    });
                })
                .catch(() => sendResponse({ success: false, error: 'Server unreachable' }));
        });
        return true;
    }

    else if (request.contentScriptQuery === 'fetchServices') {
        console.log(`Fetching ${request.serviceType} services`);
        pullStoredData(function() {
            fetch(`${origin}/api/v1/service/${request.serviceType}`, {
                credentials: 'include'
            })
                .then(response => response.json())
                .then(servers => {
                    if (!Array.isArray(servers) || servers.length === 0) {
                        sendResponse({ servers: [], profiles: [], rootFolders: [] });
                        return;
                    }
                    const serverId = servers[0].id;
                    fetch(`${origin}/api/v1/service/${request.serviceType}/${serverId}`, {
                        credentials: 'include'
                    })
                        .then(response => response.json())
                        .then(details => {
                            sendResponse({
                                servers: servers,
                                profiles: details.profiles || [],
                                rootFolders: details.rootFolders || []
                            });
                        })
                        .catch(error => { console.error(error); sendResponse({ servers: [], profiles: [], rootFolders: [] }); });
                })
                .catch(error => { console.error(error); sendResponse({ servers: [], profiles: [], rootFolders: [] }); });
        });
        return true;
    }

    else if (request.contentScriptQuery === 'fetchServiceDetails') {
        console.log(`Fetching ${request.serviceType} server ${request.serverId} details`);
        pullStoredData(function() {
            fetch(`${origin}/api/v1/service/${request.serviceType}/${request.serverId}`, {
                credentials: 'include'
            })
                .then(response => response.json())
                .then(details => {
                    sendResponse({
                        profiles: details.profiles || [],
                        rootFolders: details.rootFolders || []
                    });
                })
                .catch(error => { console.error(error); sendResponse({ profiles: [], rootFolders: [] }); });
        });
        return true;
    }

    else if (request.contentScriptQuery === 'openOptionsPage') {
        chrome.runtime.openOptionsPage();
        return true;
    }

    else if (request.contentScriptQuery === 'listenForUrlChange') {
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (
                changeInfo.status === 'complete' &&
                tab.status === 'complete' &&
                tab.url &&
                tab.url.startsWith('https://www.senscritique.com')
            ) {
                chrome.tabs.sendMessage(tab.id, {
                    newUrl: tab.url
                });
            }
        });
    }
    return false;
});
