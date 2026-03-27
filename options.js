let seerrUrlInput = document.getElementById('seerrUrl');
let usernameInput = document.getElementById('username');
let passwordInput = document.getElementById('password');
let spinnerDiv = document.getElementById('spinnerDiv');
let loginStatusOKDiv = document.getElementById('loginStatusOK');
let loginStatusKODiv = document.getElementById('loginStatusKO');
let loginErrorMessage = document.getElementById('loginErrorMessage');
let loginButton = document.getElementById('loginButton');


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
    chrome.permissions.contains({ origins: [permOrigin] }, function(result) {
        if (!result) {
            chrome.permissions.request({ origins: [permOrigin] }, function(granted) {
                if (!granted) {
                    alert('Not granting this permission will make the extension unusable.');
                }
                if (callback) callback(granted);
            });
        } else if (callback) {
            callback(true);
        }
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
    setSeerrUrl(url, function() {
        requestPermission(url, function(granted) {
            if (!granted) {
                disableSpinner();
                showError('Permission denied for this URL');
                loginButton.disabled = false;
                return;
            }
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

pullStoredData(function() {
    seerrUrlInput.value = seerrUrl || '';

    chrome.storage.sync.get(['seerrUsername'], function(data) {
        usernameInput.value = data.seerrUsername || '';
        validateForm();

        if (seerrUrl && userId) {
            checkExistingSession();
        }
    });
});
