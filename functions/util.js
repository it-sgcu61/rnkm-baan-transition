exports.stringEscape = function (str){
    return (String(str) + '').replace(/[\\"']/g, '\\$&');
}

exports.veriyForm = function(form){
    return true; // dummy function for now
}