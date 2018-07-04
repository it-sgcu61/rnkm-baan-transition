exports.stringEscape = function (str){
    return (str + '').replace(/[\\"']/g, '\\$&');
}