/*globals define*/
/*jshint browser:true, jquery:true, laxcomma:true */

// Module core/structure
//  Handles producing the ToC and numbering sections across the document.

// CONFIGURATION:
//  - noTOC: if set to true, no TOC is generated and sections are not numbered
//  - tocIntroductory: if set to true, the introductory material is listed in the TOC
//  - lang: can change the generated text (supported: en, fr)
//  - maxTocLevel: only generate a TOC so many levels deep

define(
    ["core/utils"],
    function (utils) {
        "use strict";
        return {
            run: function (conf, doc, cb, msg) {
                msg.pub("start", "core/xref-map");
                if (!!conf.addXrefMap) {
                    var $refs = $("a.tocxref", doc);
                    if ($refs.length > 0) {
                        var $mapsec = $("<section id='xref-map' class='introductory appendix'><h2>Section, Figure and Table ID Map</h2></section>").appendTo($("body"));
                        var $tbody = $("<table class='data'><thead><tr><th>Number</th><th>Name</th><th>ID</th></tr></thead><tbody/></table>").appendTo($mapsec).children("tbody");

                        $refs.each(function() {
                            var number = ($(".secno, .figno, .tblno", this).text()
                                          .replace(/ /g,"&nbsp;").replace(/-/g,"&#8209;"));
                            var id = $(this).attr("href");
                            var name = $(".sectitle, .figtitle, .tbltitle", this).text();
                            $("<tr><td>" + number + "</td>" +
                              "<td class='long'>" + name + "</td>" +
                              "<td class='long'><a href=\"" + id + "\">" + id.substr(1) + "</a></td></tr>").appendTo($tbody);
                        });
                    }
                }
                msg.pub("end", "core/structure");
                cb();
            }
        };
    }
);