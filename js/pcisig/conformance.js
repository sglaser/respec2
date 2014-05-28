
// Module pcisig/conformance
// Handle the conformance section properly.

define(
    ["tmpl!pcisig/templates/conformance.handlebars"],
    function (confoTmpl) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "pcisig/conformance");
                var $confo = $("#conformance");
                if ($confo.length) $confo.prepend(confoTmpl(conf));
                msg.pub("end", "pcisig/conformance");
                cb();
            }
        };
    }
);
