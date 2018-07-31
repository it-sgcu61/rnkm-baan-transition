var config = require('../config');
var util = require('./util');

var acc = [];
var lock = 0;
var delay = config.batchSendInterval, cap = config.batchSendSize;



queryDTNL = async function (agent, reqs) {
    // reqs = {data: {...}, cb: callback}
    // call back with data of student of which 'tel' and 'nationalID' match the data
    let ids = reqs.map(x => x.data.id)
    var dtnlData = await agent.post(`http://${config.dtnlADDR}:80/api/v1/get/data/${config.rnkmTablename}/1`)
        .send({
            sortby: "",
            orderby: "",
            filter: JSON.stringify([{
                column_name: config.idColumn,
                expression: 'like',
                value: util.makeRegex(ids)
            }])
        })
        .withCredentials().catch((err) => { console.log(err); return { test: "omegalul" } })
    for (var i = 0; i < reqs.length; i++) {
        var { cb, data } = reqs[i];
        cb(dtnlData.body.body ? dtnlData.body.body.filter(x => x[config.telColumn] === data.tel) : [])
    }
}
query = async function (agent, data, cb) {
    // data = {id: 'xxxxxxxxxx', tel: '0xx-xxx-xxxx'}
    acc.push({ data: data, cb: cb });

    //  resolve immediately if theres at least cap(20) requests
    if (acc.length > cap) {
        to_resolve = acc.slice(0, cap); acc = acc.slice(cap);
        queryDTNL(agent, to_resolve);
    }
    // default : resolve after 2 secs
    if (lock === 0) {
        lock = 1;
        await util.sleep(delay);
        to_resolve = acc.slice(0, cap); acc = acc.slice(cap);
        queryDTNL(agent, to_resolve);
        lock = 0;
    }
}
module.exports = {
    query: query,
    queryDTNL: queryDTNL
}