/*globals define */
/*jshint browser: true */

// Module nvidia/style
// Inserts a link to the appropriate Nvidia style for the specification's maturity level.
// CONFIGURATION
//  - specStatus: the short code for the specification's maturity level or type (required)

define(
    ["core/utils"/*,
     "text!../../stylesheets/unofficial.css"*/],
    function (utils/*, inlinecss*/) {
        "use strict";
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "nvidia/style");
                if (!conf.specStatus) msg.pub("error", "Configuration 'specStatus' is not set, required for nvidia/style");
                var statStyle = conf.specStatus;
                var css = "https://";
//                if (statStyle === "unofficial") {
                css += "sglaser.github.io/";
                css += "respec/stylesheets/unofficial.css";
//                css = "respec/stylesheets/unofficial.css";
//                }
//                else if (statStyle === "base") {
//                    css += "sglaser.github.io/respec/stylesheets/base.css";
//                }
//                else {
//                    css += "sglaser.github.io/respec/stylesheets/nvidia-" + statStyle + ".css";
//                }
                utils.linkCSS(doc, css);
//                $("<style/>").appendTo($("head", $(doc))).text(inlinecss);
//                console.log("inlinecss.length = " + inlinecss.length);

                msg.pub("end", "nvidia/style");
                cb();
            }
        };
    }
);
