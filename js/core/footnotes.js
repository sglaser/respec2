/*global define */

/* jshint browser: true */

// Module core/footnotes
//  Handles footnotes.

// CONFIGURATION:

define(
    function () {
        "use strict";

        return {
            run:    function (conf, doc, cb, msg) {
                msg.pub("start", "core/footnotes");
                var $footnotes= $("span.footnote", doc);
                if ($footnotes.length) {
                    $footnotes.each(function(index) {
                        $(this).prepend("<span class='footnote-online'> [Footnote: </span>")
                            .append("<span class='footnote-online'>] </span>");
                        var id = "footnote-" + (index+1);
                        var span = "<span class='footnote-contents' id='footnote-" + (index+1) + "'></span>";
                        var input = "<input type='checkbox' name='footnote-" + (index+1) +
                                                       "' value='#footnote-" + (index+1) + "'></input>";
                        $(this).wrapInner(span)
                            .prepend(input);
                    });
                }
                msg.pub("end", "core/footnotes");
                cb();
            }
        };
    }
);
