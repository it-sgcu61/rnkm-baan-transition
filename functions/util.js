exports.stringEscape = function (str){
    return (String(str) + '').replace(/[\\"']/g, '\\$&');
}

exports.verifyForm = function (form) {
    return true; // dummy function for now
}