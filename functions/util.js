exports.stringEscape = function (str){
    return (String(str) + '').replace(/[\\"']/g, '\\$&');
}