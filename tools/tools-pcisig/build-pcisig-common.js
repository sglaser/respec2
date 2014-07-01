#!/usr/local/bin/node

var fs   = require("fs")
,   pth  = require("path")
,   b    = require("./builder")
,   version = JSON.parse(fs.readFileSync(pth.join(__dirname, "../package.json"), "utf-8")).versionPCISIG
,   builds = pth.join(__dirname, "../builds")
,   latest = pth.join(builds, "respec-pcisig-common.js")
;

function buildPCISIG (versionSnapshot, cb) {
    var opts = { out: latest };
    if (versionSnapshot === true) {
        opts.version = version;
    }
    else if (typeof versionSnapshot === "string") {
        opts.version = versionSnapshot;
    }
    var versioned = pth.join(builds, "respec-pcisig-common-" + opts.version + ".js");
    b.build(opts, function () {
        if (versionSnapshot) fs.writeFileSync(versioned, fs.readFileSync(latest, "utf8"), { encoding: "utf8" });
        cb();
    });
}

if (require.main === module) {
    buildPCISIG(true, function () {
        console.log("OK!");
    });
}

exports.buildPCISIG = buildPCISIG;
