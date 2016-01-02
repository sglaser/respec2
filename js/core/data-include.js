/*jshint
    expr: true
*/

// Module core/data-include
// Support for the data-include attribute. Causes external content to be included inside an
// element that has data-include='some URI'. There is also a data-oninclude attribute that
// features a white space separated list of global methods that will be called with the
// module object, the content, and the included URI.
//
// IMPORTANT:
//  This module only really works when you are in an HTTP context, and will most likely
//  fail if you are editing your documents on your local drive. That is due to security
//  restrictions in the browser.
//  It is also important to note that this module performs synchronous requests (which is
//  required since subsequent modules need to apply to the included content) and can therefore
//  entail performance issues.

define(
    ["core/utils"],
    function (utils) {
        
        function filter_data(data, filter_string) {
            if (filter_string === null) return data;
            var filt = filter_string.trim().split(",");
            if (filt.length === 0) filt.push(".*");
            if (filt.length === 1) filt.push("===");
            if (filt.length === 2) filt.push("[,\\s]+");
            var match = false;
            var result = [];
            var chunks = data.split(new RegExp("^" + filt[1], "m"));
            var some_match = function(x) { return x.match("^" + filt[0] + "$"); };
            for (var i = 1; i < chunks.length; i++) {   // skip first chunk
                var nl = chunks[i].indexOf("\n");
                if (nl >= 0) {
                    match = chunks[i].substr(0,nl).trim().split(filt[2]).some(some_match);
                    if (match) result.push(chunks[i].substr(nl+1));
                }
            }
            return result.join("\n");
        }

        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/data-include");
                var $incs = $("[data-include]")
                ,   len = $incs.length
                ,   finish = function ($el) {
                        $el.removeAttr("data-include");
                        $el.removeAttr("data-oninclude");
                        $el.removeAttr("data-include-format");
                        $el.removeAttr("data-include-replace");
                        $el.removeAttr("data-include-sync");
                        $el.removeAttr("data-include-filter");
                        len--;
                        if (len <= 0) {
                            msg.pub("end", "core/data-include");
                            cb();
                        }
                    }
                ;
                if (!len) {
                    msg.pub("end", "core/data-include");
                    cb();
                }
                $incs.each(function () {
                    var $el = $(this)
                    ,   uri = $el.attr("data-include")
                    ,   format = $el.attr("data-include-format") || "html"
                    ,   replace = !!$el.attr("data-include-replace")
                    ,   sync = !!$el.attr("data-include-sync")
                    ,   filter = $el.attr("data-include-filter") || null
                    ;
                    if (!!conf.ajaxIsLocal) $.ajaxSetup({ isLocal: true});
                    conf.ajaxIsLocal = false;
                    $.ajax({
                        dataType:   format
                    ,   url:        uri
                    ,   async:      !sync
                    ,   success:    function (data) {
                            if (data) {
                                var flist = $el.attr("data-oninclude");
                                if (flist) data = utils.runTransforms(data, flist, uri);
                                if (filter) data = filter_data(data, filter);
                                if (replace) $el.replaceWith(format === "text" ? doc.createTextNode(data) : data);
                                else format === "text" ? $el.text(data) : $el.html(data);
                            }
                            finish($el);
                        }
                    ,   error:      function (xhr, status, error) {
                            msg.pub("error", "Error including URI=" + uri + ": " + status + " (" + error + ")");
                            finish($el);
                        }
                    });
                });
            }
        };
    }
);
