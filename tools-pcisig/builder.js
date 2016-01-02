#!/usr/local/bin/node
/*jshint nonew:true, jquery:true, curly:true, noarg:true, forin:true, noempty:true, eqeqeq:true, strict:true, undef:true, bitwise:true, laxcomma:true, browser:true, devel:true */

var fs   = require("fs")
,   pth  = require("path")
,   r    = require("requirejs")
,   pkg  = JSON.parse(fs.readFileSync(pth.join(__dirname, "../package.json"), "utf-8"))
,   version = pkg.version
,   versionPCISIG = pkg.versionPCISIG
//,   versionNVIDIA = pkg.versionNVIDIA
// ,   builds = pth.join(__dirname, "../builds")
// ,   versioned = pth.join(builds, "respec-common-" + versionPCISIG + ".js")
// ,   versioned = pth.join(builds, "respec-common-" + versionNVIDIA + ".js")
;

function gitToURL(url) {
    "use strict";
    url = url.replace(/^git:/, "https:");
    url = url.replace(/\.git$/, "");
    return url;
}
// options:
//  optimize:   none || uglify || uglify2
//  out:        /path/to/output
function build (options, cb) {
    // optimisation settings
    // note that the paths/includes below will need to change in when we drop those
    // older dependencies
    "use strict";
    version = options.version || version;
    var config = {
        baseUrl:    pth.join(__dirname, "../js")
    ,   optimize:   options.optimize || "uglify2"
    ,   paths:  {
            requireLib: "./require"
        }
    ,   shim:   {
            "shortcut": {
                exports:    "shortcut"
            }
        }
    ,   name:       "profile-pcisig-common"
    //,   name:       "profile-nvidia-common"
    ,   include:    "requireLib".split(" ")
    ,   out:        options.out
    ,   inlineText: true
    ,   preserveLicenseComments:    false
    };
    r.optimize(config, function () {
        // add header
        try {
            fs.writeFileSync(config.out
                        ,   "/* ReSpec " + version +
                            " - Robin Berjon, http://berjon.com/ (@robinberjon) */\n" +
                            "/* Documentation: http://w3.org/respec/. */\n" +
                            "/* See original source for licenses: " + gitToURL(pkg.repository.url) + " */\n" +
                            "/* See also PCISIG source: " + gitToURL(pkg.repositoryPCISIG.url) + " */\n" +
//                            "/* See also NVIDIA source: " + gitToURL(pkg.repositoryNVIDIA.url) + " */\n" +
                            "respecVersion = '" + version + "';\n" +
                            "respecVersionPCISIG = '" + versionPCISIG + "';\n" +
//                            "respecVersionNVIDIA = '" + versionNVIDIA + "';\n" +
                            fs.readFileSync(config.out, "utf8") + "\nrequire(['profile-pcisig-common']);\n");
     //                       fs.readFileSync(config.out, "utf8") + "\nrequire(['profile-nvidia-common']);\n");
        }
        catch (e) {
            console.log("ERROR", e);
        }
        cb();
    });
}

exports.build = build;
