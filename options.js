let seerrUrlInput = document.getElementById('seerrUrl');
let usernameInput = document.getElementById('username');
let passwordInput = document.getElementById('password');
let spinnerDiv = document.getElementById('spinnerDiv');
let loginStatusOKDiv = document.getElementById('loginStatusOK');
let loginStatusKODiv = document.getElementById('loginStatusKO');
let loginErrorMessage = document.getElementById('loginErrorMessage');
let loginButton = document.getElementById('loginButton');

let overridesSection = document.getElementById('overridesSection');
let movieServerSelect = document.getElementById('movieServer');
let movieQualitySelect = document.getElementById('movieQualityProfile');
let movieRootFolderSelect = document.getElementById('movieRootFolder');
let tvServerSelect = document.getElementById('tvServer');
let tvQualitySelect = document.getElementById('tvQualityProfile');
let tvRootFolderSelect = document.getElementById('tvRootFolder');
let saveOverridesButton = document.getElementById('saveOverridesButton');
let overridesStatusOK = document.getElementById('overridesStatusOK');

let radarrServers = [];
let sonarrServers = [];


function enableSpinner() {
    spinnerDiv.innerHTML = `
        <div class="spinner-border text-primary m-3"></div>
        <div class="text-white">Logging in...</div>
    `;
}

function disableSpinner() {
    spinnerDiv.innerHTML = '';
}

function showError(message) {
    loginStatusOKDiv.hidden = true;
    loginStatusKODiv.hidden = false;
    loginErrorMessage.textContent = message || 'Unable to connect to Seerr';
}

function showSuccess() {
    loginStatusOKDiv.hidden = false;
    loginStatusKODiv.hidden = true;
}

function hideStatus() {
    loginStatusOKDiv.hidden = true;
    loginStatusKODiv.hidden = true;
}

function validUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

function validateForm() {
    let valid = true;

    if (validUrl(seerrUrlInput.value)) {
        seerrUrlInput.classList.remove('is-invalid');
    } else {
        seerrUrlInput.classList.add('is-invalid');
        valid = false;
    }

    if (usernameInput.value.trim().length > 0) {
        usernameInput.classList.remove('is-invalid');
    } else {
        usernameInput.classList.add('is-invalid');
        valid = false;
    }

    if (passwordInput.value.length > 0) {
        passwordInput.classList.remove('is-invalid');
    } else {
        passwordInput.classList.add('is-invalid');
        valid = false;
    }

    loginButton.disabled = !valid;
    return valid;
}

function requestPermission(url, callback) {
    let permOrigin;
    try {
        const parsed = new URL(url);
        permOrigin = `${parsed.protocol}//${parsed.host}/`;
    } catch {
        if (callback) callback(false);
        return;
    }

    // Call request() synchronously from the click handler — no async
    // operations before it, or Firefox loses the user gesture context.
    chrome.permissions.request({ origins: [permOrigin] }).then(function(granted) {
        if (!granted) alert('Not granting this permission will make the extension unusable.');
        if (callback) callback(granted);
    }).catch(function(e) {
        console.error('Permission request failed:', e);
        if (callback) callback(false);
    });
}

function checkExistingSession() {
    loginButton.disabled = true;
    hideStatus();
    enableSpinner();
    isLoggedIn(function(loggedIn) {
        disableSpinner();
        if (loggedIn) {
            showSuccess();
        }
        loginButton.disabled = false;
    });
}

loginButton.onclick = function(ev) {
    ev.preventDefault();
    if (!validateForm()) return;

    loginButton.disabled = true;
    hideStatus();
    enableSpinner();

    const url = seerrUrlInput.value.replace(/\/+$/, '');
    requestPermission(url, function(granted) {
        if (!granted) {
            disableSpinner();
            showError('Permission denied for this URL');
            loginButton.disabled = false;
            return;
        }
        setSeerrUrl(url, function() {
            chrome.runtime.sendMessage({
                contentScriptQuery: 'login',
                username: usernameInput.value.trim(),
                password: passwordInput.value
            }, function(response) {
                disableSpinner();
                loginButton.disabled = false;
                if (response && response.success) {
                    showSuccess();
                    passwordInput.value = '';
                    showOverrides();
                } else {
                    showError((response && response.error) || 'Login failed');
                }
            });
        });
    });
};

