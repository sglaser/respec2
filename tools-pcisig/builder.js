#!/usr/local/bin/node

var fs   = require("fs")
,   pth  = require("path")
,   r    = require("requirejs")
,   pkg  = JSON.parse(fs.readFileSync(pth.join(__dirname, "../package.json"), "utf-8"))
,   version = pkg.version
,   versionPCISIG = pkg.versionPCISIG
// ,   builds = pth.join(__dirname, "../builds")
// ,   versioned = pth.join(builds, "respec-common-" + versionPCISIG + ".js")
;

function gitToURL(url) {
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
                            "respecVersion = '" + version + "';\n" +
                            "respecVersionPCISIG = '" + versionPCISIG + "';\n" +
                            fs.readFileSync(config.out, "utf8") + "\nrequire(['profile-pcisig-common']);\n");
        }
        catch (e) {
            console.log("ERROR", e);
        }
        cb();
    });
}

exports.build = build;
