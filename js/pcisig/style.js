
// Module pcisig/style
// Inserts a link to the appropriate PCISIG style for the specification's maturity level.
// CONFIGURATION
//  - specStatus: the short code for the specification's maturity level or type (required)

define(
    ["core/utils"],
    function (utils) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "pcisig/style");
                if (!conf.specStatus) msg.pub("error", "Configuration 'specStatus' is not set, required for pcisig/style");
                var statStyle = conf.specStatus;
                var css = "https://";
                if (statStyle === "unofficial") {
                    css += "sglaser.github.io/respec/StyleSheets/unofficial";
                }
                else if (statStyle === "base") {
                    css += "sglaser.github.io/respec/StyleSheets/base";
                }
                else {
                    css += "sglaser.github.io/respec/StyleSheets/pcisig-" + statStyle;
                }
                utils.linkCSS(doc, css);
                msg.pub("end", "pcisig/style");
                cb();
            }
        };
    }
);
