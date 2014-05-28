#!/usr/local/bin/node

var builder = require("./build-pcisig-common");

builder.buildPCISIG(false, function () {
    console.log("Script built");
});
