# rnkm-baan-transition
Baan transition system with NodeJS x Firebase x DatanaliEZ

# How to use
send request to `https://us-central1-rnkm2018-house-ad25ge.cloudfunctions.net/<function name>` 

# Functions
telephone number is used as **username** and idcard number is used as **password**


| Function | Request Method | Params | Description |
|---|---|---|---|
|getHouses| GET| | Returns *count* and *capacity* of people in each house|
|getPersonInfo| POST| username, token| Returns Personal info from DTNL|
|movePerson| POST | username, house, token| Change person's house to specified house, if possible; return JSON indicating whether operation is success|
|confirmHouse| POST | username, token | Confirm(lock) user's house and send house to DTNL|
|login| POST | username, password | Returns token to be used by other functions|
|register| POST | formData (JSON), adminKey | Register new person (failed if house is full)|
|ADMIN_lockall| POST | adminKey | Confirm all people's house (and send to DTNL)|


