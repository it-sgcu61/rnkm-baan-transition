var config = require('../config');
var util = require('./util');


var query = async function (agent, house) {
    try {
        var dtnlData = await agent.post(`http://${config.dtnlADDR}/api/v1/get/data/${config.rnkmTablename}/1`)
            .send({
                sortby: "",
                orderby: "",
                filter: JSON.stringify([{
                    column_name: config.houseColumn,
                    expression: 'like',
                    value: `^${house}$`
                }])
            })
        return Promise.resolve(dtnlData.body.count);
    }
    catch (err) {
        return Promise.reject(err);
    }
}
module.exports = query