$(document).ready(function(){
    $('[data-toggle="tooltip"]').tooltip();
});

seerrUrlInput.oninput = function() { hideStatus(); validateForm(); };
usernameInput.oninput = function() { hideStatus(); validateForm(); };
passwordInput.oninput = function() { hideStatus(); validateForm(); };

function populateSelect(select, items, valueKey, labelKey, savedValue) {
    select.innerHTML = '<option value="">Default</option>';
    items.forEach(function(item) {
        const option = document.createElement('option');
        option.value = item[valueKey];
        option.textContent = item[labelKey];
        if (String(item[valueKey]) === String(savedValue)) option.selected = true;
        select.appendChild(option);
    });
}

function loadServiceOptions(serviceType, serverSelect, qualitySelect, rootFolderSelect, savedOverrides) {
    chrome.runtime.sendMessage({
        contentScriptQuery: 'fetchServices',
        serviceType: serviceType
    }, function(response) {
        if (!response || !response.servers || response.servers.length === 0) return;

        const servers = response.servers;
        if (serviceType === 'radarr') radarrServers = servers;
        else sonarrServers = servers;

        populateSelect(serverSelect, servers, 'id', 'name', savedOverrides.serverId);
        populateSelect(qualitySelect, response.profiles, 'id', 'name', savedOverrides.profileId);
        populateSelect(rootFolderSelect, response.rootFolders, 'path', 'path', savedOverrides.rootFolder);
    });
}

function onServerChange(serviceType, serverId, qualitySelect, rootFolderSelect) {
    if (!serverId) {
        qualitySelect.innerHTML = '<option value="">Default</option>';
        rootFolderSelect.innerHTML = '<option value="">Default</option>';
        return;
    }
    chrome.runtime.sendMessage({
        contentScriptQuery: 'fetchServiceDetails',
        serviceType: serviceType,
        serverId: parseInt(serverId)
    }, function(response) {
        if (!response) return;
        populateSelect(qualitySelect, response.profiles || [], 'id', 'name', '');
        populateSelect(rootFolderSelect, response.rootFolders || [], 'path', 'path', '');
    });
}

movieServerSelect.onchange = function() {
    onServerChange('radarr', this.value, movieQualitySelect, movieRootFolderSelect);
};

tvServerSelect.onchange = function() {
    onServerChange('sonarr', this.value, tvQualitySelect, tvRootFolderSelect);
};

saveOverridesButton.onclick = function(ev) {
    ev.preventDefault();
    const movieOverrides = {};
    if (movieServerSelect.value) movieOverrides.serverId = parseInt(movieServerSelect.value);
    if (movieQualitySelect.value) movieOverrides.profileId = parseInt(movieQualitySelect.value);
    if (movieRootFolderSelect.value) movieOverrides.rootFolder = movieRootFolderSelect.value;

    const tvOverrides = {};
    if (tvServerSelect.value) tvOverrides.serverId = parseInt(tvServerSelect.value);
    if (tvQualitySelect.value) tvOverrides.profileId = parseInt(tvQualitySelect.value);
    if (tvRootFolderSelect.value) tvOverrides.rootFolder = tvRootFolderSelect.value;

    chrome.storage.sync.set({ movieOverrides: movieOverrides, tvOverrides: tvOverrides }, function() {
        overridesStatusOK.hidden = false;
        setTimeout(function() { overridesStatusOK.hidden = true; }, 3000);
    });
};

function showOverrides() {
    overridesSection.hidden = false;
    chrome.storage.sync.get(['movieOverrides', 'tvOverrides'], function(data) {
        const movieOverrides = data.movieOverrides || {};
        const tvOverrides = data.tvOverrides || {};
        loadServiceOptions('radarr', movieServerSelect, movieQualitySelect, movieRootFolderSelect, movieOverrides);
        loadServiceOptions('sonarr', tvServerSelect, tvQualitySelect, tvRootFolderSelect, tvOverrides);
    });
}

pullStoredData(function() {
    seerrUrlInput.value = seerrUrl || '';

    chrome.storage.sync.get(['seerrUsername'], function(data) {
        usernameInput.value = data.seerrUsername || '';
        validateForm();

        if (seerrUrl && userId) {
            checkExistingSession();
            showOverrides();
        }
    });
});
