/*globals define */
/*jshint browser: true */

// Module nvidia/style
// Inserts a link to the appropriate Nvidia style for the specification's maturity level.
// CONFIGURATION
//  - specStatus: the short code for the specification's maturity level or type (required)

define(
    ["core/utils"/*,
     "text!../../stylesheets/unofficial-nvidia.css"*/],
    function (utils/*, inlinecss*/) {
        "use strict";
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "nvidia/style");
                if (!conf.specStatus) msg.pub("error", "Configuration 'specStatus' is not set, required for nvidia/style");
                var statStyle = conf.specStatus;
                var css = "https://";
                css += "sglaser.github.io/";
                css += "respec/stylesheets/unofficial-nvidia.css";
                if (conf.cssOverride) {
                    css = conf.cssOverride;
                }
                utils.linkCSS(doc, css);
//                $("<style/>").appendTo($("head", $(doc))).text(inlinecss);
//                console.log("inlinecss.length = " + inlinecss.length);

                msg.pub("end", "nvidia/style");
                cb();
            }
        };
    }
);
