exports.stringEscape = function (str){
    return (String(str) + '').replace(/[\\"']/g,
     '\\$&');
}
exports.makeUrl = function (str: string) {
    return str.slice(0, 5) + '/' + str.slice(5);
}