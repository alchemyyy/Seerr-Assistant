let seerrUrl, origin, userId, seerrVersion;


function pullStoredData(callback) {
    chrome.storage.sync.get(['seerrUrl', 'userId', 'seerrVersion'], function(data) {
        seerrUrl = data.seerrUrl || '';
        origin = seerrUrl.replace(/\/+$/, '');
        userId = data.userId || undefined;
        seerrVersion = data.seerrVersion || undefined;
        if (callback) callback(data);
    });
}

function isLoggedIn(callback) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    Promise.all([
        fetch(`${origin}/api/v1/auth/me`, {
            credentials: 'include',
            signal: controller.signal
        }).then(r => r.json()),
        fetch(`${origin}/api/v1/status`, {
            credentials: 'include',
            signal: controller.signal
        }).then(r => r.json())
    ]).then(([userResponse, versionResponse]) => {
        clearTimeout(timeout);
        const userOk = userResponse && userResponse.id && !userResponse.error;
        const versionOk = versionResponse && versionResponse.version && !versionResponse.error;
        userId = userOk && versionOk ? userResponse.id : null;
        seerrVersion = userOk && versionOk ? versionResponse.version : null;
        chrome.storage.sync.set({ userId: userId, seerrVersion: seerrVersion });
        if (callback) callback(userOk && versionOk, userId);
    }).catch(() => {
        clearTimeout(timeout);
        userId = null;
        seerrVersion = null;
        chrome.storage.sync.set({ userId: null, seerrVersion: null });
        if (callback) callback(false, null);
    });
}

function setSeerrUrl(url, callback) {
    seerrUrl = url;
    origin = seerrUrl.replace(/\/+$/, '');
    chrome.storage.sync.set({ seerrUrl: seerrUrl }, function() {
        if (callback) callback();
    });
}

function loginWithCredentials(username, password, callback) {
    fetch(`${origin}/api/v1/auth/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: username, password: password })
    }).then(response => {
        if (!response.ok) {
            return response.json().then(err => {
                callback(false, err.message || 'Login failed');
            });
        }
        return response.json().then(user => {
            userId = user.id;
            chrome.storage.sync.set({ userId: userId });
            callback(true, null, user);
        });
    }).catch(err => {
        callback(false, 'Server unreachable');
    });
}
