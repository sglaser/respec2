
// Module pcisig/style
// Inserts a link to the appropriate PCISIG style for the specification's maturity level.
// CONFIGURATION
//  - specStatus: the short code for the specification's maturity level or type (required)

define(
    ["core/utils"/*,
     "text!../../stylesheets/unofficial.css"*/],
    function (utils/*, inlinecss*/) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "pcisig/style");
                if (!conf.specStatus) msg.pub("error", "Configuration 'specStatus' is not set, required for pcisig/style");
                var statStyle = conf.specStatus;
                var css = "https://";
//                if (statStyle === "unofficial") {
                css += "sglaser.github.io/";
                css += "respec/stylesheets/unofficial.css";
//                }
//                else if (statStyle === "base") {
//                    css += "sglaser.github.io/respec/stylesheets/base.css";
//                }
//                else {
//                    css += "sglaser.github.io/respec/stylesheets/pcisig-" + statStyle + ".css";
//                }
                utils.linkCSS(doc, css);
//                $("<style/>").appendTo($("head", $(doc))).text(inlinecss);
//                console.log("inlinecss.length = " + inlinecss.length);

                msg.pub("end", "pcisig/style");
                cb();
            }
        };
    }
);
