/*globals define*/
/*jshint browser:true, jquery:true */

// Module nvidia/conformance
// Handle the conformance section properly.

define(
    ["tmpl!nvidia/templates/conformance.handlebars"],
    function (confoTmpl) {
        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "nvidia/conformance");
                var $confo = $("#conformance");
                if ($confo.length) $confo.prepend(confoTmpl(conf));
                msg.pub("end", "nvidia/conformance");
                cb();
            }
        };
    }
);
