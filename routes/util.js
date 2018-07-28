
function esc(str) { // escape string for regex
    return str.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&");
}

function makeRegex(array) {
    return '^' + array.map(x => `(${esc(x)})`).join('|') + '$';
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function makeResponse(success, message = null, data = {}) {
    return {
        success: success,
        message: message === null ? (success ? 'OK' : 'Failed') : message,
        data: data
    };
}

module.exports = {
    esc: esc,
    makeRegex: makeRegex,
    sleep: sleep,
    makeResponse: makeResponse
}