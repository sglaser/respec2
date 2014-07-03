#!/usr/local/bin/node

var builder = require("./build-nvidia-common");

builder.buildNVIDIA(false, function () {
    console.log("Script built");
});
